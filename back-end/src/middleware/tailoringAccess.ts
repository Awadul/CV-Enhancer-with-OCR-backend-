import { bypassLocalCheckLimits } from './localCheckLimits';
import { Request, Response, NextFunction } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';
import { isIP } from 'net';

let client: SupabaseClient | undefined;
function getClient(): SupabaseClient {
  if (!client) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Access unavailable');
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

export function validateTailoringInput(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('A JSON object is required.');
    const cv = typeof body.cvData === 'string' ? JSON.parse(body.cvData) : body.cvData;
    if (!cv || typeof cv !== 'object' || Array.isArray(cv) || !Object.keys(cv).length) throw new Error('Add your CV details first.');
    if (JSON.stringify(cv).length > 60_000) throw new Error('CV data exceeds 60000 characters.');
    if (typeof body.jobDescription !== 'string' || !body.jobDescription.trim() || body.jobDescription.length > 20_000) throw new Error('Add a job description of at most 20000 characters.');
    if (typeof body.jobTitle !== 'string' || !body.jobTitle.trim() || body.jobTitle.length > 200) throw new Error('Add a job title of at most 200 characters.');
    req.body = { cvData: cv, jobDescription: body.jobDescription.trim(), jobTitle: body.jobTitle.trim() };
    next();
  } catch { return res.status(400).json({ message: 'Add valid CV details, a job title (up to 200 characters) and a job description (up to 20000 characters). CV data must be under 60000 characters.' }); }
}

export function createTailoringAccess(getSupabase: typeof getClient = getClient, secret = () => process.env.GUEST_QUOTA_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const check = (reserve: boolean, continueOnAllowed = false) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = req.headers.authorization || !bypassLocalCheckLimits(req) ? getSupabase() : null;
      let userId: string | null = null;
      if (req.headers.authorization) {
        const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization);
        if (!match) return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Sign in again to continue.' });
        const { data, error } = await db!.auth.getUser(match[1]);
        if (error || !data.user) return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Your session expired. Sign in again.' });
        userId = data.user.id;
      }
      if (bypassLocalCheckLimits(req)) {
        const data = { allowed: true, remaining: 4, limit: 4, reset_at: new Date(Date.now() + 86400000).toISOString(), guest: !req.headers.authorization, local_unlimited: true };
        res.locals.tailoringAllowance = data;
        res.setHeader('Cache-Control', 'no-store');
        if (!reserve && !continueOnAllowed) return res.json(data);
        return next();
      }
      // Never trust raw forwarding headers or a browser-supplied identity/quota.
      const address = req.ip || req.socket.remoteAddress;
      let guestKey: string | null = null;
      if (!userId) {
        const key = secret();
        if (!key || !address || !isIP(address)) throw new Error('Guest identity unavailable');
        guestKey = createHmac('sha256', key).update(`tailoring-v1:${address.replace(/^::ffff:/, '')}`).digest('hex');
      }
      const { data, error } = await db!.rpc('check_tailoring_allowance', { p_user_id: userId, p_guest_key: guestKey, p_reserve: reserve });
      if (error || !data || typeof data.allowed !== 'boolean' || !Number.isInteger(data.remaining) || typeof data.reset_at !== 'string' || !Number.isFinite(Date.parse(data.reset_at)) || !Number.isInteger(data.limit) || data.limit < 1 || data.remaining < 0 || data.remaining > data.limit) throw new Error('Quota unavailable');
      res.locals.tailoringAllowance = data;
      res.setHeader('Cache-Control', 'no-store');
      if (!reserve && !continueOnAllowed) return res.json(data);
      if (!data.allowed) {
        if (data.reason === 'budget') return res.status(503).json({ code: 'GUEST_BUSY', message: 'Guest tailoring is temporarily at capacity. Sign in or try again later.' });
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((Date.parse(data.reset_at) - Date.now()) / 1000))));
        return res.status(429).json({ code: userId ? 'TAILORING_LIMIT' : 'AUTH_REQUIRED', message: userId ? 'Your tailoring allowance has been used. You can still edit your CV; try again after the reset.' : 'You have used the four daily guest tailorings for this network. Sign in or create an account to continue.', ...data });
      }
      next();
    } catch {
      // Do not expose credentials, raw IPs, CV content or provider errors.
      return res.status(503).json({ code: 'QUOTA_UNAVAILABLE', message: 'Tailoring usage checks are unavailable. Your CV can still be edited; please try again later.' });
    }
  };
  return { reserve: check(true), allowance: check(false), preflight: check(false, true) };
}
export const tailoringAccess = createTailoringAccess();
