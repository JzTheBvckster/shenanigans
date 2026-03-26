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

/**
 * Consolidated workspace API handler.
 * Routes: /api/workspace/timesheets, /api/workspace/leave-requests, /api/workspace/documents
 */
module.exports = withSecurity(
  async function handler(req, res) {
    const session = await requireSession(req, res);
    if (!session) return;
    const actor = await getActorContext(session);

    // Parse the resource from the URL path
    const url = req.url || "";
    const match = url.match(/\/api\/workspace\/([^?/]+)/);
    const resource = match ? match[1] : "";

    switch (resource) {
      case "timesheets":
        return handleTimesheets(req, res, session, actor);
      case "leave-requests":
        return handleLeaveRequests(req, res, session, actor);
      case "documents":
        return handleDocuments(req, res, session, actor);
      case "tasks":
        return handleTasks(req, res, session, actor);
      case "comments":
        return handleComments(req, res, session, actor);
      case "activity-logs":
        return handleActivityLogs(req, res, session, actor);
      case "notifications":
        return handleNotifications(req, res, session, actor);
      case "milestones":
        return handleMilestones(req, res, session, actor);
      default:
        return res
          .status(404)
          .json({ ok: false, error: "Unknown workspace resource." });
    }
  },
  { maxRequests: 20, windowMs: 60 * 1000 },
);

function parseResourceIdFromUrl(reqUrl, resource) {
  const match = String(reqUrl || "").match(
    new RegExp(`/api/workspace/${resource}/([^?/]+)`),
  );
  if (!match) return "";
  const id = decodeURIComponent(match[1] || "").trim();
  return isValidDocId(id) ? id : "";
}

function parsePositiveTimestamp(value) {
  const ts = Number(value);
  return Number.isFinite(ts) && ts > 0 ? ts : 0;
}

async function getProjectById(projectId) {
  if (!projectId) return null;
  const doc = await db.collection("projects").doc(String(projectId)).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function ensureProjectAccess(res, actor, projectId) {
  const project = await getProjectById(projectId);
  if (!project) {
    res.status(404).json({ ok: false, error: "Project not found." });
    return null;
  }
  if (
    !isManagingDirector(actor) &&
    !canAccessDepartment(actor, project.department)
  ) {
    res
      .status(403)
      .json({ ok: false, error: "Access denied for this department." });
    return null;
  }
  return project;
}

function isAssigneeInProjectTeam(project, assigneeId) {
  if (!project || !assigneeId) return false;
  const team = Array.isArray(project.teamMemberIds)
    ? project.teamMemberIds
    : [];
  return team.map((id) => String(id)).includes(String(assigneeId));
}

async function getDepartmentEmployeeIds(department) {
  if (!department) return new Set();
  const snap = await db
    .collection("employees")
    .where("department", "==", department)
    .get();
  const ids = new Set();
  snap.docs.forEach((d) => ids.add(d.id));
  return ids;
}

// ---------------------------------------------------------------------------
// Timesheets
// ---------------------------------------------------------------------------
async function handleTimesheets(req, res, session, actor) {
  const method = req.method;
  const uid = session.user.uid;
  const COLLECTION = "timesheets";

  switch (method) {
    case "GET": {
      let query = db.collection(COLLECTION);
      if (isEmployee(actor)) {
        query = query.where("employeeId", "==", uid);
      } else if (req.query && req.query.employeeId) {
        if (!isValidDocId(String(req.query.employeeId))) {
          return res
            .status(400)
            .json({ ok: false, error: "Invalid employeeId." });
        }
        query = query.where("employeeId", "==", req.query.employeeId);
      }
      const snapshot = await query.orderBy("date", "desc").get();
      let entries = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!isManagingDirector(actor) && !isEmployee(actor)) {
        entries = entries.filter((entry) =>
          canAccessDepartment(actor, entry.department),
        );
      }
      return res.status(200).json({ ok: true, data: entries });
    }

    case "POST": {
      const body = req.body || {};
      if (!body.projectId || !body.date || !body.hours) {
        return res
          .status(400)
          .json({
            ok: false,
            error: "projectId, date, and hours are required.",
          });
      }
      if (!isValidDocId(String(body.projectId))) {
        return res.status(400).json({ ok: false, error: "Invalid projectId." });
      }
      const dateTs = parsePositiveTimestamp(body.date);
      if (!dateTs) {
        return res
          .status(400)
          .json({ ok: false, error: "A valid date is required." });
      }
      const hours = Number(body.hours);
      if (isNaN(hours) || hours <= 0 || hours > 24) {
        return res
          .status(400)
          .json({ ok: false, error: "Hours must be between 0 and 24." });
      }
      const project = await ensureProjectAccess(res, actor, body.projectId);
      if (!project) return;
      if (body.assignedTo) {
        if (!isValidDocId(String(body.assignedTo))) {
          return res
            .status(400)
            .json({ ok: false, error: "Invalid assignee id." });
        }
        if (!isAssigneeInProjectTeam(project, body.assignedTo)) {
          return res
            .status(400)
            .json({
              ok: false,
              error: "Assignee must be a member of the selected project team.",
            });
        }
      }
      const now = Date.now();
      const entry = {
        employeeId: uid,
        employeeName: session.user.displayName || "",
        projectId: String(body.projectId),
        projectName: body.projectName || "",
        department: project.department || "",
        date: dateTs,
        hours: hours,
        description: body.description || "",
        createdAt: now,
        updatedAt: now,
      };
      const docRef = await db.collection(COLLECTION).add(entry);
      return res
        .status(201)
        .json({ ok: true, data: { id: docRef.id, ...entry } });
    }

    case "DELETE": {
      const entryId = req.query && req.query.id;
      if (!entryId) {
        return res
          .status(400)
          .json({ ok: false, error: "Entry ID is required." });
      }
      if (!isValidDocId(String(entryId))) {
        return res.status(400).json({ ok: false, error: "Invalid entry ID." });
      }
      if (isEmployee(actor)) {
        const doc = await db.collection(COLLECTION).doc(entryId).get();
        if (!doc.exists) {
          return res
            .status(404)
            .json({ ok: false, error: "Timesheet entry not found." });
        }
        if (doc.data().employeeId !== uid) {
          return res.status(403).json({ ok: false, error: "Access denied." });
        }
      } else if (!isManagingDirector(actor)) {
        const doc = await db.collection(COLLECTION).doc(entryId).get();
        if (!doc.exists) {
          return res
            .status(404)
            .json({ ok: false, error: "Timesheet entry not found." });
        }
        if (!canAccessDepartment(actor, (doc.data() || {}).department)) {
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
async function handleLeaveRequests(req, res, session, actor) {
  const method = req.method;
  const uid = session.user.uid;
  const COLLECTION = "leave_requests";

  switch (method) {
    case "GET": {
      let query = db.collection(COLLECTION);
      if (isEmployee(actor)) {
        query = query.where("employeeId", "==", uid);
      }
      const snapshot = await query.orderBy("createdAt", "desc").get();
      let requests = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!isManagingDirector(actor) && !isEmployee(actor)) {
        const ids = await getDepartmentEmployeeIds(actor.department);
        requests = requests.filter((r) => ids.has(r.employeeId));
      }
      return res.status(200).json({ ok: true, data: requests });
    }

    case "POST": {
      const body = req.body || {};
      if (!body.type || !body.startDate || !body.endDate) {
        return res
          .status(400)
          .json({
            ok: false,
            error: "type, startDate, and endDate are required.",
          });
      }
      const startDate = parsePositiveTimestamp(body.startDate);
      const endDate = parsePositiveTimestamp(body.endDate);
      if (!startDate || !endDate) {
        return res
          .status(400)
          .json({
            ok: false,
            error: "Valid startDate and endDate are required.",
          });
      }
      if (endDate < startDate) {
        return res
          .status(400)
          .json({ ok: false, error: "endDate must be on or after startDate." });
      }
      const validTypes = ["ANNUAL", "SICK", "PERSONAL"];
      if (!validTypes.includes(body.type)) {
        return res
          .status(400)
          .json({
            ok: false,
            error: "Type must be ANNUAL, SICK, or PERSONAL.",
          });
      }
      const now = Date.now();
      const request = {
        employeeId: uid,
        employeeName: session.user.displayName || "",
        department: actor.department || "",
        type: body.type,
        startDate: startDate,
        endDate: endDate,
        reason: body.reason || "",
        status: "PENDING",
        reviewedBy: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      const docRef = await db.collection(COLLECTION).add(request);
      return res
        .status(201)
        .json({ ok: true, data: { id: docRef.id, ...request } });
    }

    case "PUT": {
      if (isEmployee(actor)) {
        return res
          .status(403)
          .json({
            ok: false,
            error: "Only managers can approve or reject requests.",
          });
      }
      const body = req.body || {};
      if (!body.id || !body.status) {
        return res
          .status(400)
          .json({ ok: false, error: "id and status are required." });
      }
      if (!isValidDocId(String(body.id))) {
        return res
          .status(400)
          .json({ ok: false, error: "Invalid request id." });
      }
      const validStatuses = ["APPROVED", "REJECTED"];
      if (!validStatuses.includes(body.status)) {
        return res
          .status(400)
          .json({ ok: false, error: "Status must be APPROVED or REJECTED." });
      }
      const reqDoc = await db.collection(COLLECTION).doc(body.id).get();
      if (!reqDoc.exists) {
        return res.status(404).json({ ok: false, error: "Request not found." });
      }
      if (!isManagingDirector(actor)) {
        const reqData = reqDoc.data() || {};
        if (!canAccessDepartment(actor, reqData.department)) {
          return res
            .status(403)
            .json({ ok: false, error: "Access denied for this department." });
        }
      }

      const now = Date.now();
      await db
        .collection(COLLECTION)
        .doc(body.id)
        .update({
          status: body.status,
          reviewedBy: session.user.displayName || session.user.email,
          reviewedAt: now,
          updatedAt: now,
        });
      return res
        .status(200)
        .json({ ok: true, data: { id: body.id, status: body.status } });
    }

    default:
      res.setHeader("Allow", "GET, POST, PUT");
      return res.status(405).json({ ok: false, error: "Method not allowed." });
  }
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
async function handleDocuments(req, res, session, actor) {
  const method = req.method;
  const COLLECTION = "documents";

  switch (method) {
    case "GET": {
      const snapshot = await db
        .collection(COLLECTION)
        .orderBy("createdAt", "desc")
        .get();
      let documents = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!isManagingDirector(actor)) {
        documents = documents.filter((doc) => {
          if (doc.department) return canAccessDepartment(actor, doc.department);
          return true;
        });
      }
      return res.status(200).json({ ok: true, data: documents });
    }

    case "POST": {
      if (isEmployee(actor)) {
        return res
          .status(403)
          .json({ ok: false, error: "Only managers can add documents." });
      }
      const body = req.body || {};
      if (!body.name || !body.category) {
        return res
          .status(400)
          .json({ ok: false, error: "name and category are required." });
      }
      const validCategories = ["POLICY", "TEMPLATE", "PROJECT_BRIEF"];
      if (!validCategories.includes(body.category)) {
        return res
          .status(400)
          .json({
            ok: false,
            error: "Category must be POLICY, TEMPLATE, or PROJECT_BRIEF.",
          });
      }
      if (
        body.relatedProjectId &&
        !isValidDocId(String(body.relatedProjectId))
      ) {
        return res
          .status(400)
          .json({ ok: false, error: "Invalid relatedProjectId." });
      }
      let relatedProject = null;
      if (body.relatedProjectId) {
        relatedProject = await ensureProjectAccess(
          res,
          actor,
          body.relatedProjectId,
        );
        if (!relatedProject) return;
        if (body.department && body.department !== relatedProject.department) {
          return res
            .status(400)
            .json({
              ok: false,
              error:
                "Document department must match related project department.",
            });
        }
      }
      if (
        !isManagingDirector(actor) &&
        body.department &&
        !canAccessDepartment(actor, body.department)
      ) {
        return res
          .status(403)
          .json({ ok: false, error: "Access denied for this department." });
      }

      const now = Date.now();
      const doc = {
        name: body.name,
        description: body.description || "",
        category: body.category,
        relatedProjectId: body.relatedProjectId || null,
        department:
          body.department ||
          (relatedProject && relatedProject.department) ||
          actor.department ||
          "",
        uploadedBy: session.user.displayName || session.user.email,
        createdAt: now,
        updatedAt: now,
      };
      const docRef = await db.collection(COLLECTION).add(doc);
      return res
        .status(201)
        .json({ ok: true, data: { id: docRef.id, ...doc } });
    }

    default:
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ ok: false, error: "Method not allowed." });
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
async function handleTasks(req, res, session, actor) {
  const method = req.method;
  const uid = session.user.uid;
  const role = session.user.role;
  const COLLECTION = "tasks";

  // Parse task ID from URL: /api/workspace/tasks/<id>
  const taskId = parseResourceIdFromUrl(req.url, "tasks");

  switch (method) {
    case "GET": {
      const query = req.query || {};
      let firestoreQuery = db.collection(COLLECTION);

      // Employees see only their assigned tasks
      if (role === "EMPLOYEE") {
        firestoreQuery = firestoreQuery.where("assignedTo", "==", uid);
      } else if (query.projectId) {
        if (!isValidDocId(String(query.projectId))) {
          return res
            .status(400)
            .json({ ok: false, error: "Invalid projectId." });
        }
        // PM/MD can filter by project
        firestoreQuery = firestoreQuery.where(
          "projectId",
          "==",
          query.projectId,
        );
      }

      const snapshot = await firestoreQuery.get();
      let tasks = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!isManagingDirector(actor)) {
        tasks = tasks.filter((t) => canAccessDepartment(actor, t.department));
      }
      tasks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return res.status(200).json({ ok: true, data: tasks });
    }

    case "POST": {
      if (role === "EMPLOYEE") {
        return res
          .status(403)
          .json({ ok: false, error: "Only managers can create tasks." });
      }
      const body = req.body || {};
      const title = String(body.title || "").trim();
      if (!title) {
        return res
          .status(400)
          .json({ ok: false, error: "Task title is required." });
      }
      if (!body.projectId || !isValidDocId(String(body.projectId))) {
        return res
          .status(400)
          .json({ ok: false, error: "A valid projectId is required." });
      }
      const dueDate = body.dueDate ? parsePositiveTimestamp(body.dueDate) : 0;
      if (body.dueDate && !dueDate) {
        return res.status(400).json({ ok: false, error: "Invalid dueDate." });
      }
      const project = await ensureProjectAccess(res, actor, body.projectId);
      if (!project) return;

      const validStatuses = [
        "TODO",
        "IN_PROGRESS",
        "UNDER_REVIEW",
        "COMPLETED",
      ];
      const validPriorities = ["LOW", "MEDIUM", "HIGH"];
      const now = Date.now();
      const task = {
        title: title,
        description: body.description || "",
        projectId: body.projectId || "",
        projectName: body.projectName || "",
        assignedTo: body.assignedTo || "",
        assignedToName: body.assignedToName || "",
        status: validStatuses.includes(body.status) ? body.status : "TODO",
        priority: validPriorities.includes(body.priority)
          ? body.priority
          : "MEDIUM",
        dueDate: dueDate || null,
        department: project.department || "",
        createdBy: uid,
        createdByName: session.user.displayName || session.user.email || "",
        createdAt: now,
        updatedAt: now,
      };
      const docRef = await db.collection(COLLECTION).add(task);
      return res
        .status(201)
        .json({ ok: true, data: { id: docRef.id, ...task } });
    }

    case "PUT": {
      if (!taskId) {
        return res
          .status(400)
          .json({ ok: false, error: "Task ID is required." });
      }
      const doc = await db.collection(COLLECTION).doc(taskId).get();
      if (!doc.exists) {
        return res.status(404).json({ ok: false, error: "Task not found." });
      }

      const existing = doc.data();
      if (
        !isManagingDirector(actor) &&
        !canAccessDepartment(actor, existing.department)
      ) {
        return res
          .status(403)
          .json({ ok: false, error: "Access denied for this department." });
      }
      // Employees can only update status of their own tasks
      if (role === "EMPLOYEE") {
        if (existing.assignedTo !== uid) {
          return res.status(403).json({ ok: false, error: "Access denied." });
        }
        const body = req.body || {};
        const validStatuses = [
          "TODO",
          "IN_PROGRESS",
          "UNDER_REVIEW",
          "COMPLETED",
        ];
        const update = { updatedAt: Date.now() };
        if (body.status && validStatuses.includes(body.status)) {
          update.status = body.status;
        }
        await db.collection(COLLECTION).doc(taskId).update(update);
        return res
          .status(200)
          .json({ ok: true, data: { id: taskId, ...update } });
      }

      // PM/MD can update all fields
      const body = req.body || {};
      const update = { updatedAt: Date.now() };
      const validStatuses = [
        "TODO",
        "IN_PROGRESS",
        "UNDER_REVIEW",
        "COMPLETED",
      ];
      const validPriorities = ["LOW", "MEDIUM", "HIGH"];
      let targetProject = null;

      if (body.title !== undefined) {
        const title = String(body.title || "").trim();
        if (!title) {
          return res
            .status(400)
            .json({ ok: false, error: "Task title cannot be empty." });
        }
        update.title = title;
      }
      if (body.description !== undefined) update.description = body.description;
      if (body.assignedTo !== undefined) {
        if (body.assignedTo && !isValidDocId(String(body.assignedTo))) {
          return res
            .status(400)
            .json({ ok: false, error: "Invalid assignee id." });
        }
        update.assignedTo = body.assignedTo;
      }
      if (body.assignedToName !== undefined)
        update.assignedToName = body.assignedToName;
      if (body.status !== undefined) {
        if (!validStatuses.includes(body.status)) {
          return res
            .status(400)
            .json({ ok: false, error: "Invalid task status." });
        }
        update.status = body.status;
      }
      if (body.priority !== undefined) {
        if (!validPriorities.includes(body.priority)) {
          return res
            .status(400)
            .json({ ok: false, error: "Invalid task priority." });
        }
        update.priority = body.priority;
      }
      if (body.dueDate !== undefined) {
        const dueDate = body.dueDate ? parsePositiveTimestamp(body.dueDate) : 0;
        if (body.dueDate && !dueDate) {
          return res.status(400).json({ ok: false, error: "Invalid dueDate." });
        }
        update.dueDate = dueDate || null;
      }
      if (body.projectId !== undefined) {
        if (!body.projectId || !isValidDocId(String(body.projectId))) {
          return res
            .status(400)
            .json({ ok: false, error: "Invalid projectId." });
        }
        const project = await ensureProjectAccess(res, actor, body.projectId);
        if (!project) return;
        targetProject = project;
        update.projectId = body.projectId;
        update.department = project.department || existing.department || "";
      }
      if (body.projectName !== undefined) update.projectName = body.projectName;

      if (body.assignedTo !== undefined && body.assignedTo) {
        const projectToValidate =
          targetProject || (await getProjectById(existing.projectId));
        if (!projectToValidate) {
          return res
            .status(400)
            .json({
              ok: false,
              error: "Cannot validate assignee without a valid project.",
            });
        }
        if (!isAssigneeInProjectTeam(projectToValidate, body.assignedTo)) {
          return res
            .status(400)
            .json({
              ok: false,
              error: "Assignee must be a member of the selected project team.",
            });
        }
      }

      await db.collection(COLLECTION).doc(taskId).update(update);
      return res
        .status(200)
        .json({ ok: true, data: { id: taskId, ...update } });
    }

    case "DELETE": {
      if (role === "EMPLOYEE") {
        return res
          .status(403)
          .json({ ok: false, error: "Only managers can delete tasks." });
      }
      if (!taskId) {
        return res
          .status(400)
          .json({ ok: false, error: "Task ID is required." });
      }
      if (!isManagingDirector(actor)) {
        const doc = await db.collection(COLLECTION).doc(taskId).get();
        if (
          !doc.exists ||
          !canAccessDepartment(actor, (doc.data() || {}).department)
        ) {
          return res
            .status(403)
            .json({ ok: false, error: "Access denied for this department." });
        }
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
async function handleComments(req, res, session, actor) {
  const method = req.method;
  const COLLECTION = "comments";

  switch (method) {
    case "GET": {
      const taskId = req.query && req.query.taskId;
      if (!taskId) {
        return res
          .status(400)
          .json({ ok: false, error: "taskId query parameter is required." });
      }
      if (!isValidDocId(String(taskId))) {
        return res.status(400).json({ ok: false, error: "Invalid taskId." });
      }
      const taskDoc = await db.collection("tasks").doc(taskId).get();
      if (!taskDoc.exists) {
        return res.status(404).json({ ok: false, error: "Task not found." });
      }
      if (
        !isManagingDirector(actor) &&
        !canAccessDepartment(actor, (taskDoc.data() || {}).department)
      ) {
        return res
          .status(403)
          .json({ ok: false, error: "Access denied for this department." });
      }
      const snapshot = await db
        .collection(COLLECTION)
        .where("taskId", "==", taskId)
        .orderBy("createdAt", "asc")
        .get();
      const comments = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      return res.status(200).json({ ok: true, data: comments });
    }

    case "POST": {
      const body = req.body || {};
      if (!body.taskId || !body.text) {
        return res
          .status(400)
          .json({ ok: false, error: "taskId and text are required." });
      }
      if (!isValidDocId(String(body.taskId))) {
        return res.status(400).json({ ok: false, error: "Invalid taskId." });
      }
      const text = String(body.text || "").trim();
      if (!text) {
        return res
          .status(400)
          .json({ ok: false, error: "Comment text is required." });
      }
      if (body.text.length > 2000) {
        return res
          .status(400)
          .json({
            ok: false,
            error: "Comment text must be under 2000 characters.",
          });
      }
      const taskDoc = await db.collection("tasks").doc(body.taskId).get();
      if (!taskDoc.exists) {
        return res.status(404).json({ ok: false, error: "Task not found." });
      }
      const task = taskDoc.data() || {};
      if (
        !isManagingDirector(actor) &&
        !canAccessDepartment(actor, task.department)
      ) {
        return res
          .status(403)
          .json({ ok: false, error: "Access denied for this department." });
      }

      const now = Date.now();
      const comment = {
        taskId: body.taskId,
        department: task.department || "",
        text: text,
        authorId: session.user.uid,
        authorName: session.user.displayName || session.user.email || "",
        authorRole: session.user.role || "",
        createdAt: now,
      };
      const docRef = await db.collection(COLLECTION).add(comment);
      return res
        .status(201)
        .json({ ok: true, data: { id: docRef.id, ...comment } });
    }

    case "DELETE": {
      const commentId = req.query && req.query.id;
      if (!commentId) {
        return res
          .status(400)
          .json({ ok: false, error: "Comment ID is required." });
      }
      if (!isValidDocId(String(commentId))) {
        return res
          .status(400)
          .json({ ok: false, error: "Invalid comment ID." });
      }
      const doc = await db.collection(COLLECTION).doc(commentId).get();
      if (!doc.exists) {
        return res.status(404).json({ ok: false, error: "Comment not found." });
      }
      // Only author or managers can delete
      if (
        session.user.role === "EMPLOYEE" &&
        doc.data().authorId !== session.user.uid
      ) {
        return res.status(403).json({ ok: false, error: "Access denied." });
      }
      if (
        !isManagingDirector(actor) &&
        !canAccessDepartment(actor, (doc.data() || {}).department)
      ) {
        return res
          .status(403)
          .json({ ok: false, error: "Access denied for this department." });
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
async function handleActivityLogs(req, res, session, actor) {
  const method = req.method;
  const COLLECTION = "activity_logs";

  switch (method) {
    case "GET": {
      const query = req.query || {};
      let firestoreQuery = db.collection(COLLECTION);
      if (query.projectId) {
        firestoreQuery = firestoreQuery.where(
          "projectId",
          "==",
          query.projectId,
        );
      }
      if (query.entityType) {
        firestoreQuery = firestoreQuery.where(
          "entityType",
          "==",
          query.entityType,
        );
      }
      const limit = Math.min(parseInt(query.limit) || 50, 200);
      const snapshot = await firestoreQuery
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();
      let logs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!isManagingDirector(actor)) {
        logs = logs.filter((l) => canAccessDepartment(actor, l.department));
      }
      return res.status(200).json({ ok: true, data: logs });
    }

    case "POST": {
      const body = req.body || {};
      if (!body.action || !body.entityType) {
        return res
          .status(400)
          .json({ ok: false, error: "action and entityType are required." });
      }
      if (
        !isManagingDirector(actor) &&
        body.department &&
        !canAccessDepartment(actor, body.department)
      ) {
        return res
          .status(403)
          .json({ ok: false, error: "Access denied for this department." });
      }
      const now = Date.now();
      const log = {
        action: body.action,
        entityType: body.entityType,
        entityId: body.entityId || "",
        entityName: body.entityName || "",
        projectId: body.projectId || "",
        details: body.details || "",
        department: body.department || actor.department || "",
        userId: session.user.uid,
        userName: session.user.displayName || session.user.email || "",
        userRole: session.user.role || "",
        createdAt: now,
      };
      const docRef = await db.collection(COLLECTION).add(log);
      return res
        .status(201)
        .json({ ok: true, data: { id: docRef.id, ...log } });
    }

    default:
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ ok: false, error: "Method not allowed." });
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
async function handleNotifications(req, res, session, actor) {
  const method = req.method;
  const uid = session.user.uid;
  const COLLECTION = "notifications";

  switch (method) {
    case "GET": {
      const snapshot = await db
        .collection(COLLECTION)
        .where("recipientId", "==", uid)
        .get();
      const notifs = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 50);
      return res.status(200).json({ ok: true, data: notifs });
    }

    case "POST": {
      const body = req.body || {};
      if (!body.recipientId || !body.message) {
        return res
          .status(400)
          .json({ ok: false, error: "recipientId and message are required." });
      }
      // Allow batch - recipientIds array
      const recipients = Array.isArray(body.recipientIds)
        ? body.recipientIds
        : [body.recipientId];
      if (!recipients.length) {
        return res
          .status(400)
          .json({ ok: false, error: "At least one recipient is required." });
      }
      if (recipients.length > 100) {
        return res
          .status(400)
          .json({ ok: false, error: "Too many recipients in one request." });
      }
      const invalidRecipient = recipients.some(
        (rid) => !isValidDocId(String(rid)),
      );
      if (invalidRecipient) {
        return res
          .status(400)
          .json({
            ok: false,
            error: "Invalid recipient id in recipient list.",
          });
      }
      if (!isManagingDirector(actor)) {
        const allowed = await getDepartmentEmployeeIds(actor.department);
        const allAllowed = recipients.every((rid) => allowed.has(rid));
        if (!allAllowed) {
          return res
            .status(403)
            .json({
              ok: false,
              error: "Recipients must be in your department.",
            });
        }
      }
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
          createdAt: now,
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
        const snapshot = await db
          .collection(COLLECTION)
          .where("recipientId", "==", uid)
          .get();
        const batch = db.batch();
        let updated = 0;
        snapshot.docs.forEach((d) => {
          const data = d.data() || {};
          if (data.read === true) return;
          batch.update(d.ref, { read: true });
          updated += 1;
        });
        await batch.commit();
        return res.status(200).json({ ok: true, data: { updated: updated } });
      }
      if (!body.id) {
        return res
          .status(400)
          .json({ ok: false, error: "Notification id is required." });
      }
      if (!isValidDocId(String(body.id))) {
        return res
          .status(400)
          .json({ ok: false, error: "Invalid notification id." });
      }
      const notifDoc = await db.collection(COLLECTION).doc(body.id).get();
      if (!notifDoc.exists) {
        return res
          .status(404)
          .json({ ok: false, error: "Notification not found." });
      }
      if ((notifDoc.data() || {}).recipientId !== uid) {
        return res.status(403).json({ ok: false, error: "Access denied." });
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
async function handleMilestones(req, res, session, actor) {
  const method = req.method;
  const role = session.user.role;
  const COLLECTION = "milestones";

  const milestoneId = parseResourceIdFromUrl(req.url, "milestones");

  switch (method) {
    case "GET": {
      const query = req.query || {};
      let firestoreQuery = db.collection(COLLECTION);
      if (query.projectId) {
        if (!isValidDocId(String(query.projectId))) {
          return res
            .status(400)
            .json({ ok: false, error: "Invalid projectId." });
        }
        firestoreQuery = firestoreQuery.where(
          "projectId",
          "==",
          query.projectId,
        );
      }
      const snapshot = await firestoreQuery.orderBy("dueDate", "asc").get();
      let milestones = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!isManagingDirector(actor)) {
        const projectDeptCache = new Map();
        milestones = (
          await Promise.all(
            milestones.map(async (m) => {
              if (canAccessDepartment(actor, m.department)) return m;
              const projectId = String(m.projectId || "").trim();
              if (!projectId) return null;
              if (!projectDeptCache.has(projectId)) {
                const projectDoc = await db
                  .collection("projects")
                  .doc(projectId)
                  .get();
                projectDeptCache.set(
                  projectId,
                  projectDoc.exists
                    ? (projectDoc.data() || {}).department || ""
                    : "",
                );
              }
              const projectDept = projectDeptCache.get(projectId);
              return canAccessDepartment(actor, projectDept) ? m : null;
            }),
          )
        ).filter(Boolean);
      }
      return res.status(200).json({ ok: true, data: milestones });
    }

    case "POST": {
      if (role === "EMPLOYEE") {
        return res
          .status(403)
          .json({ ok: false, error: "Only managers can create milestones." });
      }
      const body = req.body || {};
      const title = String(body.title || "").trim();
      if (!title || !body.projectId) {
        return res
          .status(400)
          .json({ ok: false, error: "title and projectId are required." });
      }
      if (!isValidDocId(String(body.projectId))) {
        return res.status(400).json({ ok: false, error: "Invalid projectId." });
      }
      const validStatuses = ["PENDING", "IN_PROGRESS", "COMPLETED", "BLOCKED"];
      const dueDate = body.dueDate ? parsePositiveTimestamp(body.dueDate) : 0;
      if (body.dueDate && !dueDate) {
        return res.status(400).json({ ok: false, error: "Invalid dueDate." });
      }
      const project = await ensureProjectAccess(res, actor, body.projectId);
      if (!project) return;

      const now = Date.now();
      const milestone = {
        title: title,
        description: body.description || "",
        projectId: body.projectId,
        projectName: body.projectName || "",
        department: project.department || "",
        dueDate: dueDate || null,
        status: validStatuses.includes(body.status) ? body.status : "PENDING",
        createdBy: session.user.uid,
        createdByName: session.user.displayName || session.user.email || "",
        createdAt: now,
        updatedAt: now,
      };
      const docRef = await db.collection(COLLECTION).add(milestone);
      return res
        .status(201)
        .json({ ok: true, data: { id: docRef.id, ...milestone } });
    }

    case "PUT": {
      if (role === "EMPLOYEE") {
        return res
          .status(403)
          .json({ ok: false, error: "Only managers can update milestones." });
      }
      if (!milestoneId) {
        return res
          .status(400)
          .json({ ok: false, error: "Milestone ID is required." });
      }
      const milestoneDoc = await db
        .collection(COLLECTION)
        .doc(milestoneId)
        .get();
      if (!milestoneDoc.exists) {
        return res
          .status(404)
          .json({ ok: false, error: "Milestone not found." });
      }
      if (
        !isManagingDirector(actor) &&
        !canAccessDepartment(actor, (milestoneDoc.data() || {}).department)
      ) {
        return res
          .status(403)
          .json({ ok: false, error: "Access denied for this department." });
      }

      const body = req.body || {};
      const update = { updatedAt: Date.now() };
      const validStatuses = ["PENDING", "IN_PROGRESS", "COMPLETED", "BLOCKED"];
      if (body.title !== undefined) {
        const title = String(body.title || "").trim();
        if (!title) {
          return res
            .status(400)
            .json({ ok: false, error: "Milestone title cannot be empty." });
        }
        update.title = title;
      }
      if (body.description !== undefined) update.description = body.description;
      if (body.dueDate !== undefined) {
        const dueDate = body.dueDate ? parsePositiveTimestamp(body.dueDate) : 0;
        if (body.dueDate && !dueDate) {
          return res.status(400).json({ ok: false, error: "Invalid dueDate." });
        }
        update.dueDate = dueDate || null;
      }
      if (body.status !== undefined) {
        if (!validStatuses.includes(body.status)) {
          return res
            .status(400)
            .json({ ok: false, error: "Invalid milestone status." });
        }
        update.status = body.status;
      }
      await db.collection(COLLECTION).doc(milestoneId).update(update);
      return res
        .status(200)
        .json({ ok: true, data: { id: milestoneId, ...update } });
    }

    case "DELETE": {
      if (role === "EMPLOYEE") {
        return res
          .status(403)
          .json({ ok: false, error: "Only managers can delete milestones." });
      }
      if (!milestoneId) {
        return res
          .status(400)
          .json({ ok: false, error: "Milestone ID is required." });
      }
      if (!isManagingDirector(actor)) {
        const milestoneDoc = await db
          .collection(COLLECTION)
          .doc(milestoneId)
          .get();
        if (
          !milestoneDoc.exists ||
          !canAccessDepartment(actor, (milestoneDoc.data() || {}).department)
        ) {
          return res
            .status(403)
            .json({ ok: false, error: "Access denied for this department." });
        }
      }

      await db.collection(COLLECTION).doc(milestoneId).delete();
      return res.status(200).json({ ok: true });
    }

    default:
      res.setHeader("Allow", "GET, POST, PUT, DELETE");
      return res.status(405).json({ ok: false, error: "Method not allowed." });
  }
}
