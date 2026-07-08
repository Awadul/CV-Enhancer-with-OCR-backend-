import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { extractContentAndLinks } from './fileController';
import { checkATSRules, cvDataToText } from '../utils/atsChecker';
import { sendToOpenAIForATSWithData } from '../utils/openaiClient';

export const checkATS = async (req: Request, res: Response) => {
  try {
    const jobDescription: string | undefined = req.body.jobDescription;
    let cvText = '';
    let cvData: Record<string, unknown> | null = null;

    if (req.body.cvData) {
      // Structured cvData provided directly — preferred path
      cvData = typeof req.body.cvData === 'string' ? JSON.parse(req.body.cvData) : req.body.cvData;
      cvText = cvDataToText(cvData!);
    } else if (req.file) {
      const filePath = req.file.path;
      const extension = path.extname(req.file.originalname).toLowerCase();
      const extracted = await extractContentAndLinks(filePath, extension);
      cvText = extracted.content.join('\n');

      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    } else if (req.body.cvText) {
      cvText = req.body.cvText;
    } else {
      return res.status(400).json({ message: 'No CV provided. Upload a file, send cvText, or send cvData.' });
    }

    if (!cvText.trim()) {
      return res.status(400).json({ message: 'Could not extract text from the provided CV.' });
    }

    // 1. Rule-based check (fast) — always uses text
    const ruleResult = checkATSRules(cvText, jobDescription);

    // 2. AI-based analysis — uses structured cvData if available, else raw text
    let aiResult;
    try {
      if (cvData) {
        aiResult = await sendToOpenAIForATSWithData(cvData, jobDescription);
      } else {
        const { sendToOpenAIForATS } = await import('../utils/openaiClient');
        aiResult = await sendToOpenAIForATS(cvText, jobDescription);
      }
    } catch (aiErr) {
      console.error('AI ATS analysis failed, returning rule results only:', aiErr);
      aiResult = null;
    }

    res.json({
      ruleBased: ruleResult,
      aiAnalysis: aiResult,
    });
  } catch (error) {
    console.error('Error in ATS check:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};
