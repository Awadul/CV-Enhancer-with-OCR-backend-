import { Request, Response } from 'express';
import { sendToOpenAIForFixATS } from '../utils/openaiClient';

export const fixATS = async (req: Request, res: Response) => {
  try {
    const { cvData, jobDescription, issues } = req.body;

    if (!cvData) {
      return res.status(400).json({ message: 'cvData is required.' });
    }

    const result = await sendToOpenAIForFixATS(
      typeof cvData === 'string' ? JSON.parse(cvData) : cvData,
      typeof jobDescription === 'string' ? jobDescription : undefined,
      issues
    );

    res.json(result);
  } catch (error) {
    console.error('Error fixing ATS issues:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};