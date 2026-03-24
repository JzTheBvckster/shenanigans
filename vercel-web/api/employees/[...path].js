const { db } = require("../../lib/firebase");
const { requireSession } = require("../../lib/session");
const { withSecurity } = require("../../lib/security");
const {
    getActorContext,
    canAccessDepartment,
    isManagingDirector,
    isProjectManager,
    isEmployee,
} = require("../../lib/access");
const { isValidDocId } = require("../../lib/sanitize");

const COLLECTION = "employees";

module.exports = withSecurity(async function handler(req, res) {
    const session = await requireSession(req, res);
    if (!session) return;

    const actor = await getActorContext(session);

    if (isEmployee(actor) && req.method !== "GET") {
        return res.status(403).json({ ok: false, error: "Access denied for employee role." });
    }

    const method = req.method;

    // Extract ID from path: /api/employees/[id]
    const segments = (req.url || "").split("/").filter(Boolean);
    // segments: ["api", "employees", "<id>?"]
    const entityId = segments.length >= 3 ? decodeURIComponent(segments[2].split("?")[0]) : null;
    if (entityId && !isValidDocId(entityId)) {
        return res.status(400).json({ ok: false, error: "Invalid employee ID." });
    }

    // Parse query params — prefer req.query (Vercel injects it), fallback to URL parsing
    const query = req.query || {};
    if (!Object.keys(query).length) {
        try {
            const urlObj = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
            for (const [k, v] of urlObj.searchParams) query[k] = v;
        } catch (_) { /* ignore parse errors */ }
    }

    switch (method) {
        case "GET": {
            // Pending user registrations from 'users' collection
            if (query.pendingUsers === "true") {
                if (!isManagingDirector(actor) && !isProjectManager(actor)) {
                    return res.status(403).json({ ok: false, error: "Access denied." });
                }
                const snap = await db.collection("users").get();
                let pending = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                if (pending.some((u) => !u.department)) {
                    const employeeDocs = await Promise.all(
                        pending.map((u) => db.collection(COLLECTION).doc(u.id).get())
                    );
                    pending = pending.map((u, i) => {
                        const d = employeeDocs[i];
                        if (u.department || !d.exists) return u;
                        const employee = d.data() || {};
                        return { ...u, department: employee.department || "" };
                    });
                }
                if (isManagingDirector(actor)) {
                    pending = pending.filter((u) =>
                        u.role !== "MANAGING_DIRECTOR" && u.mdApproved !== true
                    );
                } else {
                    pending = pending.filter((u) =>
                        u.role === "EMPLOYEE"
                        && u.mdApproved === true
                        && u.pmApproved !== true
                        && canAccessDepartment(actor, u.department)
                    );
                }
                return res.status(200).json({ ok: true, data: pending });
            }

            // All registered users (MD only)
            if (query.allUsers === "true") {
                if (!isManagingDirector(actor)) {
                    return res.status(403).json({ ok: false, error: "Access denied." });
                }
                const snap = await db.collection("users").get();
                const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                users.sort((a, b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || "", undefined, { sensitivity: "base" }));
                return res.status(200).json({ ok: true, data: users });
            }

            // Project managers (approved users with PM role) — accessible to MD + PM
            if (query.projectManagers === "true") {
                if (isEmployee(actor)) {
                    return res.status(403).json({ ok: false, error: "Access denied." });
                }
                const snap = await db.collection("users").where("role", "==", "PROJECT_MANAGER").get();
                let pms = snap.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .filter((u) => u.mdApproved === true);

                if (pms.some((u) => !u.department)) {
                    const employeeDocs = await Promise.all(
                        pms.map((u) => db.collection(COLLECTION).doc(u.id).get())
                    );
                    pms = pms.map((u, i) => {
                        const d = employeeDocs[i];
                        if (u.department || !d.exists) return u;
                        const employee = d.data() || {};
                        return { ...u, department: employee.department || "" };
                    });
                }

                if (!isManagingDirector(actor)) {
                    pms = pms.filter((u) => canAccessDepartment(actor, u.department));
                }
                pms.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "", undefined, { sensitivity: "base" }));
                return res.status(200).json({ ok: true, data: pms });
            }

            const snapshot = await db.collection(COLLECTION).get();
            let employees = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            if (!isManagingDirector(actor)) {
                employees = employees.filter((e) => canAccessDepartment(actor, e.department));
            }
            employees.sort((a, b) =>
                (a.firstName || "").localeCompare(b.firstName || "", undefined, { sensitivity: "base" })
            );
            return res.status(200).json({ ok: true, data: employees });
        }

        case "POST": {
            if (!isManagingDirector(actor)) {
                return res.status(403).json({ ok: false, error: "Only Managing Directors can create employees." });
            }
            const body = req.body || {};
            if (!body.firstName) {
                return res.status(400).json({ ok: false, error: "Employee first name is required." });
            }
            const now = Date.now();
            body.createdAt = now;
            body.updatedAt = now;
            if (!body.status) body.status = "ACTIVE";
            const docRef = await db.collection(COLLECTION).add(body);
            return res.status(201).json({ ok: true, data: { id: docRef.id, ...body } });
        }

        case "PUT": {
            // Bulk MD approval of pending users
            if (query.bulkApproveUsers === "true") {
                if (!isManagingDirector(actor)) {
                    return res.status(403).json({ ok: false, error: "Access denied." });
                }
                const body = req.body || {};
                const userIds = Array.isArray(body.userIds) ? body.userIds.filter((id) => isValidDocId(id)) : [];
                if (userIds.length === 0) {
                    return res.status(400).json({ ok: false, error: "At least one valid user ID is required." });
                }

                const now = Date.now();
                const batch = db.batch();
                const approvedIds = [];
                const userDocs = await Promise.all(userIds.map((id) => db.collection("users").doc(id).get()));
                userDocs.forEach((doc) => {
                    if (!doc.exists) return;
                    const user = doc.data() || {};
                    if (user.role === "MANAGING_DIRECTOR" || user.mdApproved === true) return;
                    const update = {
                        mdApproved: true,
                        approvedAt: now,
                        approvedByUid: session.user.uid || "",
                        updatedAt: now,
                    };
                    if (user.role !== "EMPLOYEE") {
                        update.pmApproved = true;
                    }
                    batch.update(doc.ref, update);
                    approvedIds.push(doc.id);
                });

                if (approvedIds.length === 0) {
                    return res.status(200).json({ ok: true, data: { approvedCount: 0, approvedIds: [] } });
                }

                await batch.commit();
                try {
                    await writeApprovalAuditLog({
                        action: "BULK_MD_APPROVAL",
                        actor,
                        sessionUser: session.user,
                        targetId: "",
                        targetName: "",
                        department: "",
                        details: `Managing Director approved ${approvedIds.length} user account(s) in bulk.`,
                    });
                } catch (_) { /* non-blocking audit log */ }
                return res.status(200).json({
                    ok: true,
                    data: { approvedCount: approvedIds.length, approvedIds },
                });
            }

            // Bulk PM approval of MD-approved employees in PM's department
            if (query.pmApproveUsers === "true") {
                if (!isProjectManager(actor)) {
                    return res.status(403).json({ ok: false, error: "Access denied." });
                }
                const body = req.body || {};
                const userIds = Array.isArray(body.userIds) ? body.userIds.filter((id) => isValidDocId(id)) : [];
                if (userIds.length === 0) {
                    return res.status(400).json({ ok: false, error: "At least one valid user ID is required." });
                }

                const now = Date.now();
                const batch = db.batch();
                const approvedIds = [];
                const userDocs = await Promise.all(userIds.map((id) => db.collection("users").doc(id).get()));
                userDocs.forEach((doc) => {
                    if (!doc.exists) return;
                    const user = doc.data() || {};
                    if (user.role !== "EMPLOYEE") return;
                    if (user.mdApproved !== true || user.pmApproved === true) return;
                    if (!canAccessDepartment(actor, user.department)) return;
                    batch.update(doc.ref, {
                        pmApproved: true,
                        pmApprovedAt: now,
                        pmApprovedByUid: session.user.uid || "",
                        updatedAt: now,
                    });
                    approvedIds.push(doc.id);
                });

                if (approvedIds.length === 0) {
                    return res.status(200).json({ ok: true, data: { approvedCount: 0, approvedIds: [] } });
                }

                await batch.commit();
                try {
                    await writeApprovalAuditLog({
                        action: "BULK_PM_APPROVAL",
                        actor,
                        sessionUser: session.user,
                        targetId: "",
                        targetName: "",
                        department: actor.department || "",
                        details: `Project Manager approved ${approvedIds.length} employee account(s) in bulk for department ${actor.department || "N/A"}.`,
                    });
                } catch (_) { /* non-blocking audit log */ }
                return res.status(200).json({
                    ok: true,
                    data: { approvedCount: approvedIds.length, approvedIds },
                });
            }

            // Approve a user registration (updates 'users' collection)
            if (query.approveUser === "true") {
                if (!entityId) {
                    return res.status(400).json({ ok: false, error: "User ID is required in path." });
                }
                if (!isManagingDirector(actor) && !isProjectManager(actor)) {
                    return res.status(403).json({ ok: false, error: "Access denied." });
                }
                const ref = db.collection("users").doc(entityId);
                const doc = await ref.get();
                if (!doc.exists) {
                    return res.status(404).json({ ok: false, error: "User not found." });
                }
                const user = doc.data() || {};
                const now = Date.now();

                if (isManagingDirector(actor)) {
                    if (user.role === "MANAGING_DIRECTOR") {
                        return res.status(400).json({ ok: false, error: "Managing Director accounts do not require approval." });
                    }
                    const update = {
                        mdApproved: true,
                        approvedAt: now,
                        approvedByUid: session.user.uid || "",
                        updatedAt: now,
                    };
                    if (user.role !== "EMPLOYEE") {
                        update.pmApproved = true;
                    }
                    await ref.update(update);
                    try {
                        await writeApprovalAuditLog({
                            action: "MD_APPROVAL",
                            actor,
                            sessionUser: session.user,
                            targetId: entityId,
                            targetName: user.displayName || user.email || entityId,
                            department: user.department || "",
                            details: `Managing Director approved ${user.displayName || user.email || "user"} (${user.role || "UNKNOWN"}).`,
                        });
                    } catch (_) { /* non-blocking audit log */ }
                } else {
                    if (user.role !== "EMPLOYEE") {
                        return res.status(400).json({ ok: false, error: "Only employee accounts require PM approval." });
                    }
                    if (user.mdApproved !== true) {
                        return res.status(400).json({ ok: false, error: "Managing Director approval is required first." });
                    }
                    if (!canAccessDepartment(actor, user.department)) {
                        return res.status(403).json({ ok: false, error: "Cannot approve employee outside your department." });
                    }
                    await ref.update({
                        pmApproved: true,
                        pmApprovedAt: now,
                        pmApprovedByUid: session.user.uid || "",
                        updatedAt: now,
                    });
                    try {
                        await writeApprovalAuditLog({
                            action: "PM_APPROVAL",
                            actor,
                            sessionUser: session.user,
                            targetId: entityId,
                            targetName: user.displayName || user.email || entityId,
                            department: user.department || actor.department || "",
                            details: `Project Manager approved employee ${user.displayName || user.email || "user"}.`,
                        });
                    } catch (_) { /* non-blocking audit log */ }
                }
                return res.status(200).json({ ok: true, data: { id: entityId } });
            }

            if (!entityId) {
                return res.status(400).json({ ok: false, error: "Employee ID is required in path." });
            }

            // Update user role (MD only, updates 'users' collection)
            if (query.updateRole === "true") {
                if (!isManagingDirector(actor)) {
                    return res.status(403).json({ ok: false, error: "Access denied." });
                }
                const body = req.body || {};
                const validRoles = ["EMPLOYEE", "PROJECT_MANAGER", "MANAGING_DIRECTOR"];
                if (!body.role || !validRoles.includes(body.role)) {
                    return res.status(400).json({ ok: false, error: "Valid role is required." });
                }
                await db.collection("users").doc(entityId).update({
                    role: body.role,
                    mdApproved: body.role === "MANAGING_DIRECTOR",
                    pmApproved: body.role === "EMPLOYEE" ? false : true,
                    updatedAt: Date.now(),
                });
                return res.status(200).json({ ok: true, data: { id: entityId, role: body.role } });
            }

            if (!isManagingDirector(actor)) {
                return res.status(403).json({ ok: false, error: "Only Managing Directors can update employees." });
            }

            const body = req.body || {};
            body.updatedAt = Date.now();
            delete body.id;
            delete body.role;
            delete body.mdApproved;
            delete body.uid;
            await db.collection(COLLECTION).doc(entityId).update(body);
            return res.status(200).json({ ok: true, data: { id: entityId } });
        }

        case "DELETE": {
            if (!entityId) {
                return res.status(400).json({ ok: false, error: "Employee ID is required in path." });
            }
            if (!isManagingDirector(actor)) {
                return res.status(403).json({ ok: false, error: "Only Managing Directors can delete employees." });
            }
            await db.collection(COLLECTION).doc(entityId).delete();
            return res.status(200).json({ ok: true });
        }

        default:
            res.setHeader("Allow", "GET, POST, PUT, DELETE");
            return res.status(405).json({ ok: false, error: "Method not allowed." });
    }
}, { maxRequests: 30 });

async function writeApprovalAuditLog({ action, actor, sessionUser, targetId, targetName, department, details }) {
    const now = Date.now();
    await db.collection("activity_logs").add({
        action: action || "MD_APPROVAL",
        entityType: "approval",
        entityId: targetId || "",
        entityName: targetName || "",
        projectId: "",
        details: details || "",
        department: department || actor.department || "",
        userId: (sessionUser && sessionUser.uid) || actor.uid || "",
        userName: (sessionUser && (sessionUser.displayName || sessionUser.email)) || actor.displayName || actor.email || "",
        userRole: actor.role || (sessionUser && sessionUser.role) || "",
        createdAt: now,
        updatedAt: now,
    });
}
