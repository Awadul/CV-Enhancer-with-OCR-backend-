import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { MAX_CV_FILE_BYTES, validateImportFile } from '../utils/cvImport';

const parser = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_CV_FILE_BYTES, files: 1, fields: 2, fieldSize: 20_000, parts: 4 }, fileFilter: (_req,file,cb) => cb(null, /\.(pdf|docx|txt)$/i.test(file.originalname)) }).single('file');
let active = 0;
export function cvImportSlots(_req: Request, res: Response, next: NextFunction) {
  if (active >= 2) return res.status(503).json({ message: 'CV imports are busy. Please try again shortly.' });
  active++;
  let released = false;
  const release = () => { if (!released) { released = true; active--; } };
  res.once('finish',release); res.once('close',release);
  next();
}
export function receiveCVImport(req: Request, res: Response, next: NextFunction) {
  parser(req,res,error => {
    if (error) return res.status(error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: 'Upload one PDF, DOCX or TXT file up to 4 MB, with a job title and description.' });
    try {
      if (!req.file) throw new Error('Choose a PDF, DOCX or TXT file.');
      const ext = validateImportFile(req.file.originalname,req.file.buffer);
      const {jobTitle,jobDescription} = req.body;
      if (typeof jobTitle !== 'string' || !jobTitle.trim() || jobTitle.length > 200 || typeof jobDescription !== 'string' || !jobDescription.trim() || jobDescription.length > 20000) throw new Error('Add a job title and description within the stated limits.');
      req.body = {jobTitle:jobTitle.trim(),jobDescription:jobDescription.trim()};
      res.locals.importExtension = ext;
      next();
    } catch(error) { return res.status(400).json({message:(error as Error).message}); }
  });
}

