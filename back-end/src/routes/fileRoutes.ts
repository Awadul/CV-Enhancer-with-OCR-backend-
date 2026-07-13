import { Router } from 'express';
import { uploadFile, parseText } from '../controllers/fileController';
import { generatePDFController } from '../controllers/pdfController';
import { checkATS } from '../controllers/atsController';
import { searchJobsHandler, extractFromUrlHandler } from '../controllers/jobsController';
import { generateCoverLetter } from '../controllers/coverLetterController';
import { polishResume } from '../controllers/resumePolishController';
import { analyzeSkillGap } from '../controllers/skillGapController';
import { generateInterviewPrep } from '../controllers/interviewPrepController';
import { startSimulation, getFeedback } from '../controllers/interviewSimulationController';
import { getSalaryInsights, compareSalaries } from '../controllers/salaryInsightsController';
import { generateCareerRoadmap } from '../controllers/careerRoadmapController';
import upload from '../middleware/multerConfig';

const router = Router();

router.post('/file/upload', upload.single('file'), uploadFile);
router.post('/file/parse-text', parseText);
router.post('/pdf/generate', generatePDFController);
router.post('/ats/check', upload.single('file'), checkATS);
router.post('/jobs/search', searchJobsHandler);
router.post('/jobs/extract', extractFromUrlHandler);
router.post('/cover-letter/generate', generateCoverLetter);
router.post('/resume/polish', polishResume);
router.post('/skills/gap', analyzeSkillGap);
router.post('/interview/prep', generateInterviewPrep);
router.post('/interview/simulate', startSimulation);
router.post('/interview/feedback', getFeedback);
router.post('/salary/insights', getSalaryInsights);
router.post('/salary/compare', compareSalaries);
router.post('/career/roadmap', generateCareerRoadmap);

export default router; 