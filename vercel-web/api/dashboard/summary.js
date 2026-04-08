const { db } = require("../../lib/firebase");
const { requireSession } = require("../../lib/session");
const { withSecurity } = require("../../lib/security");
const { getActorContext, canAccessDepartment, isManagingDirector } = require("../../lib/access");

module.exports = withSecurity(async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const session = await requireSession(req, res);
  if (!session) return;
  const actor = await getActorContext(session);

  const [projectsSnap, employeesSnap, invoicesSnap] = await Promise.all([
    db.collection("projects").get(),
    db.collection("employees").get(),
    db.collection("invoices").get(),
  ]);

  let projects = projectsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  let employees = employeesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  let invoices = invoicesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (!isManagingDirector(actor)) {
    projects = projects.filter((p) => canAccessDepartment(actor, p.department));
    employees = employees.filter((e) => canAccessDepartment(actor, e.department));
    const projectIds = new Set(projects.map((p) => p.id));
    invoices = invoices.filter((inv) => {
      if (inv.projectId && projectIds.has(inv.projectId)) return true;
      return canAccessDepartment(actor, inv.department);
    });
  }

  function toAmount(value) {
    if (typeof value === "string") {
      value = value.replace(/,/g, "").trim();
    }
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : 0;
  }

  const activeProjects = projects.filter(
    (p) => p.status === "IN_PROGRESS" || p.status === "PLANNING"
  ).length;
  const overdueProjects = projects.filter((p) => p.overdue === true).length;
  const openInvoices = invoices.filter((inv) => !inv.paid).length;
  const totalRevenue = invoices.reduce(
    (sum, inv) => sum + toAmount(inv.amount),
    0
  );
  const paidRevenue = invoices
    .filter((inv) => inv.paid)
    .reduce((sum, inv) => sum + toAmount(inv.amount), 0);

  return res.status(200).json({
    ok: true,
    data: {
      activeProjects,
      totalProjects: projects.length,
      totalEmployees: employees.length,
      openInvoices,
      overdueProjects,
      totalRevenue,
      paidRevenue,
    },
  });
}, { maxRequests: 30 });
