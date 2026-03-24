const restAuth = require("../../lib/firebase-rest-auth");
const { withSecurity } = require("../../lib/security");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

module.exports = withSecurity(async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ ok: false, error: "Method not allowed." });
    }

    const { email } = req.body || {};
    const safeEmail = String(email || "").trim().toLowerCase();
    if (!safeEmail) {
        return res.status(400).json({ ok: false, error: "Email is required." });
    }
    if (safeEmail.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(safeEmail)) {
        return res.status(400).json({ ok: false, error: "A valid email is required." });
    }

    try {
        await restAuth.sendPasswordResetEmail(safeEmail);
    } catch (_) {
        // Always return success to avoid email enumeration
    }

    return res.status(200).json({
        ok: true,
        data: { message: "If an account exists, a reset link was sent." },
    });
}, { maxRequests: 5 });
