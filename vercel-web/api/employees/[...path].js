const { db } = require("../../lib/firebase");
const { requireSession } = require("../../lib/session");
const { withSecurity } = require("../../lib/security");

const COLLECTION = "employees";

module.exports = withSecurity(async function handler(req, res) {
    const session = await requireSession(req, res);
    if (!session) return;

    if (session.user.role === "EMPLOYEE" && req.method !== "GET") {
        return res.status(403).json({ ok: false, error: "Access denied for employee role." });
    }

    const method = req.method;

    // Extract ID from path: /api/employees/[id]
    const segments = (req.url || "").split("/").filter(Boolean);
    // segments: ["api", "employees", "<id>?"]
    const entityId = segments.length >= 3 ? decodeURIComponent(segments[2].split("?")[0]) : null;

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
            // Pending user registrations from 'users' collection (MD only)
            if (query.pendingUsers === "true") {
                if (session.user.role !== "MANAGING_DIRECTOR") {
                    return res.status(403).json({ ok: false, error: "Access denied." });
                }
                const snap = await db.collection("users").get();
                const pending = snap.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .filter((u) => u.mdApproved === false || (u.mdApproved !== true && u.role !== "MANAGING_DIRECTOR"));
                return res.status(200).json({ ok: true, data: pending });
            }

            // All registered users (MD only)
            if (query.allUsers === "true") {
                if (session.user.role !== "MANAGING_DIRECTOR") {
                    return res.status(403).json({ ok: false, error: "Access denied." });
                }
                const snap = await db.collection("users").get();
                const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                users.sort((a, b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || "", undefined, { sensitivity: "base" }));
                return res.status(200).json({ ok: true, data: users });
            }

            // Project managers (approved users with PM role) — accessible to MD + PM
            if (query.projectManagers === "true") {
                if (session.user.role === "EMPLOYEE") {
                    return res.status(403).json({ ok: false, error: "Access denied." });
                }
                const snap = await db.collection("users").where("role", "==", "PROJECT_MANAGER").get();
                const pms = snap.docs
                    .map((d) => ({ id: d.id, ...d.data() }))
                    .filter((u) => u.mdApproved === true);
                pms.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "", undefined, { sensitivity: "base" }));
                return res.status(200).json({ ok: true, data: pms });
            }

            const snapshot = await db.collection(COLLECTION).get();
            const employees = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            employees.sort((a, b) =>
                (a.firstName || "").localeCompare(b.firstName || "", undefined, { sensitivity: "base" })
            );
            return res.status(200).json({ ok: true, data: employees });
        }

        case "POST": {
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
            if (!entityId) {
                return res.status(400).json({ ok: false, error: "Employee ID is required in path." });
            }

            // Approve a user registration (updates 'users' collection)
            if (query.approveUser === "true") {
                if (session.user.role !== "MANAGING_DIRECTOR") {
                    return res.status(403).json({ ok: false, error: "Access denied." });
                }
                await db.collection("users").doc(entityId).update({
                    mdApproved: true,
                    approvedAt: Date.now(),
                    approvedByUid: session.user.uid || "",
                });
                return res.status(200).json({ ok: true, data: { id: entityId } });
            }

            // Update user role (MD only, updates 'users' collection)
            if (query.updateRole === "true") {
                if (session.user.role !== "MANAGING_DIRECTOR") {
                    return res.status(403).json({ ok: false, error: "Access denied." });
                }
                const body = req.body || {};
                const validRoles = ["EMPLOYEE", "PROJECT_MANAGER", "MANAGING_DIRECTOR"];
                if (!body.role || !validRoles.includes(body.role)) {
                    return res.status(400).json({ ok: false, error: "Valid role is required." });
                }
                await db.collection("users").doc(entityId).update({
                    role: body.role,
                    updatedAt: Date.now(),
                });
                return res.status(200).json({ ok: true, data: { id: entityId, role: body.role } });
            }

            const body = req.body || {};
            body.updatedAt = Date.now();
            delete body.id;
            await db.collection(COLLECTION).doc(entityId).update(body);
            return res.status(200).json({ ok: true, data: { id: entityId } });
        }

        case "DELETE": {
            if (!entityId) {
                return res.status(400).json({ ok: false, error: "Employee ID is required in path." });
            }
            await db.collection(COLLECTION).doc(entityId).delete();
            return res.status(200).json({ ok: true });
        }

        default:
            res.setHeader("Allow", "GET, POST, PUT, DELETE");
            return res.status(405).json({ ok: false, error: "Method not allowed." });
    }
}, { maxRequests: 30 });
