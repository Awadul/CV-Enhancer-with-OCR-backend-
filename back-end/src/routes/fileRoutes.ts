import { Router } from 'express';
import { uploadFile } from '../controllers/fileController';
import { generatePDFController } from '../controllers/pdfController';
import upload from '../middleware/multerConfig';

const router = Router();

router.post('/file/upload', upload.single('file'), uploadFile);
router.post('/pdf/generate', generatePDFController);

export default router; 