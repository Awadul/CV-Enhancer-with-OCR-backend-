"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateInterviewPrep = void 0;
const openaiClient_1 = require("../utils/openaiClient");
const generateInterviewPrep = async (req, res) => {
    try {
        const { cvData, jobDescription, jobTitle, companyName } = req.body;
        if (!cvData) {
            return res.status(400).json({ message: 'cvData is required.' });
        }
        if (!jobDescription?.trim()) {
            return res.status(400).json({ message: 'jobDescription is required.' });
        }
        if (!jobTitle?.trim()) {
            return res.status(400).json({ message: 'jobTitle is required.' });
        }
        const result = await (0, openaiClient_1.sendToOpenAIForInterviewPrep)(typeof cvData === 'string' ? JSON.parse(cvData) : cvData, jobDescription, jobTitle, companyName || '');
        res.json(result);
    }
    catch (error) {
        console.error('Error generating interview prep:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
exports.generateInterviewPrep = generateInterviewPrep;
