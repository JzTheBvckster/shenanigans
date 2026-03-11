const { db } = require("../../lib/firebase");
const restAuth = require("../../lib/firebase-rest-auth");
const {
  createSession,
  setSessionCookie,
} = require("../../lib/session");
const { withSecurity } = require("../../lib/security");

module.exports = withSecurity(async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const { displayName, email, password, role } = req.body || {};
  if (!displayName || !email || !password) {
    return res.status(400).json({
      ok: false,
      error: "Display name, email, and password are required.",
    });
  }

  const normalizedRole = normalizeRole(role);

  try {
    const authResp = await restAuth.signUp(email.trim(), password);

    const user = {
      uid: authResp.localId,
      email: authResp.email,
      displayName: displayName.trim(),
      role: normalizedRole,
      mdApproved: normalizedRole === "MANAGING_DIRECTOR",
    };
    await db.collection("users").doc(authResp.localId).set(user);

    const pendingApproval =
      (normalizedRole === "EMPLOYEE" || normalizedRole === "PROJECT_MANAGER") && !user.mdApproved;

    if (pendingApproval) {
      return res.status(201).json({
        ok: true,
        data: {
          pendingApproval: true,
          message: "Registration submitted and waiting for Managing Director approval.",
        },
      });
    }

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
  if (["MANAGING_DIRECTOR", "PROJECT_MANAGER", "EMPLOYEE"].includes(n)) return n;
  return "EMPLOYEE";
}

function toUserPayload(u) {
  return {
    uid: u.uid || "",
    email: u.email || "",
    displayName: u.displayName || "",
    role: u.role || "",
    mdApproved: !!u.mdApproved,
  };
}
