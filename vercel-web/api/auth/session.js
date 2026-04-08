const { withSecurity } = require("../../lib/security");
const { db } = require("../../lib/firebase");

function normalizeRole(role) {
  return String(role || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

async function resolveDepartmentFromEmployeeProfile(user) {
  const uid = String((user && user.uid) || "").trim();
  const email = String((user && user.email) || "")
    .trim()
    .toLowerCase();

  if (uid) {
    const byId = await db.collection("employees").doc(uid).get();
    if (byId.exists) {
      const data = byId.data() || {};
      if (data.department) return data.department;
    }
  }

  if (email) {
    const byEmail = await db
      .collection("employees")
      .where("email", "==", email)
      .limit(1)
      .get();
    if (!byEmail.empty) {
      const data = byEmail.docs[0].data() || {};
      if (data.department) return data.department;
    }
  }

  return "";
}

async function buildResolvedUser(sessionUser) {
  const base = {
    uid: String((sessionUser && sessionUser.uid) || "").trim(),
    email: String((sessionUser && sessionUser.email) || "")
      .trim()
      .toLowerCase(),
    displayName: String((sessionUser && sessionUser.displayName) || "").trim(),
    role: normalizeRole(sessionUser && sessionUser.role),
    department: String((sessionUser && sessionUser.department) || "").trim(),
    mdApproved: !!(sessionUser && sessionUser.mdApproved),
    pmApproved: !!(sessionUser && sessionUser.pmApproved),
  };

  if (base.uid) {
    const userDoc = await db.collection("users").doc(base.uid).get();
    if (userDoc.exists) {
      const data = userDoc.data() || {};
      if (data.email) base.email = String(data.email).trim().toLowerCase();
      if (data.displayName) base.displayName = String(data.displayName).trim();
      if (data.role) base.role = normalizeRole(data.role);
      if (data.department) base.department = String(data.department).trim();
      if (Object.prototype.hasOwnProperty.call(data, "mdApproved")) {
        base.mdApproved = !!data.mdApproved;
      }
      if (Object.prototype.hasOwnProperty.call(data, "pmApproved")) {
        base.pmApproved = !!data.pmApproved;
      }
    }
  }

  if (!base.department) {
    base.department = await resolveDepartmentFromEmployeeProfile(base);
  }

  return base;
}

module.exports = withSecurity(
  async function handler(req, res) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ ok: false, error: "Method not allowed." });
    }

    // requireSession returns null and sends 401 on failure, but for
    // session check we handle unauthenticated gracefully.
    const { parseCookie, findSession } = require("../../lib/session");
    const sessionId = parseCookie(req.headers.cookie);
    const session = await findSession(sessionId);

    if (!session) {
      return res.status(200).json({ ok: true, data: { authenticated: false } });
    }

    const user = await buildResolvedUser(session.user || {});
    const normalRole = normalizeRole(user.role);
    const isMD = normalRole === "MANAGING_DIRECTOR";
    const isPM = normalRole === "PROJECT_MANAGER";
    const redirect = isMD ? "/app" : isPM ? "/pm-workspace" : "/workspace";
    return res.status(200).json({
      ok: true,
      data: {
        authenticated: true,
        user: {
          uid: user.uid || "",
          email: user.email || "",
          displayName: user.displayName || "",
          role: user.role || "",
          department: user.department || "",
          mdApproved: !!user.mdApproved,
          pmApproved: !!user.pmApproved,
        },
        redirect,
      },
    });
  },
  { maxRequests: 30 },
);
