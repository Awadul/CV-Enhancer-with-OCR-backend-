"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiter = rateLimiter;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const store = new Map();
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
        // x-forwarded-for can be a comma-separated list; take the first hop.
        return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded)) {
        return forwarded[0];
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
}
function rateLimiter(options = {}) {
    const limit = options.limit ?? 1;
    const windowMs = options.windowMs ?? WINDOW_MS;
    return (req, res, next) => {
        // Authenticated users are NOT rate-limited here — their limit is
        // enforced per-plan in the controller.
        if (req.userId) {
            return next();
        }
        const ip = getClientIp(req);
        const now = Date.now();
        const record = store.get(ip);
        if (!record || now - record.firstSeen > windowMs) {
            // Start a fresh window.
            store.set(ip, { count: 1, firstSeen: now });
            return next();
        }
        if (record.count >= limit) {
            const retryAfterSec = Math.ceil((record.firstSeen + windowMs - now) / 1000);
            res.set('Retry-After', String(retryAfterSec));
            return res.status(429).json({
                message: 'You have used your free ATS check for this month. Sign in to get more scans, or come back next month.',
                retryAfter: retryAfterSec,
            });
        }
        record.count += 1;
        store.set(ip, record);
        return next();
    };
}
