const {
    parseCookie,
    invalidateSession,
    clearSessionCookie,
    COOKIE_NAME,
} = require("../../lib/session");

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ ok: false, error: "Method not allowed." });
    }

    const sessionId = parseCookie(req.headers.cookie);
    if (sessionId) {
        await invalidateSession(sessionId);
    }

    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
};
