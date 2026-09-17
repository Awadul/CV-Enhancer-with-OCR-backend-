import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

/**
 * Optional authentication middleware.
 *
 * If an `Authorization: Bearer <token>` header is present, the JWT is
 * verified against Supabase and the user's id + plan are attached to the
 * request. If no token is present (anonymous user) the request passes
 * through untouched so downstream rate limiting can apply.
 *
 * Verification uses the Supabase service-role key so it works regardless of
 * RLS policies.
 */

let supabase: any = null;

function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      throw new Error('Supabase credentials not configured');
    }
    supabase = createClient(url, serviceKey);
  }
  return supabase;
}

export interface AuthedRequest extends Request {
  userId?: string;
  userPlan?: string;
}

export async function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return next();
  }

  try {
    const client = getSupabase();
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) {
      // Invalid token — treat as anonymous, do not block the request.
      return next();
    }

    const userId = data.user.id;

    // Resolve the user's plan from the subscriptions table.
    let userPlan = 'starter';
    const { data: sub } = await client
      .from('user_subscriptions')
      .select('plan_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (sub?.plan_id) {
      userPlan = sub.plan_id;
    }

    req.userId = userId;
    req.userPlan = userPlan;
    return next();
  } catch (err) {
    // On any auth failure, fall back to anonymous rather than blocking.
    console.warn('[optionalAuth] verification failed:', (err as Error).message);
    return next();
  }
}
