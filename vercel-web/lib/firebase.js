const admin = require("firebase-admin");

function readServiceAccountFromEnv() {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
        throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured.");
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (_err) {
        throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
    }
    if (parsed && typeof parsed.private_key === "string") {
        parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
}

if (!admin.apps.length) {
    const serviceAccount = readServiceAccountFromEnv();
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
