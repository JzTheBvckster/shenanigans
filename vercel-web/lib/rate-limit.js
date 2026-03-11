/**
 * In-memory sliding-window rate limiter for Vercel serverless functions.
 *
 * Since Vercel functions are stateless, this works per warm instance.
 * It provides meaningful protection against abuse within an instance's
 * lifetime. For distributed rate limiting, use Upstash Redis.
 */

const windowStore = new Map();
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
let lastCleanup = Date.now();

function cleanup(windowMs) {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;
    for (const [key, timestamps] of windowStore) {
        const valid = timestamps.filter((t) => t > now - windowMs);
        if (valid.length === 0) {
            windowStore.delete(key);
        } else {
            windowStore.set(key, valid);
        }
    }
}

/**
 * Check if a request is within rate limits.
 * @param {string} key - Unique identifier (e.g. IP:route)
 * @param {number} maxRequests - Max requests per window
 * @param {number} windowMs - Window size in milliseconds
 * @returns {{ allowed: boolean, remaining: number, retryAfter: number }}
 */
function checkLimit(key, maxRequests, windowMs) {
    cleanup(windowMs);
    const now = Date.now();
    const cutoff = now - windowMs;
    let timestamps = windowStore.get(key) || [];
    timestamps = timestamps.filter((t) => t > cutoff);

    if (timestamps.length >= maxRequests) {
        const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000);
        windowStore.set(key, timestamps);
        return { allowed: false, remaining: 0, retryAfter };
    }

    timestamps.push(now);
    windowStore.set(key, timestamps);
    return { allowed: true, remaining: maxRequests - timestamps.length, retryAfter: 0 };
}

/**
 * Derive a rate-limit key from the request (IP + route group).
 * @param {object} req
 * @returns {string}
 */
function getClientKey(req) {
    const forwarded = req.headers["x-forwarded-for"];
    const ip = forwarded
        ? forwarded.split(",")[0].trim()
        : req.headers["x-real-ip"] || "unknown";
    const pathParts = (req.url || "").split("?")[0].split("/").filter(Boolean);
    const routeGroup = pathParts.slice(0, 2).join("/");
    return `${ip}:${routeGroup}`;
}

module.exports = { checkLimit, getClientKey };
