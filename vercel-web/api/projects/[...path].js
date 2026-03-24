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
            body.updatedAt = Date.now();
            delete body.id;
            await db.collection(COLLECTION).doc(entityId).update(body);
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
