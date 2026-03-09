const { db } = require("../../../lib/firebase");
const { requireSession } = require("../../../lib/session");

const COLLECTION = "invoices";

module.exports = async function handler(req, res) {
  const session = await requireSession(req, res);
  if (!session) return;

  if (session.user.role !== "MANAGING_DIRECTOR") {
    return res.status(403).json({
      ok: false,
      error: "Finance data is restricted to Managing Directors.",
    });
  }

  const method = req.method;
  const segments = (req.url || "").split("/").filter(Boolean);
  // segments: ["api", "finance", "invoices", "<id>?"]
  const entityId = segments.length >= 4 ? decodeURIComponent(segments[3].split("?")[0]) : null;

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
      if (!body.issuedAt || body.issuedAt <= 0) body.issuedAt = Date.now();
      const docRef = await db.collection(COLLECTION).add(body);
      return res.status(201).json({ ok: true, data: { id: docRef.id } });
    }

    case "PUT": {
      if (!entityId) {
        return res.status(400).json({ ok: false, error: "Invoice ID is required in path." });
      }
      const body = req.body || {};
      delete body.id;
      await db.collection(COLLECTION).doc(entityId).update(body);
      return res.status(200).json({ ok: true, data: { id: entityId } });
    }

    case "DELETE": {
      if (!entityId) {
        return res.status(400).json({ ok: false, error: "Invoice ID is required in path." });
      }
      await db.collection(COLLECTION).doc(entityId).delete();
      return res.status(200).json({ ok: true });
    }

    default:
      res.setHeader("Allow", "GET, POST, PUT, DELETE");
      return res.status(405).json({ ok: false, error: "Method not allowed." });
  }
};
