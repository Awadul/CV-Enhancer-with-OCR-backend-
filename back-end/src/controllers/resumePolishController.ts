import { Request, Response } from 'express';
import { sendToOpenAIForResumePolish } from '../utils/openaiClient';

export const polishResume = async (req: Request, res: Response) => {
  try {
    const { cvData } = req.body;

    if (!cvData) {
      return res.status(400).json({ message: 'cvData is required.' });
    }

    const result = await sendToOpenAIForResumePolish(
      typeof cvData === 'string' ? JSON.parse(cvData) : cvData
    );

    res.json(result);
  } catch (error) {
    console.error('Error polishing resume:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};
