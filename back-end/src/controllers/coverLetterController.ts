import { Request, Response } from 'express';
import { sendToOpenAIForCoverLetter } from '../utils/openaiClient';

export const generateCoverLetter = async (req: Request, res: Response) => {
  try {
    const { cvData, jobDescription, companyName, jobTitle } = req.body;

    if (!cvData) {
      return res.status(400).json({ message: 'cvData is required.' });
    }
    if (!jobDescription?.trim()) {
      return res.status(400).json({ message: 'jobDescription is required.' });
    }
    if (!jobTitle?.trim()) {
      return res.status(400).json({ message: 'jobTitle is required.' });
    }

    const coverLetter = await sendToOpenAIForCoverLetter(
      typeof cvData === 'string' ? JSON.parse(cvData) : cvData,
      jobDescription,
      companyName || '',
      jobTitle
    );

    res.json({ coverLetter });
  } catch (error) {
    console.error('Error generating cover letter:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};
