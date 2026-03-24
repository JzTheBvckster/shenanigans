const { db } = require("./firebase");

function normalizeRole(role) {
  return String(role || "").toUpperCase().replace(/\s+/g, "_");
}

function normalizeDepartment(department) {
  return String(department || "").trim().toLowerCase();
}

function isManagingDirector(actor) {
  return normalizeRole(actor && actor.role) === "MANAGING_DIRECTOR";
}

function isProjectManager(actor) {
  return normalizeRole(actor && actor.role) === "PROJECT_MANAGER";
}

function isEmployee(actor) {
  return normalizeRole(actor && actor.role) === "EMPLOYEE";
}

function canAccessDepartment(actor, department) {
  if (isManagingDirector(actor)) return true;
  const actorDept = normalizeDepartment(actor && actor.department);
  const resourceDept = normalizeDepartment(department);
  return !!actorDept && !!resourceDept && actorDept === resourceDept;
}

async function resolveDepartmentByEmployeeProfile(user) {
  if (!user) return "";

  if (user.uid) {
    const byId = await db.collection("employees").doc(String(user.uid)).get();
    if (byId.exists) {
      const data = byId.data() || {};
      if (data.department) return data.department;
    }
  }

  if (user.email) {
    const byEmail = await db
      .collection("employees")
      .where("email", "==", String(user.email).toLowerCase())
      .limit(1)
      .get();
    if (!byEmail.empty) {
      const data = byEmail.docs[0].data() || {};
      if (data.department) return data.department;
    }
  }

  return "";
}

async function getActorContext(session) {
  const user = (session && session.user) || {};
  const actor = {
    uid: user.uid || "",
    email: String(user.email || "").toLowerCase(),
    displayName: user.displayName || "",
    role: normalizeRole(user.role),
    mdApproved: !!user.mdApproved,
    department: user.department || "",
  };

  if (!actor.department && actor.uid) {
    const userDoc = await db.collection("users").doc(actor.uid).get();
    if (userDoc.exists) {
      const data = userDoc.data() || {};
      actor.department = data.department || actor.department;
      actor.role = normalizeRole(data.role || actor.role);
      actor.mdApproved = data.mdApproved !== false;
    }
  }

  if (!actor.department) {
    actor.department = await resolveDepartmentByEmployeeProfile(actor);
  }

  return actor;
}

async function getAccessibleProjectIds(actor) {
  if (isManagingDirector(actor)) return null;
  const dept = normalizeDepartment(actor.department);
  if (!dept) return new Set();
  const snap = await db.collection("projects").where("department", "==", actor.department).get();
  const ids = new Set();
  snap.docs.forEach((d) => ids.add(d.id));
  return ids;
}

async function canAccessProject(actor, projectId) {
  if (isManagingDirector(actor)) return true;
  if (!projectId) return false;
  const doc = await db.collection("projects").doc(String(projectId)).get();
  if (!doc.exists) return false;
  const data = doc.data() || {};
  return canAccessDepartment(actor, data.department);
}

module.exports = {
  normalizeRole,
  normalizeDepartment,
  isManagingDirector,
  isProjectManager,
  isEmployee,
  canAccessDepartment,
  getActorContext,
  getAccessibleProjectIds,
  canAccessProject,
};
