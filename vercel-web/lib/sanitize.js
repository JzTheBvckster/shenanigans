/**
 * Input sanitization utilities for the web API.
 * Strips HTML tags, enforces length limits, and validates document IDs.
 */

const HTML_TAG_RE = /<[^>]*>/g;
const SAFE_DOC_ID_RE = /^[a-zA-Z0-9_\-]{1,128}$/;
const SKIP_FIELDS = new Set(["password"]);
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/**
 * Strip HTML tags, trim whitespace, and enforce max length on a string.
 * @param {string} str
 * @param {number} maxLength
 * @returns {string}
 */
function sanitizeString(str, maxLength = 1000) {
    if (typeof str !== "string") return str;
    return str.replace(HTML_TAG_RE, "").trim().substring(0, maxLength);
}

function sanitizeValue(value, maxLength) {
    if (typeof value === "string") {
        return sanitizeString(value, maxLength);
    }
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeValue(item, maxLength));
    }
    if (value && typeof value === "object") {
        return sanitizeBody(value, maxLength);
    }
    return value;
}

/**
 * Recursively sanitize all string values in a plain object.
 * Skips sensitive fields (e.g. "password") that users need to set freely.
 * @param {object} obj
 * @param {number} maxLength
 * @returns {object}
 */
function sanitizeBody(obj, maxLength = 1000) {
    if (Array.isArray(obj)) {
        return obj.map((item) => sanitizeValue(item, maxLength));
    }
    if (!obj || typeof obj !== "object") return obj;
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (UNSAFE_KEYS.has(key)) {
            continue;
        }
        if (SKIP_FIELDS.has(key)) {
            result[key] = value;
        } else {
            result[key] = sanitizeValue(value, maxLength);
        }
    }
    return result;
}

/**
 * Validate a Firestore document ID (alphanumeric, hyphens, underscores only).
 * @param {string} id
 * @returns {boolean}
 */
function isValidDocId(id) {
    if (!id || typeof id !== "string") return false;
    return SAFE_DOC_ID_RE.test(id);
}

module.exports = { sanitizeString, sanitizeBody, isValidDocId };
