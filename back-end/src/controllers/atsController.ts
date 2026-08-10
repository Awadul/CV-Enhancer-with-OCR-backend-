import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { extractContentAndLinks } from './fileController';
import { checkATSRules, cvDataToText } from '../utils/atsChecker';
import { sendToOpenAIForATSWithData } from '../utils/openaiClient';
import { createClient } from '@supabase/supabase-js';

// Plan-based monthly ATS scan limits. Must stay in sync with the frontend
// USAGE_LIMITS in src/data/pricing.ts.
const PLAN_ATS_LIMITS: Record<string, number> = {
  starter: 3,
  pro: 999,
  premium: 999,
  enterprise: 999,
};

let supabase: any = null;
function getSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error('Supabase credentials not configured');
    supabase = createClient(url, serviceKey);
  }
  return supabase;
}

export const checkATS = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId as string | undefined;
    const userPlan = (req as any).userPlan as string | undefined;

    // Enforce per-plan monthly limit for authenticated users.
    if (userId) {
      const limit = PLAN_ATS_LIMITS[userPlan || 'starter'] ?? 3;
      const client = getSupabase();

      const { data: usage, error: usageErr } = await client
        .from('user_usage')
        .select('atsScansPerMonth')
        .eq('user_id', userId)
        .maybeSingle();

      if (usageErr) {
        console.warn('[checkATS] usage lookup failed:', usageErr.message);
      }

      const used = usage?.atsScansPerMonth ?? 0;
      if (used >= limit) {
        return res.status(429).json({
          message:
            limit <= 3
              ? 'You have used your 3 free ATS scans for this month. Upgrade your plan for unlimited scans.'
              : 'You have reached your monthly ATS scan limit. Upgrade your plan for more scans.',
        });
      }
    }

    const jobDescription: string | undefined = req.body.jobDescription;
    let cvText = '';
    let cvData: Record<string, unknown> | null = null;

    if (req.body.cvData) {
      // Structured cvData provided directly — preferred path
      cvData = typeof req.body.cvData === 'string' ? JSON.parse(req.body.cvData) : req.body.cvData;
      cvText = cvDataToText(cvData!);
    } else if (req.file) {
      const filePath = req.file.path;
      const extension = path.extname(req.file.originalname).toLowerCase();
      const extracted = await extractContentAndLinks(filePath, extension);
      cvText = extracted.content.join('\n');

      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    } else if (req.body.cvText) {
      cvText = req.body.cvText;
    } else {
      return res.status(400).json({ message: 'No CV provided. Upload a file, send cvText, or send cvData.' });
    }

    if (!cvText.trim()) {
      return res.status(400).json({ message: 'Could not extract text from the provided CV.' });
    }

    // 1. Rule-based check (fast) — always uses text
    const ruleResult = checkATSRules(cvText, jobDescription);

    // 2. AI-based analysis — uses structured cvData if available, else raw text
    let aiResult;
    try {
      if (cvData) {
        aiResult = await sendToOpenAIForATSWithData(cvData, jobDescription);
      } else {
        const { sendToOpenAIForATS } = await import('../utils/openaiClient');
        aiResult = await sendToOpenAIForATS(cvText, jobDescription);
      }
    } catch (aiErr) {
      console.error('AI ATS analysis failed, returning rule results only:', aiErr);
      aiResult = null;
    }

    // Increment usage for authenticated users only.
    if (userId) {
      try {
        await getSupabase().rpc('increment_usage', {
          p_user_id: userId,
          p_feature: 'atsScansPerMonth',
        });
      } catch (incErr) {
        console.warn('[checkATS] increment_usage failed:', (incErr as Error).message);
      }
    }

    res.json({
      ruleBased: ruleResult,
      aiAnalysis: aiResult,
    });
  } catch (error) {
    console.error('Error in ATS check:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};
