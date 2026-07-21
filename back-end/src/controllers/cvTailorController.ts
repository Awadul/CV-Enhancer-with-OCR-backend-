import { Request, Response } from 'express';
import { sendToOpenAIForCVTailor } from '../utils/openaiClient';

export const tailorCV = async (req: Request, res: Response) => {
  try {
    const { cvData, jobDescription, jobTitle } = req.body;

    if (!cvData) {
      return res.status(400).json({ message: 'cvData is required.' });
    }
    if (!jobDescription?.trim()) {
      return res.status(400).json({ message: 'jobDescription is required.' });
    }
    if (!jobTitle?.trim()) {
      return res.status(400).json({ message: 'jobTitle is required.' });
    }

    const result = await sendToOpenAIForCVTailor(
      typeof cvData === 'string' ? JSON.parse(cvData) : cvData,
      jobDescription,
      jobTitle
    );

    res.json(result);
  } catch (error) {
    console.error('Error tailoring CV:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};
