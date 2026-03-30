/**
 * Firebase REST Auth client — mirrors the Java FirebaseAuthClient.
 * Uses the Firebase Auth REST API (identitytoolkit) for sign-in and sign-up
 * because the Admin SDK does not support password-based sign-in directly.
 */
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const BASE_URL = "https://identitytoolkit.googleapis.com/v1/accounts";

function ensureApiKeyConfigured() {
    if (!FIREBASE_API_KEY) {
        throw new Error("FIREBASE_API_KEY is not configured.");
    }
}

async function readAuthResponse(res, fallbackMessage) {
    let body = null;
    try {
        body = await res.json();
    } catch (_err) {
        throw new Error(fallbackMessage);
    }
    if (!res.ok || body.error) {
        throw new Error((body && body.error && body.error.message) || fallbackMessage);
    }
    return body;
}

async function signIn(email, password) {
    ensureApiKeyConfigured();
    const res = await fetch(`${BASE_URL}:signInWithPassword?key=${FIREBASE_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const body = await readAuthResponse(res, "Authentication failed.");
    return {
        localId: body.localId,
        email: body.email,
        displayName: body.displayName || "",
        idToken: body.idToken,
        refreshToken: body.refreshToken,
    };
}

async function signUp(email, password) {
    ensureApiKeyConfigured();
    const res = await fetch(`${BASE_URL}:signUp?key=${FIREBASE_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const body = await readAuthResponse(res, "Registration failed.");
    return {
        localId: body.localId,
        email: body.email,
        displayName: body.displayName || "",
        idToken: body.idToken,
        refreshToken: body.refreshToken,
    };
}

async function sendPasswordResetEmail(email) {
    ensureApiKeyConfigured();
    const res = await fetch(`${BASE_URL}:sendOobCode?key=${FIREBASE_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
    });
    const body = await readAuthResponse(res, "Failed to send reset email.");
    return body;
}

module.exports = { signIn, signUp, sendPasswordResetEmail };
