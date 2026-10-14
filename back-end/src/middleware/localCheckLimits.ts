import { Request } from 'express';

/** Explicit opt-in for direct loopback development requests only. Never trust headers. */
export function bypassLocalCheckLimits(req: Request): boolean {
  const loopback = (value?: string) => value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1';
  return process.env.NODE_ENV === 'development'
    && process.env.LOCAL_DISABLE_CHECK_LIMITS === 'true'
    && loopback(req.socket?.remoteAddress)
    && loopback(req.ip);
}
