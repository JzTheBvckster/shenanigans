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
const {
  deriveProjectLifecycle,
  normalizeApprovalStatus,
} = require("../../lib/project-lifecycle");

const COLLECTION = "projects";
const ALLOWED_PROJECT_STATUSES = new Set([
  "PENDING_APPROVAL",
  "PLANNING",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
  "ARCHIVED",
]);

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

function normalizeDepartment(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

async function validateTeamMemberDepartments(
  teamMemberIds,
  expectedDepartment,
) {
  if (!Array.isArray(teamMemberIds) || !teamMemberIds.length) {
    return { ok: true };
  }
  const normalizedExpectedDepartment = normalizeDepartment(expectedDepartment);
  if (!normalizedExpectedDepartment) {
    return {
      ok: false,
      error: "Department is required when assigning team members.",
    };
  }

  const employeeDocs = await Promise.all(
    teamMemberIds.map((id) => db.collection("employees").doc(id).get()),
  );

  const missingIds = [];
  const mismatchedIds = [];
  employeeDocs.forEach((doc, index) => {
    const memberId = teamMemberIds[index];
    if (!doc.exists) {
      missingIds.push(memberId);
      return;
    }
    const data = doc.data() || {};
    if (normalizeDepartment(data.department) !== normalizedExpectedDepartment) {
      mismatchedIds.push(memberId);
    }
  });

  if (missingIds.length) {
    return {
      ok: false,
      error: "Some selected team members do not exist.",
      details: { missingIds },
    };
  }
  if (mismatchedIds.length) {
    return {
      ok: false,
      error:
        "Team members must belong to the same department as the project manager.",
      details: { mismatchedIds },
    };
  }
  return { ok: true };
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

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function normalizeApprovalDecision(value) {
  const raw = String(value === undefined ? "" : value)
    .trim()
    .toUpperCase();
  if (!raw) return "";
  if (["YES", "APPROVE", "APPROVED", "TRUE"].includes(raw)) return "YES";
  if (["NO", "REJECT", "REJECTED", "FALSE"].includes(raw)) return "NO";
  return "";
}

function applyLifecycleState(target, baseline) {
  const lifecycle = deriveProjectLifecycle({
    ...(baseline || {}),
    ...(target || {}),
  });
  target.status = lifecycle.status;
  target.approvalStatus = lifecycle.approvalStatus;
  target.scheduleProgressPercentage = lifecycle.scheduleProgressPercentage;
  target.overdue = lifecycle.overdue;
}

async function resolveProjectCreatorRole(project) {
  const directRole = normalizeRole(project && project.createdByRole);
  if (directRole) return directRole;

  const creatorId = String((project && project.createdById) || "").trim();
  if (!creatorId || !isValidDocId(creatorId)) return "";

  try {
    const creatorDoc = await db.collection("users").doc(creatorId).get();
    if (!creatorDoc.exists) return "";
    return normalizeRole((creatorDoc.data() || {}).role);
  } catch (_err) {
    return "";
  }
}

module.exports = withSecurity(
  async function handler(req, res) {
    const session = await requireSession(req, res);
    if (!session) return;

    const actor = await getActorContext(session);

    if (isEmployee(actor) && req.method !== "GET") {
      return res
        .status(403)
        .json({ ok: false, error: "Access denied for employee role." });
    }

    const method = req.method;
    const segments = (req.url || "").split("/").filter(Boolean);
    const entityId =
      segments.length >= 3
        ? decodeURIComponent(segments[2].split("?")[0])
        : null;
    if (entityId && !isValidDocId(entityId)) {
      return res.status(400).json({ ok: false, error: "Invalid project ID." });
    }

    switch (method) {
      case "GET": {
        const snapshot = await db.collection(COLLECTION).get();
        let projects = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        projects = projects.map((project) => ({
          ...project,
          ...deriveProjectLifecycle(project),
        }));
        if (!isManagingDirector(actor)) {
          projects = projects.filter((p) =>
            canAccessDepartment(actor, p.department),
          );
        }
        return res.status(200).json({ ok: true, data: projects });
      }

      case "POST": {
        if (!(isManagingDirector(actor) || isProjectManager(actor))) {
          return res.status(403).json({ ok: false, error: "Access denied." });
        }
        const body = req.body || {};
        if (!body.name) {
          return res
            .status(400)
            .json({ ok: false, error: "Project name is required." });
        }

        if (!body.department && isManagingDirector(actor)) {
          return res
            .status(400)
            .json({ ok: false, error: "Department is required." });
        }

        const budget = parseNonNegativeNumber(body.budget, 0);
        const spent = parseNonNegativeNumber(body.spent, 0);
        const completionPercentage = parsePercent(body.completionPercentage, 0);
        const startDate = parsePositiveTimestampOrZero(body.startDate);
        const endDate = parsePositiveTimestampOrZero(body.endDate);
        if (Number.isNaN(budget) || Number.isNaN(spent)) {
          return res.status(400).json({
            ok: false,
            error: "Budget and spent must be non-negative numbers.",
          });
        }
        if (Number.isNaN(completionPercentage)) {
          return res.status(400).json({
            ok: false,
            error: "completionPercentage must be between 0 and 100.",
          });
        }
        if (Number.isNaN(startDate) || Number.isNaN(endDate)) {
          return res
            .status(400)
            .json({ ok: false, error: "Invalid project dates." });
        }
        if (endDate && startDate && endDate < startDate) {
          return res.status(400).json({
            ok: false,
            error: "endDate must be on or after startDate.",
          });
        }
        if (spent > budget && budget > 0) {
          return res
            .status(400)
            .json({ ok: false, error: "spent cannot exceed budget." });
        }

        const normalizedTeamMemberIds = normalizeTeamMemberIds(
          body.teamMemberIds || [],
        );
        if (normalizedTeamMemberIds === null) {
          return res
            .status(400)
            .json({ ok: false, error: "teamMemberIds contains invalid IDs." });
        }

        body.teamMemberIds = normalizedTeamMemberIds;
        body.budget = budget;
        body.spent = spent;
        body.completionPercentage = completionPercentage;
        body.startDate = startDate || 0;
        body.endDate = endDate || 0;
        delete body.status;

        if (!isManagingDirector(actor)) {
          if (!actor.department) {
            return res.status(403).json({
              ok: false,
              error: "Department not configured for your account.",
            });
          }
          body.department = actor.department;
          body.projectManager =
            actor.displayName || actor.email || body.projectManager || "";
          body.projectManagerId = actor.uid || body.projectManagerId || "";
        }

        const departmentValidation = await validateTeamMemberDepartments(
          body.teamMemberIds,
          body.department,
        );
        if (!departmentValidation.ok) {
          return res.status(400).json({
            ok: false,
            error: departmentValidation.error,
            details: departmentValidation.details || {},
          });
        }

        const now = Date.now();
        body.createdAt = now;
        body.updatedAt = now;
        body.createdById = session.user.uid || "";
        body.createdByName =
          session.user.displayName || session.user.email || "";
        body.createdByRole = normalizeRole(actor.role || session.user.role);
        body.approvalRequired = !isManagingDirector(actor);
        body.approvalStatus = isManagingDirector(actor)
          ? "APPROVED"
          : "PENDING";
        if (body.approvalStatus === "APPROVED") {
          body.approvedAt = now;
          body.approvedById = session.user.uid || "";
          body.approvedByName =
            session.user.displayName || session.user.email || "";
        } else {
          body.submittedForApprovalAt = now;
          body.submissionSnapshot = {
            name: body.name || "",
            description: body.description || "",
            department: body.department || "",
            priority: body.priority || "MEDIUM",
            budget: body.budget || 0,
            spent: body.spent || 0,
            completionPercentage: body.completionPercentage || 0,
            startDate: body.startDate || 0,
            endDate: body.endDate || 0,
            teamMemberIds: Array.isArray(body.teamMemberIds)
              ? body.teamMemberIds
              : [],
            submittedById: body.createdById,
            submittedByName: body.createdByName,
            submittedAt: now,
          };
        }
        applyLifecycleState(body);
        if (!body.projectManagerId) body.projectManagerId = "";
        const docRef = await db.collection(COLLECTION).add(body);
        return res.status(201).json({ ok: true, data: { id: docRef.id } });
      }

      case "PUT": {
        if (!entityId) {
          return res
            .status(400)
            .json({ ok: false, error: "Project ID is required in path." });
        }
        const existingDoc = await db.collection(COLLECTION).doc(entityId).get();
        if (!existingDoc.exists) {
          return res
            .status(404)
            .json({ ok: false, error: "Project not found." });
        }
        const existing = existingDoc.data() || {};

        if (
          !isManagingDirector(actor) &&
          !canAccessDepartment(actor, existing.department)
        ) {
          return res
            .status(403)
            .json({ ok: false, error: "Access denied for this department." });
        }

        const body = req.body || {};
        if (!isManagingDirector(actor)) {
          delete body.department;
        }
        delete body.forceStatusTransition;

        if (Object.prototype.hasOwnProperty.call(body, "name")) {
          const name = String(body.name || "").trim();
          if (!name) {
            return res
              .status(400)
              .json({ ok: false, error: "Project name is required." });
          }
          body.name = name;
        }

        if (Object.prototype.hasOwnProperty.call(body, "status")) {
          const requestedStatus = String(body.status || "").toUpperCase();
          if (!ALLOWED_PROJECT_STATUSES.has(requestedStatus)) {
            return res
              .status(400)
              .json({ ok: false, error: "Invalid project status." });
          }
          if (requestedStatus !== "ARCHIVED") {
            return res.status(400).json({
              ok: false,
              error:
                "Project status is calculated automatically and cannot be set manually.",
            });
          }
          if (!isManagingDirector(actor)) {
            return res.status(403).json({
              ok: false,
              error: "Only Managing Directors can archive projects.",
            });
          }
          body.status = "ARCHIVED";
        }

        const decisionInput =
          body.approvalDecision !== undefined
            ? body.approvalDecision
            : body.approved;
        const hasApprovalDecisionInput =
          Object.prototype.hasOwnProperty.call(body, "approvalDecision") ||
          Object.prototype.hasOwnProperty.call(body, "approved");
        const approvalDecision = normalizeApprovalDecision(decisionInput);
        if (hasApprovalDecisionInput && !approvalDecision) {
          return res.status(400).json({
            ok: false,
            error: "approvalDecision must be YES or NO.",
          });
        }
        const approvalNote = String(body.approvalNote || "")
          .trim()
          .slice(0, 1600);
        delete body.approvalDecision;
        delete body.approvalNote;
        delete body.approved;

        if (approvalDecision) {
          if (!isManagingDirector(actor)) {
            return res.status(403).json({
              ok: false,
              error: "Only Managing Directors can review project approvals.",
            });
          }
          const now = Date.now();
          body.approvalReviewedAt = now;
          body.approvalReviewedById = session.user.uid || "";
          body.approvalReviewedByName =
            session.user.displayName || session.user.email || "";
          body.approvalReviewNote = approvalNote;
          if (approvalDecision === "YES") {
            body.approvalStatus = "APPROVED";
            body.approvedAt = now;
            body.approvedById = session.user.uid || "";
            body.approvedByName =
              session.user.displayName || session.user.email || "";
            body.rejectedAt = null;
            body.rejectedById = "";
            body.rejectedByName = "";
          } else {
            body.approvalStatus = "REJECTED";
            body.rejectedAt = now;
            body.rejectedById = session.user.uid || "";
            body.rejectedByName =
              session.user.displayName || session.user.email || "";
          }
        }

        if (!isManagingDirector(actor)) {
          delete body.approvedAt;
          delete body.approvedById;
          delete body.approvedByName;
          delete body.rejectedAt;
          delete body.rejectedById;
          delete body.rejectedByName;
          delete body.approvalReviewedAt;
          delete body.approvalReviewedById;
          delete body.approvalReviewedByName;
          delete body.approvalReviewNote;
          delete body.approvalStatus;
        }

        let teamMemberIdsChanged = false;
        let normalizedTeamMemberIds = null;
        if (Object.prototype.hasOwnProperty.call(body, "teamMemberIds")) {
          normalizedTeamMemberIds = normalizeTeamMemberIds(body.teamMemberIds);
          if (normalizedTeamMemberIds === null) {
            return res.status(400).json({
              ok: false,
              error: "teamMemberIds contains invalid IDs.",
            });
          }
          body.teamMemberIds = normalizedTeamMemberIds;
          teamMemberIdsChanged = true;
        }

        if (
          teamMemberIdsChanged &&
          isProjectManager(actor) &&
          !isManagingDirector(actor)
        ) {
          const creatorRole = await resolveProjectCreatorRole(existing);
          if (creatorRole !== "MANAGING_DIRECTOR") {
            return res.status(403).json({
              ok: false,
              error:
                "Team members can only be updated for projects created by Managing Directors.",
            });
          }
        }

        if (Object.prototype.hasOwnProperty.call(body, "budget")) {
          const budget = parseNonNegativeNumber(body.budget, 0);
          if (Number.isNaN(budget)) {
            return res.status(400).json({
              ok: false,
              error: "budget must be a non-negative number.",
            });
          }
          body.budget = budget;
        }
        if (Object.prototype.hasOwnProperty.call(body, "spent")) {
          const spent = parseNonNegativeNumber(body.spent, 0);
          if (Number.isNaN(spent)) {
            return res.status(400).json({
              ok: false,
              error: "spent must be a non-negative number.",
            });
          }
          body.spent = spent;
        }
        if (
          Object.prototype.hasOwnProperty.call(body, "completionPercentage")
        ) {
          const completionPercentage = parsePercent(
            body.completionPercentage,
            0,
          );
          if (Number.isNaN(completionPercentage)) {
            return res.status(400).json({
              ok: false,
              error: "completionPercentage must be between 0 and 100.",
            });
          }
          body.completionPercentage = completionPercentage;
        }
        if (Object.prototype.hasOwnProperty.call(body, "startDate")) {
          const startDate = parsePositiveTimestampOrZero(body.startDate);
          if (Number.isNaN(startDate)) {
            return res
              .status(400)
              .json({ ok: false, error: "Invalid startDate." });
          }
          body.startDate = startDate || 0;
        }
        if (Object.prototype.hasOwnProperty.call(body, "endDate")) {
          const endDate = parsePositiveTimestampOrZero(body.endDate);
          if (Number.isNaN(endDate)) {
            return res
              .status(400)
              .json({ ok: false, error: "Invalid endDate." });
          }
          body.endDate = endDate || 0;
        }

        const effectiveBudget = Object.prototype.hasOwnProperty.call(
          body,
          "budget",
        )
          ? body.budget
          : parseNonNegativeNumber(existing.budget, 0);
        const effectiveSpent = Object.prototype.hasOwnProperty.call(
          body,
          "spent",
        )
          ? body.spent
          : parseNonNegativeNumber(existing.spent, 0);
        const effectiveStartDate = Object.prototype.hasOwnProperty.call(
          body,
          "startDate",
        )
          ? body.startDate
          : parsePositiveTimestampOrZero(existing.startDate);
        const effectiveEndDate = Object.prototype.hasOwnProperty.call(
          body,
          "endDate",
        )
          ? body.endDate
          : parsePositiveTimestampOrZero(existing.endDate);
        if (effectiveBudget > 0 && effectiveSpent > effectiveBudget) {
          return res
            .status(400)
            .json({ ok: false, error: "spent cannot exceed budget." });
        }
        if (
          effectiveStartDate &&
          effectiveEndDate &&
          effectiveEndDate < effectiveStartDate
        ) {
          return res.status(400).json({
            ok: false,
            error: "endDate must be on or after startDate.",
          });
        }

        const effectiveDepartment = Object.prototype.hasOwnProperty.call(
          body,
          "department",
        )
          ? body.department
          : existing.department;
        const shouldValidateTeamDepartment =
          teamMemberIdsChanged ||
          Object.prototype.hasOwnProperty.call(body, "department");
        if (shouldValidateTeamDepartment) {
          const candidateTeamMemberIds = teamMemberIdsChanged
            ? normalizedTeamMemberIds || []
            : normalizeTeamMemberIds(existing.teamMemberIds || []);
          if (candidateTeamMemberIds === null) {
            return res.status(400).json({
              ok: false,
              error: "Existing teamMemberIds are invalid.",
            });
          }
          const departmentValidation = await validateTeamMemberDepartments(
            candidateTeamMemberIds,
            effectiveDepartment,
          );
          if (!departmentValidation.ok) {
            return res.status(400).json({
              ok: false,
              error: departmentValidation.error,
              details: departmentValidation.details || {},
            });
          }
        }

        if (!isManagingDirector(actor)) {
          const existingApproval = normalizeApprovalStatus(existing);
          if (existingApproval !== "APPROVED") {
            const now = Date.now();
            body.approvalStatus = "PENDING";
            body.submittedForApprovalAt = now;
            body.submissionSnapshot = {
              name: Object.prototype.hasOwnProperty.call(body, "name")
                ? body.name
                : existing.name || "",
              description: Object.prototype.hasOwnProperty.call(
                body,
                "description",
              )
                ? body.description || ""
                : existing.description || "",
              department: Object.prototype.hasOwnProperty.call(
                body,
                "department",
              )
                ? body.department || ""
                : existing.department || "",
              priority: Object.prototype.hasOwnProperty.call(body, "priority")
                ? body.priority || "MEDIUM"
                : existing.priority || "MEDIUM",
              budget: effectiveBudget,
              spent: effectiveSpent,
              completionPercentage: Object.prototype.hasOwnProperty.call(
                body,
                "completionPercentage",
              )
                ? body.completionPercentage
                : Math.max(
                    0,
                    Math.min(100, Number(existing.completionPercentage) || 0),
                  ),
              startDate: effectiveStartDate,
              endDate: effectiveEndDate,
              teamMemberIds: teamMemberIdsChanged
                ? normalizedTeamMemberIds || []
                : normalizeTeamMemberIds(existing.teamMemberIds || []) || [],
              submittedById: session.user.uid || "",
              submittedByName:
                session.user.displayName || session.user.email || "",
              submittedAt: now,
            };
          }
        }

        if (body.status !== "ARCHIVED") {
          applyLifecycleState(body, existing);
        } else {
          body.overdue = false;
          body.archivedAt = Date.now();
          if (!body.approvalStatus) {
            body.approvalStatus = normalizeApprovalStatus({
              ...existing,
              ...body,
            });
          }
        }

        body.updatedAt = Date.now();
        delete body.id;
        await db.collection(COLLECTION).doc(entityId).update(body);

        if (teamMemberIdsChanged) {
          const teamSet = new Set(
            (normalizedTeamMemberIds || []).map((id) => String(id)),
          );
          const tasksSnap = await db
            .collection("tasks")
            .where("projectId", "==", entityId)
            .get();
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
              batch.update(doc.ref, {
                assignedTo: "",
                assignedToName: "",
                updatedAt: now,
              });
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
          return res
            .status(400)
            .json({ ok: false, error: "Project ID is required in path." });
        }
        if (!isManagingDirector(actor)) {
          return res.status(403).json({
            ok: false,
            error: "Only Managing Directors can delete projects.",
          });
        }
        await db.collection(COLLECTION).doc(entityId).delete();
        return res.status(200).json({ ok: true });
      }

      default:
        res.setHeader("Allow", "GET, POST, PUT, DELETE");
        return res
          .status(405)
          .json({ ok: false, error: "Method not allowed." });
    }
  },
  { maxRequests: 30 },
);
