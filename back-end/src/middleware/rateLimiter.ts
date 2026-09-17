import { Request, Response, NextFunction } from 'express';

/**
 * In-memory IP-based rate limiter.
 *
 * Stores a rolling 30-day window per client IP. This is intentionally
 * ephemeral (lost on server restart) — it is a lightweight abuse deterrent
 * for anonymous users, not a billing-grade counter.
 *
 * Limits:
 *  - Anonymous users: 1 ATS scan per 30 days per IP (see DEFAULT_LIMIT below).
 */

interface RateRecord {
  count: number;
  firstSeen: number; // timestamp of the first request in the current window
}

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const store = new Map<string, RateRecord>();

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    // x-forwarded-for can be a comma-separated list; take the first hop.
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0];
  }
  return req.ip || (req.socket.remoteAddress as string) || 'unknown';
}

export interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
}

export function rateLimiter(options: RateLimitOptions = {}) {
  const limit = options.limit ?? 1;
  const windowMs = options.windowMs ?? WINDOW_MS;

  return (req: Request, res: Response, next: NextFunction) => {
    // Authenticated users are NOT rate-limited here — their limit is
    // enforced per-plan in the controller.
    if ((req as any).userId) {
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
