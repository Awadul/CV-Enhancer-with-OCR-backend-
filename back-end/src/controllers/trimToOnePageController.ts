import { Request, Response } from 'express';
import { sendToOpenAIForTrimToOnePage } from '../utils/openaiClient';

export const trimToOnePage = async (req: Request, res: Response) => {
  try {
    const { cvData, maxPages } = req.body;

    if (!cvData) {
      return res.status(400).json({ message: 'cvData is required.' });
    }

    const result = await sendToOpenAIForTrimToOnePage(
      typeof cvData === 'string' ? JSON.parse(cvData) : cvData,
      maxPages && typeof maxPages === 'number' ? maxPages : 1
    );

    res.json(result);
  } catch (error) {
    console.error('Error trimming resume to one page:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};