import { Router } from 'express';
import { uploadFile, parseText } from '../controllers/fileController';
import { generatePDFController } from '../controllers/pdfController';
import upload from '../middleware/multerConfig';

const router = Router();

router.post('/file/upload', upload.single('file'), uploadFile);
router.post('/file/parse-text', parseText);
router.post('/pdf/generate', generatePDFController);

export default router; 