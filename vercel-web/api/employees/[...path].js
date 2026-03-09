const { db } = require("../../lib/firebase");
const { requireSession } = require("../../lib/session");

const COLLECTION = "employees";

module.exports = async function handler(req, res) {
    const session = await requireSession(req, res);
    if (!session) return;

    if (session.user.role === "EMPLOYEE") {
        return res.status(403).json({ ok: false, error: "Access denied for employee role." });
    }

    const method = req.method;

    // Extract ID from path: /api/employees/[id]
    const segments = (req.url || "").split("/").filter(Boolean);
    // segments: ["api", "employees", "<id>?"]
    const entityId = segments.length >= 3 ? decodeURIComponent(segments[2].split("?")[0]) : null;

    switch (method) {
        case "GET": {
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
};
