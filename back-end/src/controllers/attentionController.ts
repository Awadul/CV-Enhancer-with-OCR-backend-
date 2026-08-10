import { Request, Response } from 'express';
import { sendToOpenAIForAttention } from '../utils/openaiClient';

export const analyzeAttention = async (req: Request, res: Response) => {
  try {
    const { layoutSummary, cvData } = req.body;

    if (!layoutSummary) {
      return res.status(400).json({ message: 'layoutSummary is required.' });
    }

    const result = await sendToOpenAIForAttention(
      typeof layoutSummary === 'string' ? JSON.parse(layoutSummary) : layoutSummary,
      typeof cvData === 'string' ? JSON.parse(cvData) : cvData || {}
    );

    res.json(result);
  } catch (error) {
    console.error('Error generating attention analysis:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};
