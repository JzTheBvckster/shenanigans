const { requireSession } = require("../../lib/session");

module.exports = async function handler(req, res) {
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

    const user = session.user;
    const isMD = user.role && user.role.toUpperCase().replace(/\s+/g, '_') === 'MANAGING_DIRECTOR';
    const redirect = isMD ? '/app' : '/workspace';
    return res.status(200).json({
        ok: true,
        data: {
            authenticated: true,
            user: {
                uid: user.uid || "",
                email: user.email || "",
                displayName: user.displayName || "",
                role: user.role || "",
                mdApproved: !!user.mdApproved,
            },
            redirect,
        },
    });
};
