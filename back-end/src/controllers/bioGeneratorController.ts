import { Request, Response } from 'express';
import { sendToOpenAIForBioGenerator } from '../utils/openaiClient';

export const generateBios = async (req: Request, res: Response) => {
  try {
    const { cvData, formats, tones } = req.body;

    if (!cvData) {
      return res.status(400).json({ message: 'cvData is required.' });
    }

    const selectedFormats = Array.isArray(formats) && formats.length > 0 ? formats : ['linkedin_headline'];
    const selectedTones = Array.isArray(tones) && tones.length > 0 ? tones : ['executive'];

    const parsedCvData = typeof cvData === 'string' ? JSON.parse(cvData) : cvData;

    const bios = await sendToOpenAIForBioGenerator(parsedCvData, selectedFormats, selectedTones);

    res.json({ bios });
  } catch (error) {
    console.error('Error generating bios:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};
