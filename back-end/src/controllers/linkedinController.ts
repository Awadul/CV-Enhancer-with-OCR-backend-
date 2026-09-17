import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { extractContentAndLinks } from './fileController';
import { sendToOpenAIForLinkedInProfile } from '../utils/openaiClient';

export const analyzeLinkedInProfile = async (req: Request, res: Response) => {
  try {
    let profileText = '';

    if (req.body.profileText) {
      profileText = req.body.profileText;
    } else if (req.file) {
      const filePath = req.file.path;
      const extension = path.extname(req.file.originalname).toLowerCase();
      const extracted = await extractContentAndLinks(filePath, extension);
      profileText = extracted.content.join('\n');

      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    } else {
      return res.status(400).json({ message: 'profileText or a file is required.' });
    }

    if (!profileText.trim()) {
      return res.status(400).json({ message: 'Could not extract text from the provided profile.' });
    }

    const result = await sendToOpenAIForLinkedInProfile(profileText);

    res.json(result);
  } catch (error) {
    console.error('Error analyzing LinkedIn profile:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};
