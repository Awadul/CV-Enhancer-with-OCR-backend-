import { Request, Response } from 'express';
import { sendToOpenAIForKeywordOptimization } from '../utils/openaiClient';

export const optimizeKeywords = async (req: Request, res: Response) => {
  try {
    const { cvData, jobDescription } = req.body;

    if (!cvData) {
      return res.status(400).json({ message: 'cvData is required.' });
    }
    if (!jobDescription?.trim()) {
      return res.status(400).json({ message: 'jobDescription is required.' });
    }

    const result = await sendToOpenAIForKeywordOptimization(
      typeof cvData === 'string' ? JSON.parse(cvData) : cvData,
      jobDescription
    );

    res.json(result);
  } catch (error) {
    console.error('Error optimizing keywords:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};