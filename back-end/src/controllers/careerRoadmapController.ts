import { Request, Response } from 'express';
import { sendToOpenAIForCareerRoadmap } from '../utils/openaiClient';

export const generateCareerRoadmap = async (req: Request, res: Response) => {
  try {
    const { cvData, targetRole, timeline, experienceLevel } = req.body;

    if (!cvData) {
      return res.status(400).json({ message: 'cvData is required.' });
    }
    if (!targetRole?.trim()) {
      return res.status(400).json({ message: 'targetRole is required.' });
    }

    const result = await sendToOpenAIForCareerRoadmap(
      typeof cvData === 'string' ? JSON.parse(cvData) : cvData,
      targetRole,
      timeline || '12 months',
      experienceLevel || ''
    );

    res.json(result);
  } catch (error) {
    console.error('Error generating career roadmap:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};
