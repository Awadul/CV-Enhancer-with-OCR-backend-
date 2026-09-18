import { Request, Response } from 'express';
import crypto from 'crypto';
import { sendToOpenAIForAttention } from '../utils/openaiClient';

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const attentionCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL

export const analyzeAttention = async (req: Request, res: Response) => {
  try {
    const { layoutSummary, cvData } = req.body;

    if (!layoutSummary) {
      return res.status(400).json({ message: 'layoutSummary is required.' });
    }

    const payloadString = JSON.stringify({ layoutSummary, cvData: cvData || {} });
    const cacheKey = crypto.createHash('sha256').update(payloadString).digest('hex');

    const cached = attentionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.data);
    }

    const result = await sendToOpenAIForAttention(
      typeof layoutSummary === 'string' ? JSON.parse(layoutSummary) : layoutSummary,
      typeof cvData === 'string' ? JSON.parse(cvData) : cvData || {}
    );

    attentionCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    res.json(result);
  } catch (error) {
    console.error('Error generating attention analysis:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};
