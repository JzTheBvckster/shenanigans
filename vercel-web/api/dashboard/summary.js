const { db } = require("../../lib/firebase");
const { requireSession } = require("../../lib/session");
const { withSecurity } = require("../../lib/security");

module.exports = withSecurity(async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const [projectsSnap, employeesSnap, invoicesSnap] = await Promise.all([
    db.collection("projects").get(),
    db.collection("employees").get(),
    db.collection("invoices").get(),
  ]);

  const projects = projectsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const employees = employeesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const invoices = invoicesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const activeProjects = projects.filter(
    (p) => p.status === "IN_PROGRESS" || p.status === "PLANNING"
  ).length;
  const overdueProjects = projects.filter((p) => p.overdue === true).length;
  const openInvoices = invoices.filter((inv) => !inv.paid).length;
  const paidRevenue = invoices
    .filter((inv) => inv.paid)
    .reduce((sum, inv) => sum + (inv.amount || 0), 0);

  return res.status(200).json({
    ok: true,
    data: {
      activeProjects,
      totalProjects: projects.length,
      totalEmployees: employees.length,
      openInvoices,
      overdueProjects,
      paidRevenue,
    },
  });
}, { maxRequests: 30 });
