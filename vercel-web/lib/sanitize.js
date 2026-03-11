/**
 * Input sanitization utilities for the web API.
 * Strips HTML tags, enforces length limits, and validates document IDs.
 */

const HTML_TAG_RE = /<[^>]*>/g;
const SAFE_DOC_ID_RE = /^[a-zA-Z0-9_\-]{1,128}$/;
const SKIP_FIELDS = new Set(["password"]);

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

/**
 * Recursively sanitize all string values in a plain object.
 * Skips sensitive fields (e.g. "password") that users need to set freely.
 * @param {object} obj
 * @param {number} maxLength
 * @returns {object}
 */
function sanitizeBody(obj, maxLength = 1000) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (SKIP_FIELDS.has(key)) {
            result[key] = value;
        } else if (typeof value === "string") {
            result[key] = sanitizeString(value, maxLength);
        } else if (Array.isArray(value)) {
            result[key] = value.map((item) =>
                typeof item === "string"
                    ? sanitizeString(item, maxLength)
                    : typeof item === "object"
                        ? sanitizeBody(item, maxLength)
                        : item
            );
        } else if (typeof value === "object" && value !== null) {
            result[key] = sanitizeBody(value, maxLength);
        } else {
            result[key] = value;
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
