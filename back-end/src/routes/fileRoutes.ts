import { Router } from 'express';
import { uploadFile, parseText } from '../controllers/fileController';
import { generatePDFController } from '../controllers/pdfController';
import { checkATS } from '../controllers/atsController';
import { searchJobsHandler } from '../controllers/jobsController';
import upload from '../middleware/multerConfig';

const router = Router();

router.post('/file/upload', upload.single('file'), uploadFile);
router.post('/file/parse-text', parseText);
router.post('/pdf/generate', generatePDFController);
router.post('/ats/check', upload.single('file'), checkATS);
router.post('/jobs/search', searchJobsHandler);

export default router; 