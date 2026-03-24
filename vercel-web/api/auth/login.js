const { db } = require("../../lib/firebase");
const restAuth = require("../../lib/firebase-rest-auth");
const {
    createSession,
    setSessionCookie,
} = require("../../lib/session");
const { withSecurity } = require("../../lib/security");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

module.exports = withSecurity(async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ ok: false, error: "Method not allowed." });
    }

    const { email, password } = req.body || {};
    const safeEmail = String(email || "").trim().toLowerCase();
    const safePassword = typeof password === "string" ? password : "";
    if (!safeEmail || !safePassword) {
        return res.status(400).json({ ok: false, error: "Email and password are required." });
    }
    if (safeEmail.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(safeEmail)) {
        return res.status(400).json({ ok: false, error: "A valid email is required." });
    }
    if (safePassword.length < MIN_PASSWORD_LENGTH || safePassword.length > MAX_PASSWORD_LENGTH) {
        return res.status(400).json({ ok: false, error: "Password must be between 8 and 128 characters." });
    }

    try {
        const authResp = await restAuth.signIn(safeEmail, safePassword);

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
                displayName: authResp.displayName || safeEmail.split("@")[0],
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

        // Employees require a second approval by their department PM.
        if (user.role === "EMPLOYEE" && user.pmApproved !== true) {
            return res.status(403).json({
                ok: false,
                error: "Your account is pending Project Manager approval for your department.",
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
        department: u.department || "",
        mdApproved: !!u.mdApproved,
        pmApproved: !!u.pmApproved,
    };
}
