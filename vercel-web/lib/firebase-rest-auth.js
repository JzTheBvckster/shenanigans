/**
 * Firebase REST Auth client — mirrors the Java FirebaseAuthClient.
 * Uses the Firebase Auth REST API (identitytoolkit) for sign-in and sign-up
 * because the Admin SDK does not support password-based sign-in directly.
 */
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
const BASE_URL = "https://identitytoolkit.googleapis.com/v1/accounts";

async function signIn(email, password) {
    const res = await fetch(`${BASE_URL}:signInWithPassword?key=${FIREBASE_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const body = await res.json();
    if (body.error) throw new Error(body.error.message || "Authentication failed.");
    return {
        localId: body.localId,
        email: body.email,
        displayName: body.displayName || "",
        idToken: body.idToken,
        refreshToken: body.refreshToken,
    };
}

async function signUp(email, password) {
    const res = await fetch(`${BASE_URL}:signUp?key=${FIREBASE_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const body = await res.json();
    if (body.error) throw new Error(body.error.message || "Registration failed.");
    return {
        localId: body.localId,
        email: body.email,
        displayName: body.displayName || "",
        idToken: body.idToken,
        refreshToken: body.refreshToken,
    };
}

async function sendPasswordResetEmail(email) {
    const res = await fetch(`${BASE_URL}:sendOobCode?key=${FIREBASE_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
    });
    const body = await res.json();
    if (body.error) throw new Error(body.error.message || "Failed to send reset email.");
    return body;
}

module.exports = { signIn, signUp, sendPasswordResetEmail };
