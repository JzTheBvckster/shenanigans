const { db } = require("../../lib/firebase");
const { requireSession } = require("../../lib/session");
const { withSecurity } = require("../../lib/security");

/**
 * Consolidated workspace API handler.
 * Routes: /api/workspace/timesheets, /api/workspace/leave-requests, /api/workspace/documents
 */
module.exports = withSecurity(async function handler(req, res) {
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
        case "tasks":
            return handleTasks(req, res, session);
        case "comments":
            return handleComments(req, res, session);
        case "activity-logs":
            return handleActivityLogs(req, res, session);
        case "notifications":
            return handleNotifications(req, res, session);
        case "milestones":
            return handleMilestones(req, res, session);
        default:
            return res.status(404).json({ ok: false, error: "Unknown workspace resource." });
    }
}, { maxRequests: 30 });

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

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
async function handleTasks(req, res, session) {
    const method = req.method;
    const uid = session.user.uid;
    const role = session.user.role;
    const COLLECTION = "tasks";

    // Parse task ID from URL: /api/workspace/tasks/<id>
    const urlParts = (req.url || "").split("/").filter(Boolean);
    const taskId = urlParts.length >= 4 ? decodeURIComponent(urlParts[3].split("?")[0]) : null;

    switch (method) {
        case "GET": {
            const query = req.query || {};
            let firestoreQuery = db.collection(COLLECTION);

            // Employees see only their assigned tasks
            if (role === "EMPLOYEE") {
                firestoreQuery = firestoreQuery.where("assignedTo", "==", uid);
            } else if (query.projectId) {
                // PM/MD can filter by project
                firestoreQuery = firestoreQuery.where("projectId", "==", query.projectId);
            }

            const snapshot = await firestoreQuery.get();
            const tasks = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            return res.status(200).json({ ok: true, data: tasks });
        }

        case "POST": {
            if (role === "EMPLOYEE") {
                return res.status(403).json({ ok: false, error: "Only managers can create tasks." });
            }
            const body = req.body || {};
            if (!body.title) {
                return res.status(400).json({ ok: false, error: "Task title is required." });
            }
            const validStatuses = ["TODO", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETED"];
            const validPriorities = ["LOW", "MEDIUM", "HIGH"];
            const now = Date.now();
            const task = {
                title: body.title,
                description: body.description || "",
                projectId: body.projectId || "",
                projectName: body.projectName || "",
                assignedTo: body.assignedTo || "",
                assignedToName: body.assignedToName || "",
                status: validStatuses.includes(body.status) ? body.status : "TODO",
                priority: validPriorities.includes(body.priority) ? body.priority : "MEDIUM",
                dueDate: body.dueDate ? Number(body.dueDate) : null,
                createdBy: uid,
                createdByName: session.user.displayName || session.user.email || "",
                createdAt: now,
                updatedAt: now
            };
            const docRef = await db.collection(COLLECTION).add(task);
            return res.status(201).json({ ok: true, data: { id: docRef.id, ...task } });
        }

        case "PUT": {
            if (!taskId) {
                return res.status(400).json({ ok: false, error: "Task ID is required." });
            }
            const doc = await db.collection(COLLECTION).doc(taskId).get();
            if (!doc.exists) {
                return res.status(404).json({ ok: false, error: "Task not found." });
            }

            const existing = doc.data();
            // Employees can only update status of their own tasks
            if (role === "EMPLOYEE") {
                if (existing.assignedTo !== uid) {
                    return res.status(403).json({ ok: false, error: "Access denied." });
                }
                const body = req.body || {};
                const validStatuses = ["TODO", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETED"];
                const update = { updatedAt: Date.now() };
                if (body.status && validStatuses.includes(body.status)) {
                    update.status = body.status;
                }
                await db.collection(COLLECTION).doc(taskId).update(update);
                return res.status(200).json({ ok: true, data: { id: taskId, ...update } });
            }

            // PM/MD can update all fields
            const body = req.body || {};
            const update = { updatedAt: Date.now() };
            if (body.title !== undefined) update.title = body.title;
            if (body.description !== undefined) update.description = body.description;
            if (body.assignedTo !== undefined) update.assignedTo = body.assignedTo;
            if (body.assignedToName !== undefined) update.assignedToName = body.assignedToName;
            if (body.status !== undefined) update.status = body.status;
            if (body.priority !== undefined) update.priority = body.priority;
            if (body.dueDate !== undefined) update.dueDate = body.dueDate ? Number(body.dueDate) : null;
            if (body.projectId !== undefined) update.projectId = body.projectId;
            if (body.projectName !== undefined) update.projectName = body.projectName;

            await db.collection(COLLECTION).doc(taskId).update(update);
            return res.status(200).json({ ok: true, data: { id: taskId, ...update } });
        }

        case "DELETE": {
            if (role === "EMPLOYEE") {
                return res.status(403).json({ ok: false, error: "Only managers can delete tasks." });
            }
            if (!taskId) {
                return res.status(400).json({ ok: false, error: "Task ID is required." });
            }
            await db.collection(COLLECTION).doc(taskId).delete();
            return res.status(200).json({ ok: true });
        }

        default:
            res.setHeader("Allow", "GET, POST, PUT, DELETE");
            return res.status(405).json({ ok: false, error: "Method not allowed." });
    }
}

// ---------------------------------------------------------------------------
// Comments (task comments)
// ---------------------------------------------------------------------------
async function handleComments(req, res, session) {
    const method = req.method;
    const COLLECTION = "comments";

    switch (method) {
        case "GET": {
            const taskId = req.query && req.query.taskId;
            if (!taskId) {
                return res.status(400).json({ ok: false, error: "taskId query parameter is required." });
            }
            const snapshot = await db.collection(COLLECTION)
                .where("taskId", "==", taskId)
                .orderBy("createdAt", "asc")
                .get();
            const comments = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            return res.status(200).json({ ok: true, data: comments });
        }

        case "POST": {
            const body = req.body || {};
            if (!body.taskId || !body.text) {
                return res.status(400).json({ ok: false, error: "taskId and text are required." });
            }
            if (body.text.length > 2000) {
                return res.status(400).json({ ok: false, error: "Comment text must be under 2000 characters." });
            }
            const now = Date.now();
            const comment = {
                taskId: body.taskId,
                text: body.text.trim(),
                authorId: session.user.uid,
                authorName: session.user.displayName || session.user.email || "",
                authorRole: session.user.role || "",
                createdAt: now
            };
            const docRef = await db.collection(COLLECTION).add(comment);
            return res.status(201).json({ ok: true, data: { id: docRef.id, ...comment } });
        }

        case "DELETE": {
            const commentId = req.query && req.query.id;
            if (!commentId) {
                return res.status(400).json({ ok: false, error: "Comment ID is required." });
            }
            const doc = await db.collection(COLLECTION).doc(commentId).get();
            if (!doc.exists) {
                return res.status(404).json({ ok: false, error: "Comment not found." });
            }
            // Only author or managers can delete
            if (session.user.role === "EMPLOYEE" && doc.data().authorId !== session.user.uid) {
                return res.status(403).json({ ok: false, error: "Access denied." });
            }
            await db.collection(COLLECTION).doc(commentId).delete();
            return res.status(200).json({ ok: true });
        }

        default:
            res.setHeader("Allow", "GET, POST, DELETE");
            return res.status(405).json({ ok: false, error: "Method not allowed." });
    }
}

// ---------------------------------------------------------------------------
// Activity Logs (audit trail)
// ---------------------------------------------------------------------------
async function handleActivityLogs(req, res, session) {
    const method = req.method;
    const COLLECTION = "activity_logs";

    switch (method) {
        case "GET": {
            const query = req.query || {};
            let firestoreQuery = db.collection(COLLECTION);
            if (query.projectId) {
                firestoreQuery = firestoreQuery.where("projectId", "==", query.projectId);
            }
            if (query.entityType) {
                firestoreQuery = firestoreQuery.where("entityType", "==", query.entityType);
            }
            const limit = Math.min(parseInt(query.limit) || 50, 200);
            const snapshot = await firestoreQuery.orderBy("createdAt", "desc").limit(limit).get();
            const logs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            return res.status(200).json({ ok: true, data: logs });
        }

        case "POST": {
            const body = req.body || {};
            if (!body.action || !body.entityType) {
                return res.status(400).json({ ok: false, error: "action and entityType are required." });
            }
            const now = Date.now();
            const log = {
                action: body.action,
                entityType: body.entityType,
                entityId: body.entityId || "",
                entityName: body.entityName || "",
                projectId: body.projectId || "",
                details: body.details || "",
                userId: session.user.uid,
                userName: session.user.displayName || session.user.email || "",
                userRole: session.user.role || "",
                createdAt: now
            };
            const docRef = await db.collection(COLLECTION).add(log);
            return res.status(201).json({ ok: true, data: { id: docRef.id, ...log } });
        }

        default:
            res.setHeader("Allow", "GET, POST");
            return res.status(405).json({ ok: false, error: "Method not allowed." });
    }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
async function handleNotifications(req, res, session) {
    const method = req.method;
    const uid = session.user.uid;
    const COLLECTION = "notifications";

    switch (method) {
        case "GET": {
            const snapshot = await db.collection(COLLECTION)
                .where("recipientId", "==", uid)
                .orderBy("createdAt", "desc")
                .limit(50)
                .get();
            const notifs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            return res.status(200).json({ ok: true, data: notifs });
        }

        case "POST": {
            const body = req.body || {};
            if (!body.recipientId || !body.message) {
                return res.status(400).json({ ok: false, error: "recipientId and message are required." });
            }
            // Allow batch - recipientIds array
            const recipients = body.recipientIds || [body.recipientId];
            const now = Date.now();
            const batch = db.batch();
            const results = [];
            for (const rid of recipients) {
                const notif = {
                    recipientId: rid,
                    type: body.type || "GENERAL",
                    message: body.message,
                    link: body.link || "",
                    entityId: body.entityId || "",
                    entityType: body.entityType || "",
                    read: false,
                    senderId: session.user.uid,
                    senderName: session.user.displayName || session.user.email || "",
                    createdAt: now
                };
                const ref = db.collection(COLLECTION).doc();
                batch.set(ref, notif);
                results.push({ id: ref.id, ...notif });
            }
            await batch.commit();
            return res.status(201).json({ ok: true, data: results });
        }

        case "PUT": {
            const body = req.body || {};
            // Mark notification(s) as read
            if (body.markAllRead) {
                const snapshot = await db.collection(COLLECTION)
                    .where("recipientId", "==", uid)
                    .where("read", "==", false)
                    .get();
                const batch = db.batch();
                snapshot.docs.forEach((d) => batch.update(d.ref, { read: true }));
                await batch.commit();
                return res.status(200).json({ ok: true, data: { updated: snapshot.size } });
            }
            if (!body.id) {
                return res.status(400).json({ ok: false, error: "Notification id is required." });
            }
            await db.collection(COLLECTION).doc(body.id).update({ read: true });
            return res.status(200).json({ ok: true });
        }

        default:
            res.setHeader("Allow", "GET, POST, PUT");
            return res.status(405).json({ ok: false, error: "Method not allowed." });
    }
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------
async function handleMilestones(req, res, session) {
    const method = req.method;
    const role = session.user.role;
    const COLLECTION = "milestones";

    const urlParts = (req.url || "").split("/").filter(Boolean);
    const milestoneId = urlParts.length >= 4 ? decodeURIComponent(urlParts[3].split("?")[0]) : null;

    switch (method) {
        case "GET": {
            const query = req.query || {};
            let firestoreQuery = db.collection(COLLECTION);
            if (query.projectId) {
                firestoreQuery = firestoreQuery.where("projectId", "==", query.projectId);
            }
            const snapshot = await firestoreQuery.orderBy("dueDate", "asc").get();
            const milestones = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            return res.status(200).json({ ok: true, data: milestones });
        }

        case "POST": {
            if (role === "EMPLOYEE") {
                return res.status(403).json({ ok: false, error: "Only managers can create milestones." });
            }
            const body = req.body || {};
            if (!body.title || !body.projectId) {
                return res.status(400).json({ ok: false, error: "title and projectId are required." });
            }
            const now = Date.now();
            const milestone = {
                title: body.title,
                description: body.description || "",
                projectId: body.projectId,
                projectName: body.projectName || "",
                dueDate: body.dueDate ? Number(body.dueDate) : null,
                status: body.status || "PENDING",
                createdBy: session.user.uid,
                createdByName: session.user.displayName || session.user.email || "",
                createdAt: now,
                updatedAt: now
            };
            const docRef = await db.collection(COLLECTION).add(milestone);
            return res.status(201).json({ ok: true, data: { id: docRef.id, ...milestone } });
        }

        case "PUT": {
            if (role === "EMPLOYEE") {
                return res.status(403).json({ ok: false, error: "Only managers can update milestones." });
            }
            if (!milestoneId) {
                return res.status(400).json({ ok: false, error: "Milestone ID is required." });
            }
            const body = req.body || {};
            const update = { updatedAt: Date.now() };
            if (body.title !== undefined) update.title = body.title;
            if (body.description !== undefined) update.description = body.description;
            if (body.dueDate !== undefined) update.dueDate = body.dueDate ? Number(body.dueDate) : null;
            if (body.status !== undefined) update.status = body.status;
            await db.collection(COLLECTION).doc(milestoneId).update(update);
            return res.status(200).json({ ok: true, data: { id: milestoneId, ...update } });
        }

        case "DELETE": {
            if (role === "EMPLOYEE") {
                return res.status(403).json({ ok: false, error: "Only managers can delete milestones." });
            }
            if (!milestoneId) {
                return res.status(400).json({ ok: false, error: "Milestone ID is required." });
            }
            await db.collection(COLLECTION).doc(milestoneId).delete();
            return res.status(200).json({ ok: true });
        }

        default:
            res.setHeader("Allow", "GET, POST, PUT, DELETE");
            return res.status(405).json({ ok: false, error: "Method not allowed." });
    }
}
