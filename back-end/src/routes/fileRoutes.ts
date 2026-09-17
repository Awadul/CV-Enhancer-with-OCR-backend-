import { Router } from 'express';
import { uploadFile, parseText, getATSAnalysisController, optimizeATSController } from '../controllers/fileController';
import { generatePDFController } from '../controllers/pdfController';
import upload from '../middleware/multerConfig';

const router = Router();

router.post('/file/upload', upload.single('file'), uploadFile);
router.post('/file/parse-text', parseText);
router.post('/file/ats-score', getATSAnalysisController);
router.post('/file/ats-optimize', optimizeATSController);
router.post('/pdf/generate', generatePDFController);

export default router; 