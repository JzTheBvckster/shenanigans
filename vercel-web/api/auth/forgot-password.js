const restAuth = require("../../lib/firebase-rest-auth");

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ ok: false, error: "Method not allowed." });
    }

    const { email } = req.body || {};
    if (!email) {
        return res.status(400).json({ ok: false, error: "Email is required." });
    }

    try {
        await restAuth.sendPasswordResetEmail(email.trim());
    } catch (_) {
        // Always return success to avoid email enumeration
    }

    return res.status(200).json({
        ok: true,
        data: { message: "If an account exists, a reset link was sent." },
    });
};
