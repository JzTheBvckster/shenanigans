const { requireSession } = require("../../lib/session");
const { withSecurity } = require("../../lib/security");

module.exports = withSecurity(async function handler(req, res) {
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
    const normalRole = user.role ? user.role.toUpperCase().replace(/\s+/g, '_') : '';
    const isMD = normalRole === 'MANAGING_DIRECTOR';
    const isPM = normalRole === 'PROJECT_MANAGER';
    const redirect = isMD ? '/app' : isPM ? '/pm-workspace' : '/workspace';
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
}, { maxRequests: 30 });
