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

function getClientIp(req: Request): string {
  // Express resolves forwarding only through explicitly trusted proxies.
  // Reading the raw header here would allow callers to choose their quota key.
  return req.ip || (req.socket.remoteAddress as string) || 'unknown';
}

export interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
  message?: string;
}

export function rateLimiter(options: RateLimitOptions = {}) {
  const store = new Map<string, RateRecord>();
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
      // Keep anonymous-network bookkeeping bounded under distributed traffic.
      if (!record && store.size >= 10_000) {
        for (const [key, value] of store) if (now - value.firstSeen > windowMs) store.delete(key);
        if (store.size >= 10_000) {
          res.set('Retry-After', '60');
          return res.status(503).json({ message: 'Too many active requests. Please try again shortly.' });
        }
      }
      // Start a fresh window.
      store.set(ip, { count: 1, firstSeen: now });
      return next();
    }

    if (record.count >= limit) {
      const retryAfterSec = Math.ceil((record.firstSeen + windowMs - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        message: options.message || 'You have used your free ATS check for this month. Sign in to get more scans, or come back next month.',
        retryAfter: retryAfterSec,
      });
    }

    record.count += 1;
    store.set(ip, record);
    return next();
  };
}
