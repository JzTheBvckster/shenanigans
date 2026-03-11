const { db } = require("../../lib/firebase");
const { requireSession } = require("../../lib/session");
const { withSecurity } = require("../../lib/security");

const COLLECTION = "projects";

module.exports = withSecurity(async function handler(req, res) {
    const session = await requireSession(req, res);
    if (!session) return;

    if (session.user.role === "EMPLOYEE" && req.method !== "GET") {
        return res.status(403).json({ ok: false, error: "Access denied for employee role." });
    }

    const method = req.method;
    const segments = (req.url || "").split("/").filter(Boolean);
    const entityId = segments.length >= 3 ? decodeURIComponent(segments[2].split("?")[0]) : null;

    switch (method) {
        case "GET": {
            const snapshot = await db.collection(COLLECTION).get();
            const projects = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            return res.status(200).json({ ok: true, data: projects });
        }

        case "POST": {
            const body = req.body || {};
            if (!body.name) {
                return res.status(400).json({ ok: false, error: "Project name is required." });
            }
            const now = Date.now();
            body.createdAt = now;
            body.updatedAt = now;
            if (!body.status) body.status = "PLANNING";
            const docRef = await db.collection(COLLECTION).add(body);
            return res.status(201).json({ ok: true, data: { id: docRef.id } });
        }

        case "PUT": {
            if (!entityId) {
                return res.status(400).json({ ok: false, error: "Project ID is required in path." });
            }
            const body = req.body || {};
            body.updatedAt = Date.now();
            delete body.id;
            await db.collection(COLLECTION).doc(entityId).update(body);
            return res.status(200).json({ ok: true, data: { id: entityId } });
        }

        case "DELETE": {
            if (!entityId) {
                return res.status(400).json({ ok: false, error: "Project ID is required in path." });
            }
            await db.collection(COLLECTION).doc(entityId).delete();
            return res.status(200).json({ ok: true });
        }

        default:
            res.setHeader("Allow", "GET, POST, PUT, DELETE");
            return res.status(405).json({ ok: false, error: "Method not allowed." });
    }
}, { maxRequests: 30 });
