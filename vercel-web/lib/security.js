/**
 * Security middleware that wraps API handlers with rate limiting and
 * input sanitization.
 *
 * Usage:
 *   const { withSecurity } = require("../../lib/security");
 *   module.exports = withSecurity(handler, { maxRequests: 30 });
 */

const { sanitizeBody, sanitizeString } = require("./sanitize");
const { checkLimit, getClientKey } = require("./rate-limit");

const DEFAULT_OPTIONS = {
    maxRequests: 30,
    windowMs: 60 * 1000, // 1 minute
};

/**
 * Wrap an API handler with rate limiting and input sanitization.
 * @param {Function} handler - The original request handler
 * @param {object} [options] - { maxRequests, windowMs }
 * @returns {Function} Secured handler
 */
function withSecurity(handler, options = {}) {
    const { maxRequests, windowMs } = { ...DEFAULT_OPTIONS, ...options };

    return async function securedHandler(req, res) {
        // --- Rate limiting ---
        const key = getClientKey(req);
        const result = checkLimit(key, maxRequests, windowMs);

        res.setHeader("X-RateLimit-Limit", String(maxRequests));
        res.setHeader("X-RateLimit-Remaining", String(result.remaining));

        if (!result.allowed) {
            res.setHeader("Retry-After", String(result.retryAfter));
            return res.status(429).json({
                ok: false,
                error: "Too many requests. Please try again later.",
            });
        }

        // --- Input sanitization ---
        if (req.body && typeof req.body === "object") {
            req.body = sanitizeBody(req.body);
        }
        if (req.query && typeof req.query === "object") {
            for (const k of Object.keys(req.query)) {
                if (typeof req.query[k] === "string") {
                    req.query[k] = sanitizeString(req.query[k], 200);
                }
            }
        }

        return handler(req, res);
    };
}

module.exports = { withSecurity };
