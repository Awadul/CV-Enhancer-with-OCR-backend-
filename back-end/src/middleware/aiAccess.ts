import { Request, Response, NextFunction } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type Feature = 'bios' | 'ats_fix' | 'resume_trim';
export type AccessRequest = Request & { userId?: string; userEmail?: string };

// Lazy initialization keeps environment loading out of module evaluation.
let client: SupabaseClient | undefined;
function getClient(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Supabase credentials not configured');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

export function createAiAccess(getSupabase: typeof getClient = getClient) {
  const authenticate = async (req: AccessRequest, res: Response, next: NextFunction) => {
    const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
    if (!match) return res.status(401).json({ message: 'Sign in to use this AI feature.' });
    try {
      const { data, error } = await getSupabase().auth.getUser(match[1]);
      if (error || !data.user) return res.status(401).json({ message: 'Your session is invalid or expired. Sign in again.' });
      req.userId = data.user.id;
      req.userEmail = data.user.email;
      return next();
    } catch (error) {
      console.error('[aiAccess] authentication unavailable:', error);
      return res.status(503).json({ message: 'Unable to verify your session. Please try again later.' });
    }
  };

  const reserveQuota = (feature: Feature) => async (req: AccessRequest, res: Response, next: NextFunction) => {
    if (!req.userId) return res.status(401).json({ message: 'Sign in to use this AI feature.' });
    try {
      // The service-only RPC resolves the plan and increments under a database lock.
      // No plan, quota, period or user identity is trusted from the request body.
      const { data, error } = await getSupabase().rpc('reserve_ai_feature_usage', {
        p_user_id: req.userId,
        p_feature: feature,
      });
      if (error || !data || typeof data.allowed !== 'boolean') throw error || new Error('Invalid quota response');
      if (!data.allowed) {
        if (data.reason === 'plan') return res.status(403).json({ message: 'Upgrade your plan to use this AI feature.' });
        if (data.reason !== 'quota') throw new Error('Unexpected quota denial');
        return res.status(429).json({ message: 'Your monthly limit for this AI feature has been reached.' });
      }
      return next();
    } catch (error) {
      console.error('[aiAccess] quota reservation unavailable:', error);
      // Fail closed: never run a billable call when quota enforcement is unavailable.
      return res.status(503).json({ message: 'AI usage checks are temporarily unavailable. Please try again later.' });
    }
  };
  return { authenticate, reserveQuota };
}

export const { authenticate: requireAiUser, reserveQuota: requireAiQuota } = createAiAccess();
export const requireUser = requireAiUser;

export function validateAiInput(feature: Feature) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('A JSON object is required.');
      const cv = typeof body.cvData === 'string' ? JSON.parse(body.cvData) : body.cvData;
      if (!cv || typeof cv !== 'object' || Array.isArray(cv) || !Object.keys(cv).length) throw new Error('cvData must be a nonempty JSON object.');
      if (JSON.stringify(cv).length > 100_000) throw new Error('CV data is too large.');
      body.cvData = cv;
      if (feature === 'resume_trim') {
        body.maxPages ??= 1;
        if (!Number.isInteger(body.maxPages) || body.maxPages < 1 || body.maxPages > 5) throw new Error('maxPages must be an integer from 1 to 5.');
      }
      if (feature === 'bios') {
        const formats = ['linkedin_headline', 'twitter_bio', 'speaker_bio', 'email_signature'];
        const tones = ['executive', 'technical', 'creative', 'academic'];
        for (const [key, allowed, fallback] of [['formats', formats, 'linkedin_headline'], ['tones', tones, 'executive']] as const) {
          body[key] ??= [fallback];
          if (!Array.isArray(body[key]) || !body[key].length || body[key].length > 4 || body[key].some((v: unknown) => typeof v !== 'string' || !allowed.includes(v))) throw new Error(`Unsupported ${key}.`);
          body[key] = [...new Set(body[key])];
        }
      }
      if (feature === 'ats_fix') {
        if (body.jobDescription !== undefined && (typeof body.jobDescription !== 'string' || body.jobDescription.length > 30_000)) throw new Error('jobDescription must be text of at most 30000 characters.');
        if (body.issues !== undefined) {
          if (!body.issues || typeof body.issues !== 'object' || Array.isArray(body.issues)) throw new Error('issues must be an object.');
          for (const key of ['failedRules', 'recommendations', 'keywordGaps', 'contentSuggestions', 'missingSections']) {
            body.issues[key] ??= [];
            const entries = body.issues[key];
            if (!Array.isArray(entries) || entries.length > 100) throw new Error(`Invalid ${key}.`);
            const valid = key === 'failedRules'
              ? entries.every(v => v && ['section', 'rule', 'details'].every(field => typeof v[field] === 'string' && v[field].length <= 2000))
              : entries.every(v => typeof v === 'string' && v.length <= 2000);
            if (!valid) throw new Error(`Invalid ${key}.`);
          }
        }
      }
      return next();
    } catch (error) {
      return res.status(400).json({ message: error instanceof SyntaxError ? 'cvData contains invalid JSON.' : (error as Error).message });
    }
  };
}
