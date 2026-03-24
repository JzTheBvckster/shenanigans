const { db } = require("../../lib/firebase");
const { requireSession } = require("../../lib/session");
const { withSecurity } = require("../../lib/security");
const {
    getActorContext,
    canAccessDepartment,
    isManagingDirector,
    isEmployee,
    isProjectManager,
} = require("../../lib/access");
const { isValidDocId } = require("../../lib/sanitize");

const COLLECTION = "projects";
const ALLOWED_PROJECT_STATUSES = new Set([
    "PENDING_APPROVAL",
    "PLANNING",
    "IN_PROGRESS",
    "ON_HOLD",
    "COMPLETED",
    "ARCHIVED",
]);

const STATUS_TRANSITIONS = {
    PENDING_APPROVAL: new Set(["PENDING_APPROVAL", "PLANNING", "IN_PROGRESS", "ON_HOLD", "ARCHIVED"]),
    PLANNING: new Set(["PLANNING", "IN_PROGRESS", "ON_HOLD", "ARCHIVED"]),
    IN_PROGRESS: new Set(["IN_PROGRESS", "ON_HOLD", "COMPLETED", "ARCHIVED"]),
    ON_HOLD: new Set(["ON_HOLD", "PLANNING", "IN_PROGRESS", "ARCHIVED"]),
    COMPLETED: new Set(["COMPLETED", "ARCHIVED"]),
    ARCHIVED: new Set(["ARCHIVED"]),
};

function normalizeTeamMemberIds(ids) {
    if (!Array.isArray(ids)) return [];
    const unique = new Set();
    for (const raw of ids) {
        const id = String(raw || "").trim();
        if (!id) continue;
        if (!isValidDocId(id)) return null;
        unique.add(id);
    }
    return Array.from(unique);
}

function parseNonNegativeNumber(value, fallback = 0) {
    if (value === undefined || value === null || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function parsePercent(value, fallback = 0) {
    if (value === undefined || value === null || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : NaN;
}

function parsePositiveTimestampOrZero(value) {
    if (value === undefined || value === null || value === "") return 0;
    const ts = Number(value);
    return Number.isFinite(ts) && ts > 0 ? ts : NaN;
}

module.exports = withSecurity(async function handler(req, res) {
    const session = await requireSession(req, res);
    if (!session) return;

    const actor = await getActorContext(session);

    if (isEmployee(actor) && req.method !== "GET") {
        return res.status(403).json({ ok: false, error: "Access denied for employee role." });
    }

    const method = req.method;
    const segments = (req.url || "").split("/").filter(Boolean);
    const entityId = segments.length >= 3 ? decodeURIComponent(segments[2].split("?")[0]) : null;
    if (entityId && !isValidDocId(entityId)) {
        return res.status(400).json({ ok: false, error: "Invalid project ID." });
    }

    switch (method) {
        case "GET": {
            const snapshot = await db.collection(COLLECTION).get();
            let projects = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            if (!isManagingDirector(actor)) {
                projects = projects.filter((p) => canAccessDepartment(actor, p.department));
            }
            return res.status(200).json({ ok: true, data: projects });
        }

        case "POST": {
            if (!(isManagingDirector(actor) || isProjectManager(actor))) {
                return res.status(403).json({ ok: false, error: "Access denied." });
            }
            const body = req.body || {};
            if (!body.name) {
                return res.status(400).json({ ok: false, error: "Project name is required." });
            }

            if (!body.department && isManagingDirector(actor)) {
                return res.status(400).json({ ok: false, error: "Department is required." });
            }

            const budget = parseNonNegativeNumber(body.budget, 0);
            const spent = parseNonNegativeNumber(body.spent, 0);
            const completionPercentage = parsePercent(body.completionPercentage, 0);
            const startDate = parsePositiveTimestampOrZero(body.startDate);
            const endDate = parsePositiveTimestampOrZero(body.endDate);
            if (Number.isNaN(budget) || Number.isNaN(spent)) {
                return res.status(400).json({ ok: false, error: "Budget and spent must be non-negative numbers." });
            }
            if (Number.isNaN(completionPercentage)) {
                return res.status(400).json({ ok: false, error: "completionPercentage must be between 0 and 100." });
            }
            if (Number.isNaN(startDate) || Number.isNaN(endDate)) {
                return res.status(400).json({ ok: false, error: "Invalid project dates." });
            }
            if (endDate && startDate && endDate < startDate) {
                return res.status(400).json({ ok: false, error: "endDate must be on or after startDate." });
            }
            if (spent > budget && budget > 0) {
                return res.status(400).json({ ok: false, error: "spent cannot exceed budget." });
            }

            const normalizedTeamMemberIds = normalizeTeamMemberIds(body.teamMemberIds || []);
            if (normalizedTeamMemberIds === null) {
                return res.status(400).json({ ok: false, error: "teamMemberIds contains invalid IDs." });
            }

            const requestedStatus = String(body.status || "PLANNING").toUpperCase();
            if (!ALLOWED_PROJECT_STATUSES.has(requestedStatus)) {
                return res.status(400).json({ ok: false, error: "Invalid project status." });
            }
            if (!isManagingDirector(actor) && requestedStatus === "ARCHIVED") {
                return res.status(403).json({ ok: false, error: "Only Managing Directors can archive projects." });
            }

            body.teamMemberIds = normalizedTeamMemberIds;
            body.budget = budget;
            body.spent = spent;
            body.completionPercentage = completionPercentage;
            body.startDate = startDate || 0;
            body.endDate = endDate || 0;
            body.status = requestedStatus;

            if (!isManagingDirector(actor)) {
                if (!actor.department) {
                    return res.status(403).json({ ok: false, error: "Department not configured for your account." });
                }
                body.department = actor.department;
                body.projectManager = actor.displayName || actor.email || body.projectManager || "";
                body.projectManagerId = actor.uid || body.projectManagerId || "";
            }

            const now = Date.now();
            body.createdAt = now;
            body.updatedAt = now;
            if (!body.status) body.status = "PLANNING";
            body.createdById = session.user.uid || "";
            body.createdByName = session.user.displayName || session.user.email || "";
            if (!body.projectManagerId) body.projectManagerId = "";
            const docRef = await db.collection(COLLECTION).add(body);
            return res.status(201).json({ ok: true, data: { id: docRef.id } });
        }

        case "PUT": {
            if (!entityId) {
                return res.status(400).json({ ok: false, error: "Project ID is required in path." });
            }
            const existingDoc = await db.collection(COLLECTION).doc(entityId).get();
            if (!existingDoc.exists) {
                return res.status(404).json({ ok: false, error: "Project not found." });
            }
            const existing = existingDoc.data() || {};

            if (!isManagingDirector(actor) && !canAccessDepartment(actor, existing.department)) {
                return res.status(403).json({ ok: false, error: "Access denied for this department." });
            }

            const body = req.body || {};
            if (!isManagingDirector(actor)) {
                delete body.department;
            }

            const forceStatusTransition = !!body.forceStatusTransition;
            delete body.forceStatusTransition;

            let teamMemberIdsChanged = false;
            let normalizedTeamMemberIds = null;
            if (Object.prototype.hasOwnProperty.call(body, "teamMemberIds")) {
                normalizedTeamMemberIds = normalizeTeamMemberIds(body.teamMemberIds);
                if (normalizedTeamMemberIds === null) {
                    return res.status(400).json({ ok: false, error: "teamMemberIds contains invalid IDs." });
                }
                body.teamMemberIds = normalizedTeamMemberIds;
                teamMemberIdsChanged = true;
            }

            if (Object.prototype.hasOwnProperty.call(body, "budget")) {
                const budget = parseNonNegativeNumber(body.budget, 0);
                if (Number.isNaN(budget)) {
                    return res.status(400).json({ ok: false, error: "budget must be a non-negative number." });
                }
                body.budget = budget;
            }
            if (Object.prototype.hasOwnProperty.call(body, "spent")) {
                const spent = parseNonNegativeNumber(body.spent, 0);
                if (Number.isNaN(spent)) {
                    return res.status(400).json({ ok: false, error: "spent must be a non-negative number." });
                }
                body.spent = spent;
            }
            if (Object.prototype.hasOwnProperty.call(body, "completionPercentage")) {
                const completionPercentage = parsePercent(body.completionPercentage, 0);
                if (Number.isNaN(completionPercentage)) {
                    return res.status(400).json({ ok: false, error: "completionPercentage must be between 0 and 100." });
                }
                body.completionPercentage = completionPercentage;
            }
            if (Object.prototype.hasOwnProperty.call(body, "status")) {
                const nextStatus = String(body.status || "").toUpperCase();
                if (!ALLOWED_PROJECT_STATUSES.has(nextStatus)) {
                    return res.status(400).json({ ok: false, error: "Invalid project status." });
                }
                const currentStatus = String(existing.status || "PLANNING").toUpperCase();
                const allowed = STATUS_TRANSITIONS[currentStatus] || new Set([currentStatus]);

                if (!isManagingDirector(actor) && currentStatus === "PENDING_APPROVAL" && nextStatus !== "PENDING_APPROVAL") {
                    return res.status(403).json({ ok: false, error: "Only Managing Directors can approve pending projects." });
                }
                if (!isManagingDirector(actor) && nextStatus === "ARCHIVED") {
                    return res.status(403).json({ ok: false, error: "Only Managing Directors can archive projects." });
                }
                if (!allowed.has(nextStatus)) {
                    if (!(isManagingDirector(actor) && forceStatusTransition)) {
                        return res.status(400).json({
                            ok: false,
                            error: `Invalid status transition from ${currentStatus} to ${nextStatus}.`,
                        });
                    }
                }
                body.status = nextStatus;
            }
            if (Object.prototype.hasOwnProperty.call(body, "startDate")) {
                const startDate = parsePositiveTimestampOrZero(body.startDate);
                if (Number.isNaN(startDate)) {
                    return res.status(400).json({ ok: false, error: "Invalid startDate." });
                }
                body.startDate = startDate || 0;
            }
            if (Object.prototype.hasOwnProperty.call(body, "endDate")) {
                const endDate = parsePositiveTimestampOrZero(body.endDate);
                if (Number.isNaN(endDate)) {
                    return res.status(400).json({ ok: false, error: "Invalid endDate." });
                }
                body.endDate = endDate || 0;
            }

            const effectiveBudget = Object.prototype.hasOwnProperty.call(body, "budget") ? body.budget : parseNonNegativeNumber(existing.budget, 0);
            const effectiveSpent = Object.prototype.hasOwnProperty.call(body, "spent") ? body.spent : parseNonNegativeNumber(existing.spent, 0);
            const effectiveStartDate = Object.prototype.hasOwnProperty.call(body, "startDate") ? body.startDate : parsePositiveTimestampOrZero(existing.startDate);
            const effectiveEndDate = Object.prototype.hasOwnProperty.call(body, "endDate") ? body.endDate : parsePositiveTimestampOrZero(existing.endDate);
            if (effectiveBudget > 0 && effectiveSpent > effectiveBudget) {
                return res.status(400).json({ ok: false, error: "spent cannot exceed budget." });
            }
            if (effectiveStartDate && effectiveEndDate && effectiveEndDate < effectiveStartDate) {
                return res.status(400).json({ ok: false, error: "endDate must be on or after startDate." });
            }

            body.updatedAt = Date.now();
            delete body.id;
            await db.collection(COLLECTION).doc(entityId).update(body);

            if (teamMemberIdsChanged) {
                const teamSet = new Set((normalizedTeamMemberIds || []).map((id) => String(id)));
                const tasksSnap = await db.collection("tasks").where("projectId", "==", entityId).get();
                if (!tasksSnap.empty) {
                    let batch = db.batch();
                    let opCount = 0;
                    const commits = [];
                    const now = Date.now();
                    tasksSnap.docs.forEach((doc) => {
                        const task = doc.data() || {};
                        const assignedTo = String(task.assignedTo || "");
                        if (!assignedTo) return;
                        if (teamSet.has(assignedTo)) return;
                        batch.update(doc.ref, { assignedTo: "", assignedToName: "", updatedAt: now });
                        opCount += 1;
                        if (opCount >= 400) {
                            commits.push(batch.commit());
                            batch = db.batch();
                            opCount = 0;
                        }
                    });
                    if (opCount > 0) commits.push(batch.commit());
                    if (commits.length) await Promise.all(commits);
                }
            }
            return res.status(200).json({ ok: true, data: { id: entityId } });
        }

        case "DELETE": {
            if (!entityId) {
                return res.status(400).json({ ok: false, error: "Project ID is required in path." });
            }
            if (!isManagingDirector(actor)) {
                return res.status(403).json({ ok: false, error: "Only Managing Directors can delete projects." });
            }
            await db.collection(COLLECTION).doc(entityId).delete();
            return res.status(200).json({ ok: true });
        }

        default:
            res.setHeader("Allow", "GET, POST, PUT, DELETE");
            return res.status(405).json({ ok: false, error: "Method not allowed." });
    }
}, { maxRequests: 30 });
