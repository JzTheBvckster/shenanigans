const { db } = require("../../lib/firebase");
const restAuth = require("../../lib/firebase-rest-auth");
const {
  createSession,
  setSessionCookie,
} = require("../../lib/session");
const { withSecurity } = require("../../lib/security");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEPARTMENTS = new Set([
  "Engineering",
  "Marketing",
  "Finance",
  "Human Resources",
  "Operations",
  "Sales",
]);
const ALLOWED_SIGNUP_ROLES = new Set(["EMPLOYEE", "PROJECT_MANAGER"]);
const MAX_NAME_LENGTH = 100;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

module.exports = withSecurity(async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const { displayName, email, password, role, department } = req.body || {};
  const safeDisplayName = String(displayName || "").trim();
  const safeEmail = String(email || "").trim().toLowerCase();
  const safePassword = typeof password === "string" ? password : "";

  if (!safeDisplayName || !safeEmail || !safePassword) {
    return res.status(400).json({
      ok: false,
      error: "Display name, email, and password are required.",
    });
  }

  if (safeDisplayName.length < 2 || safeDisplayName.length > MAX_NAME_LENGTH) {
    return res.status(400).json({
      ok: false,
      error: "Display name must be between 2 and 100 characters.",
    });
  }

  if (!EMAIL_RE.test(safeEmail)) {
    return res.status(400).json({ ok: false, error: "A valid email is required." });
  }

  if (safePassword.length < MIN_PASSWORD_LENGTH || safePassword.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({
      ok: false,
      error: "Password must be between 8 and 128 characters.",
    });
  }

  const normalizedRole = normalizeRole(role);
  const normalizedDepartment = normalizeDepartment(department);
  if (!ALLOWED_SIGNUP_ROLES.has(normalizedRole)) {
    return res.status(403).json({
      ok: false,
      error: "Public registration is only available for Employee and Project Manager accounts.",
    });
  }
  if (normalizedRole !== "MANAGING_DIRECTOR" && !normalizedDepartment) {
    return res.status(400).json({
      ok: false,
      error: "Department is required for Employee and Project Manager accounts.",
    });
  }
  if (normalizedDepartment && !DEPARTMENTS.has(normalizedDepartment)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid department selected.",
    });
  }

  try {
    const authResp = await restAuth.signUp(safeEmail, safePassword);

    const user = {
      uid: authResp.localId,
      email: authResp.email,
      displayName: safeDisplayName,
      role: normalizedRole,
      mdApproved: false,
      pmApproved: normalizedRole === "PROJECT_MANAGER",
      department: normalizedDepartment,
      createdAt: Date.now(),
    };
    await db.collection("users").doc(authResp.localId).set(user);













    const sessionId = await createSession(user, authResp.idToken, authResp.refreshToken);
    setSessionCookie(res, sessionId);

    const redirect = user.role === "EMPLOYEE" ? "/app?view=employee" : "/app";
    return res.status(201).json({
      ok: true,
      data: {
        pendingApproval: false,
        user: toUserPayload(user),
        redirect,
      },
    });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message || "Registration failed." });
  }
}, { maxRequests: 10 });

function normalizeRole(raw) {
  if (!raw) return "EMPLOYEE";
  const n = raw.trim().toUpperCase().replace(/ /g, "_");
  if (["PROJECT_MANAGER", "EMPLOYEE"].includes(n)) return n;
  return "EMPLOYEE";
}

function normalizeDepartment(raw) {
  return String(raw || "").trim();
}

function toUserPayload(u) {
  return {
    uid: u.uid || "",
    email: u.email || "",
    displayName: u.displayName || "",
    role: u.role || "",
    department: u.department || "",
    mdApproved: !!u.mdApproved,
    pmApproved: !!u.pmApproved,
  };
}
