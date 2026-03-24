const { db } = require("../../lib/firebase");
const restAuth = require("../../lib/firebase-rest-auth");
const {
    createSession,
    setSessionCookie,
} = require("../../lib/session");
const { withSecurity } = require("../../lib/security");

module.exports = withSecurity(async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ ok: false, error: "Method not allowed." });
    }

    const { email, password } = req.body || {};
    if (!email || !password) {
        return res.status(400).json({ ok: false, error: "Email and password are required." });
    }

    try {
        const authResp = await restAuth.signIn(email.trim(), password);

        // Fetch user profile from Firestore
        const userDoc = await db.collection("users").doc(authResp.localId).get();
        let user;
        if (userDoc.exists) {
            user = userDoc.data();
            user.uid = authResp.localId;
        } else {
            user = {
                uid: authResp.localId,
                email: authResp.email,
                displayName: authResp.displayName || email.split("@")[0],
                role: "PROJECT_MANAGER",
                mdApproved: false,
            };
            await db.collection("users").doc(authResp.localId).set(user);
        }

        // Enforce MD approval for non-MD roles
        if (user.role !== "MANAGING_DIRECTOR" && user.mdApproved === false) {
            return res.status(403).json({
                ok: false,
                error: "Your account is pending Managing Director approval.",
            });
        }

        const sessionId = await createSession(user, authResp.idToken, authResp.refreshToken);
        setSessionCookie(res, sessionId);

        const normalRole = user.role ? user.role.toUpperCase().replace(/\s+/g, '_') : '';
        const isMD = normalRole === 'MANAGING_DIRECTOR';
        const isPM = normalRole === 'PROJECT_MANAGER';
        const redirect = isMD ? '/app' : isPM ? '/pm-workspace' : '/workspace';
        return res.status(200).json({
            ok: true,
            data: {
                user: toUserPayload(user),
                redirect,
            },
        });
    } catch (err) {
        const status = err.message && err.message.toLowerCase().includes("pending") ? 403 : 401;
        return res.status(status).json({ ok: false, error: err.message || "Authentication failed." });
    }
}, { maxRequests: 10 });

function toUserPayload(u) {
    return {
        uid: u.uid || "",
        email: u.email || "",
        displayName: u.displayName || "",
        role: u.role || "",
        mdApproved: !!u.mdApproved,
    };
}
