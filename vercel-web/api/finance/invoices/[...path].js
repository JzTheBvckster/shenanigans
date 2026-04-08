const { db } = require("../../../lib/firebase");
const { requireSession } = require("../../../lib/session");
const { withSecurity } = require("../../../lib/security");
const { getActorContext, isManagingDirector } = require("../../../lib/access");
const { isValidDocId } = require("../../../lib/sanitize");

const COLLECTION = "invoices";

module.exports = withSecurity(async function handler(req, res) {
  const session = await requireSession(req, res);
  if (!session) return;

  const actor = await getActorContext(session);
  if (!isManagingDirector(actor)) {
    return res.status(403).json({
      ok: false,
      error: "Finance data is restricted to Managing Directors.",
    });
  }

  const method = req.method;
  const segments = (req.url || "").split("/").filter(Boolean);
  // segments: ["api", "finance", "invoices", "<id>?"]
  const entityId = segments.length >= 4 ? decodeURIComponent(segments[3].split("?")[0]) : null;
  if (entityId && !isValidDocId(entityId)) {
    return res.status(400).json({ ok: false, error: "Invalid invoice ID." });
  }

  switch (method) {
    case "GET": {
      const snapshot = await db.collection(COLLECTION).get();
      const invoices = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      return res.status(200).json({ ok: true, data: invoices });
    }

    case "POST": {
      const body = req.body || {};
      if (!body.client) {
        return res.status(400).json({ ok: false, error: "Client name is required." });
      }
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ ok: false, error: "Amount must be a positive number." });
      }
      if (body.projectId) {
        const projectId = String(body.projectId);
        if (!isValidDocId(projectId)) {
          return res.status(400).json({ ok: false, error: "Invalid projectId." });
        }
        const projectDoc = await db.collection("projects").doc(projectId).get();
        if (!projectDoc.exists) {
          return res.status(404).json({ ok: false, error: "Referenced project not found." });
        }
        const project = projectDoc.data() || {};
        body.department = body.department || project.department || "";
      }
      if (!body.issuedAt || body.issuedAt <= 0) body.issuedAt = Date.now();
      body.amount = amount;
      body.paid = !!body.paid;
      const docRef = await db.collection(COLLECTION).add(body);
      return res.status(201).json({ ok: true, data: { id: docRef.id } });
    }

    case "PUT": {
      if (!entityId) {
        return res.status(400).json({ ok: false, error: "Invoice ID is required in path." });
      }
      const existingDoc = await db.collection(COLLECTION).doc(entityId).get();
      if (!existingDoc.exists) {
        return res.status(404).json({ ok: false, error: "Invoice not found." });
      }
      const body = req.body || {};
      if (Object.prototype.hasOwnProperty.call(body, "amount")) {
        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          return res.status(400).json({ ok: false, error: "Amount must be a positive number." });
        }
        body.amount = amount;
      }
      if (Object.prototype.hasOwnProperty.call(body, "projectId") && body.projectId) {
        const projectId = String(body.projectId);
        if (!isValidDocId(projectId)) {
          return res.status(400).json({ ok: false, error: "Invalid projectId." });
        }
        const projectDoc = await db.collection("projects").doc(projectId).get();
        if (!projectDoc.exists) {
          return res.status(404).json({ ok: false, error: "Referenced project not found." });
        }
        const project = projectDoc.data() || {};
        body.department = body.department || project.department || "";
      }
      if (Object.prototype.hasOwnProperty.call(body, "paid")) {
        body.paid = !!body.paid;
        const now = Date.now();
        body.createdAt = now;
        body.updatedAt = now;
      }
        delete body.id;
        body.updatedAt = Date.now();
      await db.collection(COLLECTION).doc(entityId).update(body);
      return res.status(200).json({ ok: true, data: { id: entityId } });
    }

    case "DELETE": {
      if (!entityId) {
        return res.status(400).json({ ok: false, error: "Invoice ID is required in path." });
      }
      const doc = await db.collection(COLLECTION).doc(entityId).get();
      if (!doc.exists) {
        return res.status(404).json({ ok: false, error: "Invoice not found." });
      }
      await db.collection(COLLECTION).doc(entityId).delete();
      return res.status(200).json({ ok: true });
    }

    default:
      res.setHeader("Allow", "GET, POST, PUT, DELETE");
      return res.status(405).json({ ok: false, error: "Method not allowed." });
  }
}, { maxRequests: 30 });
