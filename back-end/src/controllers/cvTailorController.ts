import { Request, Response } from 'express';
import { unsupportedTailoringClaim } from '../utils/tailoringClaims';
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

    if (!result || typeof result.summary !== 'string' || !Array.isArray(result.suggestions)) throw new Error('Invalid provider result');
    const suggestions = result.suggestions.slice(0, 12).filter((entry: any) => entry &&
      ['experience', 'projects', 'skills'].includes(entry.section) &&
      Number.isInteger(entry.itemIndex) && entry.itemIndex >= 0 && entry.itemIndex < 200 &&
      ['field', 'current', 'improved', 'reason', 'itemLabel'].every(key => typeof entry[key] === 'string' && entry[key].length <= 6000) && !unsupportedTailoringClaim(entry.current, entry.improved, jobDescription));
    const summary = unsupportedTailoringClaim(JSON.stringify(cvData), result.summary, jobDescription) ? (typeof cvData.summary === 'string' ? cvData.summary : '') : result.summary.slice(0,6000);
    res.json({ summary, suggestions, allowance: res.locals.tailoringAllowance });
  } catch (error) {
    console.error('CV tailoring provider failed');
    res.status(500).json({ message: 'Tailoring could not complete. Your draft is unchanged. This attempt counts toward your allowance.', allowance: res.locals.tailoringAllowance });
  }
};
