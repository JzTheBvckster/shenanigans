const crypto = require("crypto");

/**
 * In-memory session store (Vercel serverless functions are stateless, so we use
 * Firestore-backed sessions). Each session doc lives in "web_sessions" collection.
 */
const { db } = require("./firebase");

const SESSION_COLLECTION = "web_sessions";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const COOKIE_NAME = "SHENANIGANS_SESSION";

async function createSession(user, idToken, refreshToken) {
    const sessionId = crypto.randomUUID();
    const now = Date.now();
    await db.collection(SESSION_COLLECTION).doc(sessionId).set({
        user,
        idToken: idToken || "",
        refreshToken: refreshToken || "",
        createdAt: now,
        expiresAt: now + SESSION_TTL_MS,
    });
    return sessionId;
}

async function findSession(sessionId) {
    if (!sessionId) return null;
    const doc = await db.collection(SESSION_COLLECTION).doc(sessionId).get();
    if (!doc.exists) return null;
    const data = doc.data();
    if (data.expiresAt <= Date.now()) {
        await db.collection(SESSION_COLLECTION).doc(sessionId).delete();
        return null;
    }
    return data;
}

async function invalidateSession(sessionId) {
    if (!sessionId) return;
    await db.collection(SESSION_COLLECTION).doc(sessionId).delete();
}

function parseCookie(cookieHeader) {
    if (!cookieHeader) return null;
    const pairs = cookieHeader.split(";");
    for (const pair of pairs) {
        const [key, val] = pair.trim().split("=", 2);
        if (key === COOKIE_NAME) return val;
    }
    return null;
}

function setSessionCookie(res, sessionId) {
    const maxAge = Math.floor(SESSION_TTL_MS / 1000);
    const isSecure = String(res.req.headers["x-forwarded-proto"] || "").includes("https");
    res.setHeader(
        "Set-Cookie",
        `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isSecure ? "; Secure" : ""}`
    );
}

function clearSessionCookie(res) {
    const isSecure = String((res.req && res.req.headers["x-forwarded-proto"]) || "").includes("https");
    res.setHeader(
        "Set-Cookie",
        `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isSecure ? "; Secure" : ""}`
    );
}

async function requireSession(req, res) {
    const sessionId = parseCookie(req.headers.cookie);
    const session = await findSession(sessionId);
    if (!session) {
        clearSessionCookie(res);
        res.status(401).json({ ok: false, error: "Authentication required." });
        return null;
    }
    return session;
}

module.exports = {
    createSession,
    findSession,
    invalidateSession,
    parseCookie,
    setSessionCookie,
    clearSessionCookie,
    requireSession,
    COOKIE_NAME,
};
