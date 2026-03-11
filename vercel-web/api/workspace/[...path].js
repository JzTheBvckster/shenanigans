const { db } = require("../../lib/firebase");
const { requireSession } = require("../../lib/session");

/**
 * Consolidated workspace API handler.
 * Routes: /api/workspace/timesheets, /api/workspace/leave-requests, /api/workspace/documents
 */
module.exports = async function handler(req, res) {
    const session = await requireSession(req, res);
    if (!session) return;

    // Parse the resource from the URL path
    const url = req.url || "";
    const match = url.match(/\/api\/workspace\/([^?/]+)/);
    const resource = match ? match[1] : "";

    switch (resource) {
        case "timesheets":
            return handleTimesheets(req, res, session);
        case "leave-requests":
            return handleLeaveRequests(req, res, session);
        case "documents":
            return handleDocuments(req, res, session);
        default:
            return res.status(404).json({ ok: false, error: "Unknown workspace resource." });
    }
};

// ---------------------------------------------------------------------------
// Timesheets
// ---------------------------------------------------------------------------
async function handleTimesheets(req, res, session) {
    const method = req.method;
    const uid = session.user.uid;
    const COLLECTION = "timesheets";

    switch (method) {
        case "GET": {
            let query = db.collection(COLLECTION);
            if (session.user.role === "EMPLOYEE") {
                query = query.where("employeeId", "==", uid);
            } else if (req.query && req.query.employeeId) {
                query = query.where("employeeId", "==", req.query.employeeId);
            }
            const snapshot = await query.orderBy("date", "desc").get();
            const entries = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            return res.status(200).json({ ok: true, data: entries });
        }

        case "POST": {
            const body = req.body || {};
            if (!body.projectId || !body.date || !body.hours) {
                return res.status(400).json({ ok: false, error: "projectId, date, and hours are required." });
            }
            const hours = Number(body.hours);
            if (isNaN(hours) || hours <= 0 || hours > 24) {
                return res.status(400).json({ ok: false, error: "Hours must be between 0 and 24." });
            }
            const now = Date.now();
            const entry = {
                employeeId: uid,
                employeeName: session.user.displayName || "",
                projectId: body.projectId,
                projectName: body.projectName || "",
                date: Number(body.date),
                hours: hours,
                description: body.description || "",
                createdAt: now,
                updatedAt: now
            };
            const docRef = await db.collection(COLLECTION).add(entry);
            return res.status(201).json({ ok: true, data: { id: docRef.id, ...entry } });
        }

        case "DELETE": {
            const entryId = req.query && req.query.id;
            if (!entryId) {
                return res.status(400).json({ ok: false, error: "Entry ID is required." });
            }
            if (session.user.role === "EMPLOYEE") {
                const doc = await db.collection(COLLECTION).doc(entryId).get();
                if (!doc.exists || doc.data().employeeId !== uid) {
                    return res.status(403).json({ ok: false, error: "Access denied." });
                }
            }
            await db.collection(COLLECTION).doc(entryId).delete();
            return res.status(200).json({ ok: true });
        }

        default:
            res.setHeader("Allow", "GET, POST, DELETE");
            return res.status(405).json({ ok: false, error: "Method not allowed." });
    }
}

// ---------------------------------------------------------------------------
// Leave Requests
// ---------------------------------------------------------------------------
async function handleLeaveRequests(req, res, session) {
    const method = req.method;
    const uid = session.user.uid;
    const COLLECTION = "leave_requests";

    switch (method) {
        case "GET": {
            let query = db.collection(COLLECTION);
            if (session.user.role === "EMPLOYEE") {
                query = query.where("employeeId", "==", uid);
            }
            const snapshot = await query.orderBy("createdAt", "desc").get();
            const requests = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            return res.status(200).json({ ok: true, data: requests });
        }

        case "POST": {
            const body = req.body || {};
            if (!body.type || !body.startDate || !body.endDate) {
                return res.status(400).json({ ok: false, error: "type, startDate, and endDate are required." });
            }
            const validTypes = ["ANNUAL", "SICK", "PERSONAL"];
            if (!validTypes.includes(body.type)) {
                return res.status(400).json({ ok: false, error: "Type must be ANNUAL, SICK, or PERSONAL." });
            }
            const now = Date.now();
            const request = {
                employeeId: uid,
                employeeName: session.user.displayName || "",
                type: body.type,
                startDate: Number(body.startDate),
                endDate: Number(body.endDate),
                reason: body.reason || "",
                status: "PENDING",
                reviewedBy: null,
                reviewedAt: null,
                createdAt: now,
                updatedAt: now
            };
            const docRef = await db.collection(COLLECTION).add(request);
            return res.status(201).json({ ok: true, data: { id: docRef.id, ...request } });
        }

        case "PUT": {
            if (session.user.role === "EMPLOYEE") {
                return res.status(403).json({ ok: false, error: "Only managers can approve or reject requests." });
            }
            const body = req.body || {};
            if (!body.id || !body.status) {
                return res.status(400).json({ ok: false, error: "id and status are required." });
            }
            const validStatuses = ["APPROVED", "REJECTED"];
            if (!validStatuses.includes(body.status)) {
                return res.status(400).json({ ok: false, error: "Status must be APPROVED or REJECTED." });
            }
            const now = Date.now();
            await db.collection(COLLECTION).doc(body.id).update({
                status: body.status,
                reviewedBy: session.user.displayName || session.user.email,
                reviewedAt: now,
                updatedAt: now
            });
            return res.status(200).json({ ok: true, data: { id: body.id, status: body.status } });
        }

        default:
            res.setHeader("Allow", "GET, POST, PUT");
            return res.status(405).json({ ok: false, error: "Method not allowed." });
    }
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
async function handleDocuments(req, res, session) {
    const method = req.method;
    const COLLECTION = "documents";

    switch (method) {
        case "GET": {
            const snapshot = await db.collection(COLLECTION).orderBy("createdAt", "desc").get();
            const documents = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            return res.status(200).json({ ok: true, data: documents });
        }

        case "POST": {
            if (session.user.role === "EMPLOYEE") {
                return res.status(403).json({ ok: false, error: "Only managers can add documents." });
            }
            const body = req.body || {};
            if (!body.name || !body.category) {
                return res.status(400).json({ ok: false, error: "name and category are required." });
            }
            const validCategories = ["POLICY", "TEMPLATE", "PROJECT_BRIEF"];
            if (!validCategories.includes(body.category)) {
                return res.status(400).json({ ok: false, error: "Category must be POLICY, TEMPLATE, or PROJECT_BRIEF." });
            }
            const now = Date.now();
            const doc = {
                name: body.name,
                description: body.description || "",
                category: body.category,
                relatedProjectId: body.relatedProjectId || null,
                uploadedBy: session.user.displayName || session.user.email,
                createdAt: now,
                updatedAt: now
            };
            const docRef = await db.collection(COLLECTION).add(doc);
            return res.status(201).json({ ok: true, data: { id: docRef.id, ...doc } });
        }

        default:
            res.setHeader("Allow", "GET, POST");
            return res.status(405).json({ ok: false, error: "Method not allowed." });
    }
}
