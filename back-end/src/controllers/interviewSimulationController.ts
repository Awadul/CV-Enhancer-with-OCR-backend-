import { Request, Response } from 'express';
import { sendToOpenAIForInterviewSimulation, sendToOpenAIForInterviewFeedback } from '../utils/openaiClient';

export const startSimulation = async (req: Request, res: Response) => {
  try {
    const { cvData, jobDescription, jobTitle, companyName, roundType } = req.body;

    if (!cvData) {
      return res.status(400).json({ message: 'cvData is required.' });
    }
    if (!jobDescription?.trim()) {
      return res.status(400).json({ message: 'jobDescription is required.' });
    }
    if (!roundType?.trim()) {
      return res.status(400).json({ message: 'roundType is required.' });
    }

    const result = await sendToOpenAIForInterviewSimulation(
      typeof cvData === 'string' ? JSON.parse(cvData) : cvData,
      jobDescription,
      jobTitle || '',
      companyName || '',
      roundType
    );

    res.json(result);
  } catch (error) {
    console.error('Error starting simulation:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};

export const getFeedback = async (req: Request, res: Response) => {
  try {
    const { question, userAnswer, modelAnswer, whatToLookFor } = req.body;

    if (!question?.trim()) {
      return res.status(400).json({ message: 'question is required.' });
    }
    if (!userAnswer?.trim()) {
      return res.status(400).json({ message: 'userAnswer is required.' });
    }

    const result = await sendToOpenAIForInterviewFeedback(
      question,
      userAnswer,
      modelAnswer || '',
      whatToLookFor || ''
    );

    res.json(result);
  } catch (error) {
    console.error('Error getting feedback:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};
