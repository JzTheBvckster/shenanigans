const APPROVAL_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED"]);

function toNonNegativeNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function toPercent(value, fallback = 0) {
  const n = toNonNegativeNumber(value, fallback);
  if (!Number.isFinite(n)) return fallback;
  if (n > 100) return 100;
  return n;
}

function toPositiveTimestamp(value) {
  const ts = Number(value);
  return Number.isFinite(ts) && ts > 0 ? ts : 0;
}

function normalizeApprovalStatus(project) {
  const raw = String((project && project.approvalStatus) || "")
    .trim()
    .toUpperCase();
  if (APPROVAL_STATUSES.has(raw)) return raw;

  if (project && project.isApproved === true) return "APPROVED";
  if (
    project &&
    (project.rejectedAt ||
      String(project.approvalDecision || "")
        .trim()
        .toUpperCase() === "NO")
  ) {
    return "REJECTED";
  }

  const createdByRole = String((project && project.createdByRole) || "")
    .trim()
    .toUpperCase();
  const currentStatus = String((project && project.status) || "")
    .trim()
    .toUpperCase();
  if (createdByRole === "PROJECT_MANAGER") {
    return currentStatus === "PENDING_APPROVAL" ? "PENDING" : "APPROVED";
  }
  return "APPROVED";
}

function scheduleProgressPercentage(startDate, endDate, now = Date.now()) {
  const start = toPositiveTimestamp(startDate);
  const end = toPositiveTimestamp(endDate);
  if (!start || !end || end <= start) return null;
  const ratio = (now - start) / (end - start);
  if (!Number.isFinite(ratio)) return null;
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return pct;
}

function deriveAutomaticProjectStatus(project, now = Date.now()) {
  const currentStatus = String((project && project.status) || "")
    .trim()
    .toUpperCase();
  if (currentStatus === "ARCHIVED") return "ARCHIVED";

  const approvalStatus = normalizeApprovalStatus(project);
  if (approvalStatus !== "APPROVED") return "PENDING_APPROVAL";

  const completion = toPercent(project && project.completionPercentage, 0);
  const startDate = toPositiveTimestamp(project && project.startDate);
  const endDate = toPositiveTimestamp(project && project.endDate);
  const spent = toNonNegativeNumber(project && project.spent, 0);

  if (completion >= 100) return "COMPLETED";

  const startedBySignal = completion > 0 || spent > 0;
  if (startDate && now < startDate && !startedBySignal) return "PLANNING";

  if (endDate && now > endDate && completion < 100) return "ON_HOLD";

  const schedulePct = scheduleProgressPercentage(startDate, endDate, now);
  if (
    schedulePct !== null &&
    schedulePct >= 75 &&
    completion + 20 < schedulePct
  ) {
    return "ON_HOLD";
  }

  if (startedBySignal || (startDate && now >= startDate)) return "IN_PROGRESS";

  return "PLANNING";
}

function deriveProjectLifecycle(project, now = Date.now()) {
  const approvalStatus = normalizeApprovalStatus(project);
  const status = deriveAutomaticProjectStatus(project, now);
  const completion = toPercent(project && project.completionPercentage, 0);
  const startDate = toPositiveTimestamp(project && project.startDate);
  const endDate = toPositiveTimestamp(project && project.endDate);
  const scheduleProgress = scheduleProgressPercentage(startDate, endDate, now);
  const overdue =
    status !== "ARCHIVED" &&
    status !== "COMPLETED" &&
    !!endDate &&
    now > endDate &&
    completion < 100;

  return {
    approvalStatus,
    status,
    scheduleProgressPercentage: scheduleProgress,
    overdue,
  };
}

module.exports = {
  deriveProjectLifecycle,
  deriveAutomaticProjectStatus,
  normalizeApprovalStatus,
};
