const { db } = require("../../lib/firebase");
const { requireSession } = require("../../lib/session");
const { withSecurity } = require("../../lib/security");
const {
  getActorContext,
  canAccessDepartment,
  isManagingDirector,
  isEmployee,
  isProjectManager,
  normalizeRole,
} = require("../../lib/access");
const { isValidDocId } = require("../../lib/sanitize");
const { deriveProjectLifecycle } = require("../../lib/project-lifecycle");

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
      case "team-chat":
        return handleTeamChat(req, res, session, actor);
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

function parseListLimit(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  const safeFallback =
    Number.isFinite(fallback) && fallback > 0 ? Math.floor(fallback) : 50;
  const safeMax = Number.isFinite(max) && max > 0 ? Math.floor(max) : 200;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.min(safeFallback, safeMax);
  }
  return Math.min(parsed, safeMax);
}

const TASK_STATUSES = new Set([
  "TODO",
  "IN_PROGRESS",
  "UNDER_REVIEW",
  "COMPLETED",
]);
const TASK_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH"]);
const LEAVE_POLICIES = {
  ANNUAL: { limit: 20, requiresDocument: false },
  SICK: { limit: 10, requiresDocument: true },
  PERSONAL: { limit: 3, requiresDocument: false },
};
const MAX_TASK_SUBMISSION_FILES = 5;
const MAX_TASK_SUBMISSION_FILE_BYTES = 250 * 1024;
const MAX_TASK_SUBMISSION_TOTAL_BYTES = 450 * 1024;
const MAX_LEAVE_SUPPORT_FILES = 2;
const MAX_LEAVE_SUPPORT_FILE_BYTES = 250 * 1024;
const MAX_LEAVE_SUPPORT_TOTAL_BYTES = 350 * 1024;
const MAX_REASON_LENGTH = 2000;
const MAX_DESCRIPTION_LENGTH = 1500;
const MAX_TASK_NOTES_LENGTH = 4000;

function normalizeText(value, maxLength) {
  return String(value || "")
    .trim()
    .slice(0, maxLength || 4000);
}

function normalizeDateKey(value) {
  const key = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : "";
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function dateKeyFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join("-");
}

function dateKeyFromTimestamp(value) {
  const ts = Number(value);
  if (!Number.isFinite(ts) || ts <= 0) return "";
  return dateKeyFromDate(new Date(ts));
}

function dateKeyToDate(dateKey) {
  const key = normalizeDateKey(dateKey);
  if (!key) return null;
  const parts = key.split("-").map((part) => Number(part));
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTodayDateKey() {
  return dateKeyFromDate(new Date());
}

function businessDaysBetween(startDateKey, endDateKey) {
  const start = dateKeyToDate(startDateKey);
  const end = dateKeyToDate(endDateKey);
  if (!start || !end || end < start) return 0;
  const cursor = new Date(start.getTime());
  let total = 0;
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) total += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

function rangesOverlap(startA, endA, startB, endB) {
  if (!startA || !endA || !startB || !endB) return false;
  return startA <= endB && startB <= endA;
}

function extractMimeTypeFromDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+)[;,]/i);
  return match ? match[1] : "";
}

function extractBase64Payload(dataUrl) {
  const match = String(dataUrl || "").match(
    /^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i,
  );
  if (!match) return null;
  return {
    mimeType: match[1] || "",
    base64: String(match[2] || "").replace(/\s+/g, ""),
  };
}

function getBase64ByteSize(base64Value) {
  const base64 = String(base64Value || "").replace(/\s+/g, "");
  if (
    !base64 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) ||
    base64.length % 4 !== 0
  ) {
    return 0;
  }
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function normalizeInternalLink(value) {
  const link = String(value || "").trim();
  if (!link) return "";
  if (link.startsWith("//")) return "";
  if (link.startsWith("/")) return link;
  return "";
}

function normalizeAttachmentList(rawAttachments, options) {
  if (rawAttachments === undefined) {
    return { ok: true, provided: false, attachments: undefined };
  }
  if (rawAttachments === null) {
    return { ok: true, provided: true, attachments: [] };
  }
  if (!Array.isArray(rawAttachments)) {
    return { ok: false, error: "Attachments must be provided as an array." };
  }

  const maxFiles = Number(options && options.maxFiles) || 1;
  const maxBytesPerFile =
    Number(options && options.maxBytesPerFile) || 100 * 1024;
  const maxTotalBytes =
    Number(options && options.maxTotalBytes) || maxFiles * maxBytesPerFile;
  const label = String((options && options.label) || "attachments");

  if (rawAttachments.length > maxFiles) {
    return {
      ok: false,
      error: `You can upload up to ${maxFiles} ${label}.`,
    };
  }

  let totalBytes = 0;
  const attachments = [];
  for (let index = 0; index < rawAttachments.length; index += 1) {
    const item = rawAttachments[index] || {};
    const name =
      normalizeText(item.name || item.fileName || "", 180) ||
      `${label}-${index + 1}`;
    const dataUrl = String(item.dataUrl || item.content || "").trim();
    const encoded = extractBase64Payload(dataUrl);
    const actualSize = getBase64ByteSize(encoded && encoded.base64);
    const claimedSize = Math.round(Number(item.size) || 0);
    const mimeType =
      normalizeText(item.mimeType || item.type || "", 120) ||
      (encoded && encoded.mimeType) ||
      extractMimeTypeFromDataUrl(dataUrl) ||
      "application/octet-stream";

    if (!encoded || !actualSize) {
      return {
        ok: false,
        error: `${name} is not encoded as a supported file upload.`,
      };
    }
    if (claimedSize && Math.abs(claimedSize - actualSize) > 32) {
      return {
        ok: false,
        error: `${name} could not be verified after upload encoding.`,
      };
    }
    if (actualSize > maxBytesPerFile) {
      return {
        ok: false,
        error: `${name} is too large. Each file must be ${Math.round(
          maxBytesPerFile / 1024,
        )} KB or smaller.`,
      };
    }
    totalBytes += actualSize;
    if (totalBytes > maxTotalBytes) {
      return {
        ok: false,
        error: `Combined ${label} must be ${Math.round(
          maxTotalBytes / 1024,
        )} KB or smaller.`,
      };
    }
    attachments.push({
      name,
      mimeType,
      size: actualSize,
      dataUrl,
    });
  }

  return { ok: true, provided: true, attachments };
}

function serializeTask(task, includeSubmissionFiles) {
  if (!task) return task;
  const payload = { ...task };
  const submissionFiles = Array.isArray(task.submissionFiles)
    ? task.submissionFiles
    : [];
  payload.submissionFileCount = submissionFiles.length;
  if (includeSubmissionFiles) {
    payload.submissionFiles = submissionFiles;
  } else if (submissionFiles.length) {
    payload.submissionFiles = submissionFiles.map((file) => ({
      name: file.name || "",
      mimeType: file.mimeType || "",
      size: Number(file.size) || 0,
    }));
  } else {
    payload.submissionFiles = [];
  }
  const supportingDocuments = Array.isArray(task.supportingDocuments)
    ? task.supportingDocuments
    : [];
  if (!includeSubmissionFiles) {
    payload.supportingDocuments = supportingDocuments.map((file) => ({
      name: file.name || "",
      mimeType: file.mimeType || "",
      size: Number(file.size) || 0,
    }));
  }
  return payload;
}

async function getEmployeeProfileForUser(user) {
  const uid = String((user && user.uid) || "").trim();
  if (uid && isValidDocId(uid)) {
    const byId = await db.collection("employees").doc(uid).get();
    if (byId.exists) return { id: byId.id, ...byId.data() };
  }

  const email = String((user && user.email) || "")
    .trim()
    .toLowerCase();
  if (!email) return null;

  const byEmail = await db
    .collection("employees")
    .where("email", "==", email)
    .limit(1)
    .get();
  if (byEmail.empty) return null;
  const doc = byEmail.docs[0];
  return { id: doc.id, ...doc.data() };
}

function getAnnualLeaveLimitForEmployee(employee, year) {
  const baseLimit = LEAVE_POLICIES.ANNUAL.limit;
  if (!employee || !year) return baseLimit;

  const hireTs =
    parsePositiveTimestamp(employee.hireDate) ||
    parsePositiveTimestamp(employee.createdAt);
  if (!hireTs) return baseLimit;

  const hireDate = new Date(hireTs);
  const hireYear = hireDate.getFullYear();
  if (hireYear < year) return baseLimit;
  if (hireYear > year) return 0;

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const totalDays =
    Math.max(1, Math.floor((yearEnd - yearStart) / 86400000) + 1) || 365;
  const remainingDays = Math.max(
    1,
    Math.floor((yearEnd - hireDate) / 86400000) + 1,
  );
  return Math.max(1, Math.round((remainingDays / totalDays) * baseLimit));
}

function getLeaveDaysWithinYear(request, year) {
  const startKey = normalizeDateKey(request && request.startDateKey);
  const endKey = normalizeDateKey(request && request.endDateKey);
  if (!startKey || !endKey || !year) return 0;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const effectiveStart = startKey < yearStart ? yearStart : startKey;
  const effectiveEnd = endKey > yearEnd ? yearEnd : endKey;
  if (effectiveStart > effectiveEnd) return 0;
  return businessDaysBetween(effectiveStart, effectiveEnd);
}

async function syncEmployeeLeaveStatus(employeeId) {
  const targetId = String(employeeId || "").trim();
  if (!targetId || !isValidDocId(targetId)) return;

  const employeeRef = db.collection("employees").doc(targetId);
  const employeeDoc = await employeeRef.get();
  if (!employeeDoc.exists) return;

  const employee = employeeDoc.data() || {};
  const currentStatus = String(employee.status || "ACTIVE").toUpperCase();
  if (
    currentStatus &&
    currentStatus !== "ACTIVE" &&
    currentStatus !== "ON_LEAVE"
  ) {
    return;
  }

  const snapshot = await db
    .collection("leave_requests")
    .where("employeeId", "==", targetId)
    .where("status", "==", "APPROVED")
    .get();
  const todayKey = getTodayDateKey();
  const isOnLeave = snapshot.docs.some((doc) => {
    const data = doc.data() || {};
    const startKey = normalizeDateKey(data.startDateKey);
    const endKey = normalizeDateKey(data.endDateKey);
    return startKey && endKey && startKey <= todayKey && todayKey <= endKey;
  });

  const nextStatus = isOnLeave ? "ON_LEAVE" : "ACTIVE";
  if (currentStatus === nextStatus) return;

  await employeeRef.set(
    {
      status: nextStatus,
      updatedAt: Date.now(),
    },
    { merge: true },
  );
}

async function listEmployeeLeaveRequests(employeeId) {
  const targetId = String(employeeId || "").trim();
  if (!targetId || !isValidDocId(targetId)) return [];
  const snapshot = await db
    .collection("leave_requests")
    .where("employeeId", "==", targetId)
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function getYearsCoveredByRange(startDateKey, endDateKey) {
  const start = dateKeyToDate(startDateKey);
  const end = dateKeyToDate(endDateKey);
  if (!start || !end || end < start) return [];
  const years = [];
  let year = start.getFullYear();
  const endYear = end.getFullYear();
  while (year <= endYear) {
    years.push(year);
    year += 1;
  }
  return years;
}

async function ensureLeaveAllowance(employee, request, excludeRequestId) {
  const policy = LEAVE_POLICIES[request.type];
  if (!policy) {
    return { ok: false, error: "Invalid leave type." };
  }

  const requests = await listEmployeeLeaveRequests(request.employeeId);
  const activeRequests = requests.filter((item) => {
    if (excludeRequestId && item.id === excludeRequestId) return false;
    return item.status === "PENDING" || item.status === "APPROVED";
  });

  const overlapping = activeRequests.find((item) =>
    rangesOverlap(
      request.startDateKey,
      request.endDateKey,
      normalizeDateKey(item.startDateKey),
      normalizeDateKey(item.endDateKey),
    ),
  );
  if (overlapping) {
    return {
      ok: false,
      error:
        "This leave request overlaps an existing pending or approved request.",
    };
  }

  const years = getYearsCoveredByRange(
    request.startDateKey,
    request.endDateKey,
  );
  for (const year of years) {
    const requestedDays = getLeaveDaysWithinYear(request, year);
    if (!requestedDays) continue;

    const usedDays = activeRequests.reduce((sum, item) => {
      if (String(item.type || "").toUpperCase() !== request.type) return sum;
      return sum + getLeaveDaysWithinYear(item, year);
    }, 0);

    const allowance =
      request.type === "ANNUAL"
        ? getAnnualLeaveLimitForEmployee(employee, year)
        : policy.limit;
    if (usedDays + requestedDays > allowance) {
      return {
        ok: false,
        error: `${request.type} leave exceeds the available allowance for ${year}.`,
        details: {
          year,
          allowance,
          usedDays,
          requestedDays,
        },
      };
    }
  }

  return { ok: true };
}

async function createNotification(recipientId, payload) {
  const targetId = String(recipientId || "").trim();
  if (!targetId || !isValidDocId(targetId)) return;
  if (targetId === String(payload.senderId || "").trim()) return;
  await db.collection("notifications").add({
    recipientId: targetId,
    type: payload.type || "GENERAL",
    message: payload.message || "",
    link: normalizeInternalLink(payload.link),
    entityId: payload.entityId || "",
    entityType: payload.entityType || "",
    roomScope: payload.roomScope || "",
    projectId: payload.projectId || "",
    projectName: payload.projectName || "",
    department: payload.department || "",
    read: false,
    senderId: payload.senderId || "",
    senderName: payload.senderName || "",
    createdAt: Date.now(),
  });
}

function canEmployeeUpdateTaskStatus(currentStatus, nextStatus) {
  const current = String(currentStatus || "TODO").toUpperCase();
  const next = String(nextStatus || "").toUpperCase();
  if (current === "TODO" && next === "IN_PROGRESS") return true;
  if (current === "IN_PROGRESS" && next === "UNDER_REVIEW") return true;
  return false;
}

async function syncProjectProgressFromTasks(projectId) {
  const targetId = String(projectId || "").trim();
  if (!targetId || !isValidDocId(targetId)) return;

  const projectRef = db.collection("projects").doc(targetId);
  const projectDoc = await projectRef.get();
  if (!projectDoc.exists) return;

  const project = projectDoc.data() || {};
  const taskSnapshot = await db
    .collection("tasks")
    .where("projectId", "==", targetId)
    .get();
  const tasks = taskSnapshot.docs.map((doc) => doc.data() || {});
  const summary = {
    total: tasks.length,
    todo: 0,
    inProgress: 0,
    underReview: 0,
    completed: 0,
    overdue: 0,
  };
  const now = Date.now();

  tasks.forEach((task) => {
    const status = String(task.status || "TODO").toUpperCase();
    if (status === "COMPLETED") summary.completed += 1;
    else if (status === "UNDER_REVIEW") summary.underReview += 1;
    else if (status === "IN_PROGRESS") summary.inProgress += 1;
    else summary.todo += 1;

    if (task.dueDate && Number(task.dueDate) < now && status !== "COMPLETED") {
      summary.overdue += 1;
    }
  });

  const currentStatus = String(project.status || "PLANNING").toUpperCase();
  let completionPercentage = 0;

  if (summary.total === 0) {
    completionPercentage = currentStatus === "COMPLETED" ? 100 : 0;
  } else {
    completionPercentage = Math.round(
      (summary.completed / summary.total) * 100,
    );
  }

  const lifecycle = deriveProjectLifecycle({
    ...project,
    completionPercentage,
    taskSummary: summary,
  });
  const nextStatus = String(lifecycle.status || currentStatus).toUpperCase();

  const update = {
    completionPercentage,
    taskSummary: summary,
    status: nextStatus,
    approvalStatus: lifecycle.approvalStatus,
    scheduleProgressPercentage: lifecycle.scheduleProgressPercentage,
    overdue: lifecycle.overdue,
    updatedAt: Date.now(),
  };

  if (nextStatus === "COMPLETED") {
    update.completedAt =
      parsePositiveTimestamp(project.completedAt) || Date.now();
  } else if (currentStatus === "COMPLETED") {
    update.completedAt = null;
  }

  await projectRef.set(update, { merge: true });
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

function canEmployeeLogProject(project, actor) {
  if (!project || !actor) return false;
  const uid = String(actor.uid || "").trim();
  if (!uid) return false;
  if (String(project.projectManagerId || "").trim() === uid) return true;
  return isAssigneeInProjectTeam(project, uid);
}

function canAccessProjectChat(project, session, actor) {
  if (!project || !session || !session.user) return false;
  if (isManagingDirector(actor)) return true;
  if (!canAccessDepartment(actor, project.department)) return false;

  const uid = String(session.user.uid || "")
    .trim()
    .toLowerCase();
  const email = String(session.user.email || "")
    .trim()
    .toLowerCase();
  const name = String(session.user.displayName || "")
    .trim()
    .toLowerCase();
  const managerId = String(project.projectManagerId || "")
    .trim()
    .toLowerCase();
  const managerName = String(project.projectManager || "")
    .trim()
    .toLowerCase();
  const createdById = String(project.createdById || "")
    .trim()
    .toLowerCase();
  const memberIds = Array.isArray(project.teamMemberIds)
    ? project.teamMemberIds.map((id) =>
        String(id || "")
          .trim()
          .toLowerCase(),
      )
    : [];

  return (
    (uid && uid === managerId) ||
    (uid && uid === createdById) ||
    (uid && memberIds.includes(uid)) ||
    (name && name === managerName) ||
    (email && email === managerName)
  );
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

async function getUserById(userId) {
  if (!userId || !isValidDocId(String(userId))) return null;
  const doc = await db.collection("users").doc(String(userId)).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function resolveUserAccountId(rawId) {
  const candidateId = String(rawId || "").trim();
  if (!candidateId || !isValidDocId(candidateId)) return "";

  const directUser = await getUserById(candidateId);
  if (directUser) return directUser.id;

  const employeeDoc = await db.collection("employees").doc(candidateId).get();
  if (!employeeDoc.exists) return "";

  const employee = employeeDoc.data() || {};
  const mappedUserId = String(
    employee.userId || employee.uid || employee.id || "",
  ).trim();
  if (!mappedUserId || !isValidDocId(mappedUserId)) return "";

  const mappedUser = await getUserById(mappedUserId);
  return mappedUser ? mappedUser.id : "";
}

function isApprovedChatRecipient(user) {
  if (!user) return false;
  const role = normalizeRole(user.role);
  if (!role || role === "MANAGING_DIRECTOR") return false;
  if (user.mdApproved === false) return false;
  if (role === "EMPLOYEE" && user.pmApproved !== true) return false;
  return true;
}

function buildTeamChatNotificationLink(role, roomScope) {
  const base =
    normalizeRole(role) === "PROJECT_MANAGER"
      ? "/pm-workspace/team"
      : "/workspace/team";
  const query = roomScope ? `?chatScope=${encodeURIComponent(roomScope)}` : "";
  return `${base}${query}#teamChatCard`;
}

function buildTeamChatNotificationMessage(
  senderName,
  text,
  isProjectRoom,
  projectName,
) {
  const preview =
    text.length > 90 ? `${text.substring(0, 87).trim()}...` : text;
  const context = isProjectRoom
    ? `project ${projectName || "Untitled"}`
    : "department chat";
  return `${senderName || "A teammate"} sent a new message in ${context}: ${preview}`;
}

async function listDepartmentUserRecipients(department) {
  const normalizedDepartment = String(department || "")
    .trim()
    .toLowerCase();
  if (!normalizedDepartment) return [];

  const [userSnap, employeeSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("employees").get(),
  ]);

  const candidateIds = new Set();
  userSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    if (
      String(data.department || "")
        .trim()
        .toLowerCase() === normalizedDepartment
    ) {
      candidateIds.add(doc.id);
    }
  });

  employeeSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    if (
      String(data.department || "")
        .trim()
        .toLowerCase() !== normalizedDepartment
    ) {
      return;
    }
    const mappedId = String(data.userId || data.uid || doc.id || "").trim();
    if (mappedId) candidateIds.add(mappedId);
  });

  return Array.from(candidateIds);
}

async function createTeamChatNotifications(session, options) {
  const senderId = String((session && session.user && session.user.uid) || "");
  if (!senderId) return;

  const department = String(options.department || "").trim();
  const projectId = String(options.projectId || "").trim();
  const projectName = String(options.projectName || "").trim();
  const text = String(options.text || "").trim();
  const roomScope = projectId ? `proj:${projectId}` : "dept";
  const senderName =
    (session &&
      session.user &&
      (session.user.displayName || session.user.email || "")) ||
    "";

  let candidateIds = [];
  if (projectId) {
    candidateIds = await Promise.all(
      []
        .concat(options.projectManagerId || "")
        .concat(
          Array.isArray(options.teamMemberIds) ? options.teamMemberIds : [],
        )
        .map(resolveUserAccountId),
    );
  } else {
    candidateIds = await listDepartmentUserRecipients(department);
  }

  const uniqueIds = Array.from(
    new Set(
      candidateIds
        .map((id) => String(id || "").trim())
        .filter((id) => id && id !== senderId && isValidDocId(id)),
    ),
  );
  if (!uniqueIds.length) return;

  const recipients = (
    await Promise.all(
      uniqueIds.map(async (recipientId) => {
        const user = await getUserById(recipientId);
        return user && isApprovedChatRecipient(user) ? user : null;
      }),
    )
  ).filter(Boolean);
  if (!recipients.length) return;

  const now = Date.now();
  const batch = db.batch();
  recipients.forEach((recipient) => {
    const notif = {
      recipientId: recipient.id,
      type: "TEAM_CHAT",
      message: buildTeamChatNotificationMessage(
        senderName,
        text,
        !!projectId,
        projectName,
      ),
      link: buildTeamChatNotificationLink(recipient.role, roomScope),
      entityId: projectId || department || "",
      entityType: "team_chat",
      roomScope: roomScope,
      projectId: projectId || "",
      projectName: projectName || "",
      department: department || "",
      read: false,
      senderId: senderId,
      senderName: senderName,
      senderRole:
        (session && session.user && String(session.user.role || "")) || "",
      createdAt: now,
    };
    const ref = db.collection("notifications").doc();
    batch.set(ref, notif);
  });
  await batch.commit();
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
      if (!body.projectId || (!body.date && !body.dateKey) || !body.hours) {
        return res.status(400).json({
          ok: false,
          error: "projectId, date, and hours are required.",
        });
      }
      if (!isValidDocId(String(body.projectId))) {
        return res.status(400).json({ ok: false, error: "Invalid projectId." });
      }
      const dateTs = parsePositiveTimestamp(body.date);
      const dateKey =
        normalizeDateKey(body.dateKey) || dateKeyFromTimestamp(dateTs);
      if (!dateTs || !dateKey) {
        return res
          .status(400)
          .json({ ok: false, error: "A valid date is required." });
      }
      if (dateKey > getTodayDateKey()) {
        return res.status(400).json({
          ok: false,
          error: "You cannot log hours for a future date.",
        });
      }
      const hours = Number(body.hours);
      if (Number.isNaN(hours) || hours <= 0 || hours > 24) {
        return res
          .status(400)
          .json({ ok: false, error: "Hours must be between 0 and 24." });
      }
      const project = await ensureProjectAccess(res, actor, body.projectId);
      if (!project) return;
      if (isEmployee(actor) && !canEmployeeLogProject(project, actor)) {
        return res.status(403).json({
          ok: false,
          error: "You can only log time against projects assigned to you.",
        });
      }

      let linkedTask = null;
      const taskId = String(body.taskId || "").trim();
      if (taskId) {
        if (!isValidDocId(taskId)) {
          return res.status(400).json({ ok: false, error: "Invalid taskId." });
        }
        const taskDoc = await db.collection("tasks").doc(taskId).get();
        if (!taskDoc.exists) {
          return res.status(404).json({ ok: false, error: "Task not found." });
        }
        linkedTask = { id: taskDoc.id, ...(taskDoc.data() || {}) };
        if (String(linkedTask.projectId || "") !== String(body.projectId)) {
          return res.status(400).json({
            ok: false,
            error: "Linked task must belong to the selected project.",
          });
        }
        if (isEmployee(actor) && String(linkedTask.assignedTo || "") !== uid) {
          return res.status(403).json({
            ok: false,
            error: "You can only log time against tasks assigned to you.",
          });
        }
      }

      const duplicateDaySnapshot = await db
        .collection(COLLECTION)
        .where("employeeId", "==", uid)
        .where("dateKey", "==", dateKey)
        .get();
      const loggedHoursForDay = duplicateDaySnapshot.docs.reduce(
        (sum, doc) => sum + (Number((doc.data() || {}).hours) || 0),
        0,
      );
      if (loggedHoursForDay + hours > 24.0001) {
        return res.status(400).json({
          ok: false,
          error: "A single day cannot exceed 24 logged hours.",
        });
      }

      const now = Date.now();
      const entry = {
        employeeId: uid,
        employeeName: session.user.displayName || "",
        projectId: String(body.projectId),
        projectName: body.projectName || "",
        department: project.department || "",
        date: dateTs,
        dateKey,
        hours: hours,
        taskId: taskId || "",
        taskTitle: linkedTask
          ? linkedTask.title || ""
          : normalizeText(body.taskTitle, 180),
        description: normalizeText(body.description, MAX_DESCRIPTION_LENGTH),
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
      if (!isEmployee(actor)) {
        return res.status(403).json({
          ok: false,
          error: "Only employees can submit leave requests.",
        });
      }
      const body = req.body || {};
      if (!body.type || !body.startDate || !body.endDate) {
        return res.status(400).json({
          ok: false,
          error: "type, startDate, and endDate are required.",
        });
      }
      const leaveType = String(body.type || "").toUpperCase();
      const policy = LEAVE_POLICIES[leaveType];
      if (!policy) {
        return res.status(400).json({
          ok: false,
          error: "Type must be ANNUAL, SICK, or PERSONAL.",
        });
      }
      const startDate = parsePositiveTimestamp(body.startDate);
      const endDate = parsePositiveTimestamp(body.endDate);
      const startDateKey =
        normalizeDateKey(body.startDateKey) || dateKeyFromTimestamp(startDate);
      const endDateKey =
        normalizeDateKey(body.endDateKey) || dateKeyFromTimestamp(endDate);
      if (!startDate || !endDate || !startDateKey || !endDateKey) {
        return res.status(400).json({
          ok: false,
          error: "Valid startDate and endDate are required.",
        });
      }
      if (endDateKey < startDateKey) {
        return res
          .status(400)
          .json({ ok: false, error: "endDate must be on or after startDate." });
      }
      const businessDays = businessDaysBetween(startDateKey, endDateKey);
      if (!businessDays) {
        return res.status(400).json({
          ok: false,
          error: "Leave dates must include at least one business day.",
        });
      }
      const todayKey = getTodayDateKey();
      if (leaveType !== "SICK" && startDateKey < todayKey) {
        return res.status(400).json({
          ok: false,
          error:
            "Annual and personal leave must be requested before the leave starts.",
        });
      }
      const reason = normalizeText(body.reason, MAX_REASON_LENGTH);
      if (leaveType === "PERSONAL" && !reason) {
        return res.status(400).json({
          ok: false,
          error: "A reason is required for personal leave.",
        });
      }
      const attachmentsCheck = normalizeAttachmentList(
        body.supportingDocuments || body.attachments,
        {
          maxFiles: MAX_LEAVE_SUPPORT_FILES,
          maxBytesPerFile: MAX_LEAVE_SUPPORT_FILE_BYTES,
          maxTotalBytes: MAX_LEAVE_SUPPORT_TOTAL_BYTES,
          label: "supporting documents",
        },
      );
      if (!attachmentsCheck.ok) {
        return res.status(400).json({
          ok: false,
          error: attachmentsCheck.error,
        });
      }
      const supportingDocuments = attachmentsCheck.attachments || [];
      if (policy.requiresDocument && supportingDocuments.length === 0) {
        return res.status(400).json({
          ok: false,
          error:
            "Sick leave requests require a supporting medical certificate.",
        });
      }

      const employee = await getEmployeeProfileForUser(session.user);
      const employeeId = String(
        (employee && (employee.id || employee.userId || employee.uid)) || uid,
      ).trim();
      const employeeStatus = String(
        (employee && employee.status) || "ACTIVE",
      ).toUpperCase();
      if (
        employeeStatus &&
        employeeStatus !== "ACTIVE" &&
        employeeStatus !== "ON_LEAVE"
      ) {
        return res.status(400).json({
          ok: false,
          error:
            "Your current employee status does not allow new leave requests.",
        });
      }

      const allowanceCheck = await ensureLeaveAllowance(
        employee,
        {
          employeeId,
          type: leaveType,
          startDateKey,
          endDateKey,
        },
        "",
      );
      if (!allowanceCheck.ok) {
        return res.status(400).json({
          ok: false,
          error: allowanceCheck.error,
          details: allowanceCheck.details || {},
        });
      }

      const now = Date.now();
      const request = {
        employeeId,
        employeeName:
          (employee && (employee.fullName || employee.displayName)) ||
          session.user.displayName ||
          "",
        department: actor.department || "",
        type: leaveType,
        startDate: startDate,
        endDate: endDate,
        startDateKey,
        endDateKey,
        businessDays,
        reason,
        supportingDocuments,
        status: "PENDING",
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: "",
        createdAt: now,
        updatedAt: now,
      };
      const docRef = await db.collection(COLLECTION).add(request);
      return res
        .status(201)
        .json({ ok: true, data: { id: docRef.id, ...request } });
    }

    case "PUT": {
      const body = req.body || {};
      if (!body.id) {
        return res.status(400).json({ ok: false, error: "id is required." });
      }
      if (!isValidDocId(String(body.id))) {
        return res
          .status(400)
          .json({ ok: false, error: "Invalid request id." });
      }
      const reqDoc = await db.collection(COLLECTION).doc(body.id).get();
      if (!reqDoc.exists) {
        return res.status(404).json({ ok: false, error: "Request not found." });
      }
      const reqData = reqDoc.data() || {};

      if (isEmployee(actor)) {
        if (String(reqData.employeeId || "") !== String(uid)) {
          return res.status(403).json({ ok: false, error: "Access denied." });
        }
        if (String(reqData.status || "").toUpperCase() !== "PENDING") {
          return res.status(400).json({
            ok: false,
            error: "Only pending leave requests can be cancelled.",
          });
        }
        const now = Date.now();
        await db
          .collection(COLLECTION)
          .doc(body.id)
          .update({
            status: "CANCELLED",
            cancelledAt: now,
            cancelledBy: session.user.displayName || session.user.email || "",
            updatedAt: now,
          });
        await syncEmployeeLeaveStatus(reqData.employeeId);
        return res.status(200).json({
          ok: true,
          data: { id: body.id, status: "CANCELLED" },
        });
      }

      if (!body.status) {
        return res
          .status(400)
          .json({ ok: false, error: "status is required." });
      }
      if (
        !isManagingDirector(actor) &&
        !canAccessDepartment(actor, reqData.department)
      ) {
        return res
          .status(403)
          .json({ ok: false, error: "Access denied for this department." });
      }

      const validStatuses = ["APPROVED", "REJECTED"];
      const nextStatus = String(body.status || "").toUpperCase();
      if (!validStatuses.includes(nextStatus)) {
        return res
          .status(400)
          .json({ ok: false, error: "Status must be APPROVED or REJECTED." });
      }
      if (String(reqData.status || "").toUpperCase() !== "PENDING") {
        return res.status(400).json({
          ok: false,
          error: "Only pending leave requests can be reviewed.",
        });
      }

      if (nextStatus === "APPROVED") {
        const employeeId = String(reqData.employeeId || "").trim();
        const employeeDoc =
          employeeId && isValidDocId(employeeId)
            ? await db.collection("employees").doc(employeeId).get()
            : null;
        const employee =
          employeeDoc && employeeDoc.exists
            ? { id: employeeDoc.id, ...employeeDoc.data() }
            : null;
        const allowanceCheck = await ensureLeaveAllowance(
          employee,
          {
            employeeId: String(reqData.employeeId || ""),
            type: String(reqData.type || "").toUpperCase(),
            startDateKey: normalizeDateKey(reqData.startDateKey),
            endDateKey: normalizeDateKey(reqData.endDateKey),
          },
          body.id,
        );
        if (!allowanceCheck.ok) {
          return res.status(400).json({
            ok: false,
            error: allowanceCheck.error,
            details: allowanceCheck.details || {},
          });
        }
      }

      const now = Date.now();
      const reviewNote = normalizeText(body.reviewNote, MAX_REASON_LENGTH);
      await db
        .collection(COLLECTION)
        .doc(body.id)
        .update({
          status: nextStatus,
          reviewedBy: session.user.displayName || session.user.email,
          reviewedAt: now,
          reviewNote,
          updatedAt: now,
        });
      await syncEmployeeLeaveStatus(reqData.employeeId);
      await createNotification(reqData.employeeId, {
        type: "LEAVE_REVIEW",
        message:
          nextStatus === "APPROVED"
            ? "Your leave request was approved."
            : "Your leave request was rejected.",
        link: "/workspace/requests",
        entityId: body.id,
        entityType: "leave_request",
        senderId: session.user.uid,
        senderName: session.user.displayName || session.user.email || "",
      });
      return res.status(200).json({
        ok: true,
        data: { id: body.id, status: nextStatus, reviewNote },
      });
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
        return res.status(400).json({
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
          return res.status(400).json({
            ok: false,
            error: "Document department must match related project department.",
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
  const COLLECTION = "tasks";

  // Parse task ID from URL: /api/workspace/tasks/<id>
  const taskId = parseResourceIdFromUrl(req.url, "tasks");

  switch (method) {
    case "GET": {
      const query = req.query || {};

      if (taskId) {
        const doc = await db.collection(COLLECTION).doc(taskId).get();
        if (!doc.exists) {
          return res.status(404).json({ ok: false, error: "Task not found." });
        }
        const task = { id: doc.id, ...(doc.data() || {}) };
        if (isEmployee(actor) && String(task.assignedTo || "") !== uid) {
          return res.status(403).json({ ok: false, error: "Access denied." });
        }
        if (
          !isManagingDirector(actor) &&
          !isEmployee(actor) &&
          !canAccessDepartment(actor, task.department)
        ) {
          return res
            .status(403)
            .json({ ok: false, error: "Access denied for this department." });
        }
        return res
          .status(200)
          .json({ ok: true, data: serializeTask(task, true) });
      }

      let firestoreQuery = db.collection(COLLECTION);

      if (isEmployee(actor)) {
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
      return res.status(200).json({
        ok: true,
        data: tasks.map((task) => serializeTask(task, false)),
      });
    }

    case "POST": {
      if (isEmployee(actor)) {
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
      if (body.assignedTo) {
        if (!isValidDocId(String(body.assignedTo))) {
          return res
            .status(400)
            .json({ ok: false, error: "Invalid assignee id." });
        }
        if (!isAssigneeInProjectTeam(project, body.assignedTo)) {
          return res.status(400).json({
            ok: false,
            error: "Assignee must be a member of the selected project team.",
          });
        }
      }

      const status = TASK_STATUSES.has(String(body.status || "").toUpperCase())
        ? String(body.status || "").toUpperCase()
        : "TODO";
      const priority = TASK_PRIORITIES.has(
        String(body.priority || "").toUpperCase(),
      )
        ? String(body.priority || "").toUpperCase()
        : "MEDIUM";
      const now = Date.now();
      const task = {
        title: title,
        description: normalizeText(body.description, MAX_DESCRIPTION_LENGTH),
        projectId: String(body.projectId || ""),
        projectName:
          normalizeText(body.projectName, 180) ||
          normalizeText(project.name, 180),
        assignedTo: body.assignedTo || "",
        assignedToName: normalizeText(body.assignedToName, 180),
        status,
        priority,
        dueDate: dueDate || null,
        department: project.department || "",
        createdBy: uid,
        createdByName: session.user.displayName || session.user.email || "",
        submissionNotes: "",
        submissionFiles: [],
        submittedAt: null,
        submittedBy: "",
        submittedByName: "",
        reviewNotes: "",
        reviewedAt: status === "COMPLETED" ? now : null,
        reviewedBy: status === "COMPLETED" ? uid : "",
        reviewedByName:
          status === "COMPLETED"
            ? session.user.displayName || session.user.email || ""
            : "",
        createdAt: now,
        updatedAt: now,
      };
      const docRef = await db.collection(COLLECTION).add(task);
      await syncProjectProgressFromTasks(task.projectId);
      return res.status(201).json({
        ok: true,
        data: serializeTask({ id: docRef.id, ...task }, true),
      });
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
      if (isEmployee(actor)) {
        if (existing.assignedTo !== uid) {
          return res.status(403).json({ ok: false, error: "Access denied." });
        }
        const body = req.body || {};
        const nextStatus = String(body.status || "").toUpperCase();
        if (!TASK_STATUSES.has(nextStatus) || nextStatus === "COMPLETED") {
          return res.status(400).json({
            ok: false,
            error:
              "Employees can only move tasks to In Progress or Under Review.",
          });
        }
        if (!canEmployeeUpdateTaskStatus(existing.status, nextStatus)) {
          return res.status(400).json({
            ok: false,
            error:
              "This task cannot move to that status from its current state.",
          });
        }

        const attachmentsCheck = normalizeAttachmentList(
          body.submissionFiles || body.submissionAttachments,
          {
            maxFiles: MAX_TASK_SUBMISSION_FILES,
            maxBytesPerFile: MAX_TASK_SUBMISSION_FILE_BYTES,
            maxTotalBytes: MAX_TASK_SUBMISSION_TOTAL_BYTES,
            label: "submission files",
          },
        );
        if (!attachmentsCheck.ok) {
          return res.status(400).json({
            ok: false,
            error: attachmentsCheck.error,
          });
        }

        const now = Date.now();
        const update = {
          status: nextStatus,
          updatedAt: now,
        };
        if (body.submissionNotes !== undefined) {
          update.submissionNotes = normalizeText(
            body.submissionNotes,
            MAX_TASK_NOTES_LENGTH,
          );
        }
        if (attachmentsCheck.provided) {
          update.submissionFiles = attachmentsCheck.attachments;
        }
        if (nextStatus === "UNDER_REVIEW") {
          update.submittedAt = now;
          update.submittedBy = uid;
          update.submittedByName =
            session.user.displayName || session.user.email || "";
          update.reviewNotes = "";
          update.reviewedAt = null;
          update.reviewedBy = "";
          update.reviewedByName = "";
        }
        await db.collection(COLLECTION).doc(taskId).update(update);
        await syncProjectProgressFromTasks(existing.projectId);
        if (
          nextStatus === "UNDER_REVIEW" &&
          existing.createdBy &&
          existing.createdBy !== uid
        ) {
          await createNotification(existing.createdBy, {
            type: "TASK_REVIEW",
            message:
              "Task submitted for review: " +
              (existing.title || "Untitled task"),
            link: "/pm-workspace/tasks",
            entityId: taskId,
            entityType: "task",
            senderId: uid,
            senderName: session.user.displayName || session.user.email || "",
          });
        }
        return res.status(200).json({
          ok: true,
          data: serializeTask({ id: taskId, ...existing, ...update }, true),
        });
      }

      const body = req.body || {};
      const now = Date.now();
      const update = { updatedAt: now };
      let targetProject = null;
      const currentStatus = String(existing.status || "TODO").toUpperCase();
      const oldProjectId = String(existing.projectId || "").trim();
      let nextStatus = currentStatus;

      if (body.title !== undefined) {
        const title = String(body.title || "").trim();
        if (!title) {
          return res
            .status(400)
            .json({ ok: false, error: "Task title cannot be empty." });
        }
        update.title = title;
      }
      if (body.description !== undefined) {
        update.description = normalizeText(
          body.description,
          MAX_DESCRIPTION_LENGTH,
        );
      }
      if (body.assignedTo !== undefined) {
        if (body.assignedTo && !isValidDocId(String(body.assignedTo))) {
          return res
            .status(400)
            .json({ ok: false, error: "Invalid assignee id." });
        }
        update.assignedTo = body.assignedTo;
      }
      if (body.assignedToName !== undefined) {
        update.assignedToName = normalizeText(body.assignedToName, 180);
      }
      if (body.status !== undefined) {
        nextStatus = String(body.status || "").toUpperCase();
        if (!TASK_STATUSES.has(nextStatus)) {
          return res
            .status(400)
            .json({ ok: false, error: "Invalid task status." });
        }
        update.status = nextStatus;
      }
      if (body.priority !== undefined) {
        const priority = String(body.priority || "").toUpperCase();
        if (!TASK_PRIORITIES.has(priority)) {
          return res
            .status(400)
            .json({ ok: false, error: "Invalid task priority." });
        }
        update.priority = priority;
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
        if (body.projectName === undefined) {
          update.projectName = normalizeText(project.name, 180);
        }
      }
      if (body.projectName !== undefined) {
        update.projectName = normalizeText(body.projectName, 180);
      }
      if (body.submissionNotes !== undefined) {
        update.submissionNotes = normalizeText(
          body.submissionNotes,
          MAX_TASK_NOTES_LENGTH,
        );
      }
      if (body.reviewNotes !== undefined) {
        update.reviewNotes = normalizeText(
          body.reviewNotes,
          MAX_TASK_NOTES_LENGTH,
        );
      }

      if (body.assignedTo !== undefined && body.assignedTo) {
        const projectToValidate =
          targetProject ||
          (await getProjectById(update.projectId || existing.projectId));
        if (!projectToValidate) {
          return res.status(400).json({
            ok: false,
            error: "Cannot validate assignee without a valid project.",
          });
        }
        if (!isAssigneeInProjectTeam(projectToValidate, body.assignedTo)) {
          return res.status(400).json({
            ok: false,
            error: "Assignee must be a member of the selected project team.",
          });
        }
      }
      if (
        body.projectId !== undefined &&
        body.assignedTo === undefined &&
        existing.assignedTo
      ) {
        const projectToValidate = targetProject;
        if (
          projectToValidate &&
          !isAssigneeInProjectTeam(projectToValidate, existing.assignedTo)
        ) {
          return res.status(400).json({
            ok: false,
            error:
              "Reassign or clear the current assignee before moving this task to a different project.",
          });
        }
      }

      if (body.status !== undefined) {
        if (nextStatus === "COMPLETED") {
          update.reviewedAt = now;
          update.reviewedBy = uid;
          update.reviewedByName =
            session.user.displayName || session.user.email || "";
          if (body.reviewNotes === undefined) {
            update.reviewNotes = normalizeText(
              existing.reviewNotes || "Task approved and marked complete.",
              MAX_TASK_NOTES_LENGTH,
            );
          }
        } else if (
          currentStatus === "UNDER_REVIEW" &&
          (nextStatus === "IN_PROGRESS" || nextStatus === "TODO")
        ) {
          update.reviewedAt = now;
          update.reviewedBy = uid;
          update.reviewedByName =
            session.user.displayName || session.user.email || "";
          if (body.reviewNotes === undefined) {
            update.reviewNotes = "Changes requested.";
          }
        } else if (
          currentStatus === "COMPLETED" &&
          nextStatus !== "COMPLETED"
        ) {
          update.reviewedAt = null;
          update.reviewedBy = "";
          update.reviewedByName = "";
        }
      }

      await db.collection(COLLECTION).doc(taskId).update(update);
      const finalProjectId = String(update.projectId || oldProjectId).trim();
      if (oldProjectId) {
        await syncProjectProgressFromTasks(oldProjectId);
      }
      if (finalProjectId && finalProjectId !== oldProjectId) {
        await syncProjectProgressFromTasks(finalProjectId);
      }

      const shouldNotifyAssignee =
        existing.assignedTo &&
        existing.assignedTo !== uid &&
        body.status !== undefined &&
        currentStatus !== nextStatus &&
        (nextStatus === "COMPLETED" ||
          (currentStatus === "UNDER_REVIEW" &&
            (nextStatus === "IN_PROGRESS" || nextStatus === "TODO")));
      if (shouldNotifyAssignee) {
        await createNotification(existing.assignedTo, {
          type: "TASK_REVIEW_RESULT",
          message:
            nextStatus === "COMPLETED"
              ? "Your task was approved and marked complete."
              : "Your task needs revisions before approval.",
          link: "/workspace",
          entityId: taskId,
          entityType: "task",
          senderId: uid,
          senderName: session.user.displayName || session.user.email || "",
        });
      }

      return res.status(200).json({
        ok: true,
        data: serializeTask({ id: taskId, ...existing, ...update }, true),
      });
    }

    case "DELETE": {
      if (isEmployee(actor)) {
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

      const taskDoc = await db.collection(COLLECTION).doc(taskId).get();
      const projectId = taskDoc.exists
        ? String((taskDoc.data() || {}).projectId || "").trim()
        : "";
      await db.collection(COLLECTION).doc(taskId).delete();
      if (projectId) {
        await syncProjectProgressFromTasks(projectId);
      }
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
        return res.status(400).json({
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
      if (isEmployee(actor) && doc.data().authorId !== session.user.uid) {
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
// Team Chat
// ---------------------------------------------------------------------------
async function handleTeamChat(req, res, session, actor) {
  const method = req.method;
  const COLLECTION = "team_chats";

  async function readMessagesWithFallback(field, value, limit) {
    try {
      return await db
        .collection(COLLECTION)
        .where(field, "==", value)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();
    } catch (err) {
      // Fallback for environments missing composite index for where + orderBy.
      return await db
        .collection(COLLECTION)
        .where(field, "==", value)
        .limit(limit)
        .get();
    }
  }

  function resolveTargetDepartment(inputDepartment) {
    const requested = String(inputDepartment || "").trim();
    if (isEmployee(actor)) {
      return String(actor.department || "").trim();
    }
    if (!requested) return String(actor.department || "").trim();
    return requested;
  }

  switch (method) {
    case "GET": {
      const query = req.query || {};
      const queryProjectId = String(query.projectId || "").trim();

      if (queryProjectId) {
        if (!isValidDocId(queryProjectId)) {
          return res
            .status(400)
            .json({ ok: false, error: "Invalid projectId." });
        }
        const project = await getProjectById(queryProjectId);
        if (!project) {
          return res
            .status(404)
            .json({ ok: false, error: "Project not found." });
        }
        if (!canAccessProjectChat(project, session, actor)) {
          return res
            .status(403)
            .json({ ok: false, error: "Access denied for this project chat." });
        }

        const limit = parseListLimit(query.limit, 100, 200);
        const projectSnap = await readMessagesWithFallback(
          "projectId",
          queryProjectId,
          limit,
        );

        const projectMessages = projectSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

        return res.status(200).json({ ok: true, data: projectMessages });
      }

      const targetDepartment = resolveTargetDepartment(query.department);
      if (!targetDepartment) {
        return res.status(400).json({
          ok: false,
          error: "A department is required for team chat.",
        });
      }
      if (
        !isManagingDirector(actor) &&
        !canAccessDepartment(actor, targetDepartment)
      ) {
        return res
          .status(403)
          .json({ ok: false, error: "Access denied for this department." });
      }

      const limit = parseListLimit(query.limit, 100, 200);
      const snapshot = await readMessagesWithFallback(
        "department",
        targetDepartment,
        limit,
      );

      const messages = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((m) => !m.projectId)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

      return res.status(200).json({ ok: true, data: messages });
    }

    case "POST": {
      const body = req.body || {};
      const bodyProjectId = String(body.projectId || "").trim();

      if (bodyProjectId) {
        if (!isValidDocId(bodyProjectId)) {
          return res
            .status(400)
            .json({ ok: false, error: "Invalid projectId." });
        }
        const project = await getProjectById(bodyProjectId);
        if (!project) {
          return res
            .status(404)
            .json({ ok: false, error: "Project not found." });
        }
        if (!canAccessProjectChat(project, session, actor)) {
          return res
            .status(403)
            .json({ ok: false, error: "Access denied for this project chat." });
        }

        const text = String(body.text || "").trim();
        if (!text) {
          return res
            .status(400)
            .json({ ok: false, error: "Message text is required." });
        }
        if (text.length > 1000) {
          return res.status(400).json({
            ok: false,
            error: "Message must be under 1000 characters.",
          });
        }

        const now = Date.now();
        const message = {
          department: project.department || "",
          projectId: bodyProjectId,
          projectName: project.name || body.projectName || "",
          text: text,
          authorId: session.user.uid,
          authorName: session.user.displayName || session.user.email || "",
          authorRole: session.user.role || "",
          createdAt: now,
          updatedAt: now,
        };

        const docRef = await db.collection(COLLECTION).add(message);
        await createTeamChatNotifications(session, {
          department: project.department || "",
          projectId: bodyProjectId,
          projectName: project.name || body.projectName || "",
          text: text,
          projectManagerId: project.projectManagerId || "",
          teamMemberIds: Array.isArray(project.teamMemberIds)
            ? project.teamMemberIds
            : [],
        });
        return res
          .status(201)
          .json({ ok: true, data: { id: docRef.id, ...message } });
      }

      const targetDepartment = resolveTargetDepartment(body.department);
      if (!targetDepartment) {
        return res.status(400).json({
          ok: false,
          error: "A department is required for team chat.",
        });
      }
      if (
        !isManagingDirector(actor) &&
        !canAccessDepartment(actor, targetDepartment)
      ) {
        return res
          .status(403)
          .json({ ok: false, error: "Access denied for this department." });
      }

      const text = String(body.text || "").trim();
      if (!text) {
        return res
          .status(400)
          .json({ ok: false, error: "Message text is required." });
      }
      if (text.length > 1000) {
        return res
          .status(400)
          .json({ ok: false, error: "Message must be under 1000 characters." });
      }

      const now = Date.now();
      const message = {
        department: targetDepartment,
        projectId: null,
        projectName: "",
        text: text,
        authorId: session.user.uid,
        authorName: session.user.displayName || session.user.email || "",
        authorRole: session.user.role || "",
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await db.collection(COLLECTION).add(message);
      await createTeamChatNotifications(session, {
        department: targetDepartment,
        text: text,
      });
      return res
        .status(201)
        .json({ ok: true, data: { id: docRef.id, ...message } });
    }

    default:
      res.setHeader("Allow", "GET, POST");
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
      const limit = parseListLimit(query.limit, 50, 200);
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
      const recipients = Array.isArray(body.recipientIds)
        ? body.recipientIds
        : body.recipientId
          ? [body.recipientId]
          : [];
      const uniqueRecipients = Array.from(
        new Set(
          recipients.map((rid) => String(rid || "").trim()).filter(Boolean),
        ),
      );
      if (!body.message) {
        return res
          .status(400)
          .json({ ok: false, error: "message is required." });
      }
      if (!uniqueRecipients.length) {
        return res
          .status(400)
          .json({ ok: false, error: "At least one recipient is required." });
      }
      if (uniqueRecipients.length > 100) {
        return res
          .status(400)
          .json({ ok: false, error: "Too many recipients in one request." });
      }
      const invalidRecipient = uniqueRecipients.some(
        (rid) => !isValidDocId(String(rid)),
      );
      if (invalidRecipient) {
        return res.status(400).json({
          ok: false,
          error: "Invalid recipient id in recipient list.",
        });
      }
      if (!isManagingDirector(actor)) {
        const allowed = await getDepartmentEmployeeIds(actor.department);
        const allAllowed = uniqueRecipients.every((rid) => allowed.has(rid));
        if (!allAllowed) {
          return res.status(403).json({
            ok: false,
            error: "Recipients must be in your department.",
          });
        }
      }
      const now = Date.now();
      const batch = db.batch();
      const results = [];
      for (const rid of uniqueRecipients) {
        const notif = {
          recipientId: rid,
          type: body.type || "GENERAL",
          message: body.message,
          link: normalizeInternalLink(body.link),
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
      if (isEmployee(actor)) {
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
      if (isEmployee(actor)) {
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
      if (isEmployee(actor)) {
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
