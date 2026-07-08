import { Request, Response } from 'express';
import { sendToOpenAIForSalaryInsights, sendToOpenAIForSalaryComparison } from '../utils/openaiClient';

export const getSalaryInsights = async (req: Request, res: Response) => {
  try {
    const { jobTitle, location, experienceLevel, company } = req.body;

    if (!jobTitle?.trim()) {
      return res.status(400).json({ message: 'jobTitle is required.' });
    }

    const result = await sendToOpenAIForSalaryInsights(
      jobTitle,
      location || '',
      experienceLevel || 'Mid-level',
      company || ''
    );

    res.json(result);
  } catch (error) {
    console.error('Error getting salary insights:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};

export const compareSalaries = async (req: Request, res: Response) => {
  try {
    const { jobTitle, locations, experienceLevel, company } = req.body;

    if (!jobTitle?.trim()) {
      return res.status(400).json({ message: 'jobTitle is required.' });
    }
    if (!Array.isArray(locations) || locations.length < 2) {
      return res.status(400).json({ message: 'At least 2 locations are required for comparison.' });
    }

    const result = await sendToOpenAIForSalaryComparison(
      jobTitle,
      locations,
      experienceLevel || 'Mid-level',
      company || ''
    );

    res.json(result);
  } catch (error) {
    console.error('Error comparing salaries:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};
