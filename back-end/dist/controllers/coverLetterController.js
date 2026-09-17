"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCoverLetter = void 0;
const openaiClient_1 = require("../utils/openaiClient");
const generateCoverLetter = async (req, res) => {
    try {
        const { cvData, jobDescription, companyName, jobTitle } = req.body;
        if (!cvData) {
            return res.status(400).json({ message: 'cvData is required.' });
        }
        if (!jobDescription?.trim()) {
            return res.status(400).json({ message: 'jobDescription is required.' });
        }
        if (!jobTitle?.trim()) {
            return res.status(400).json({ message: 'jobTitle is required.' });
        }
        const coverLetter = await (0, openaiClient_1.sendToOpenAIForCoverLetter)(typeof cvData === 'string' ? JSON.parse(cvData) : cvData, jobDescription, companyName || '', jobTitle);
        res.json({ coverLetter });
    }
    catch (error) {
        console.error('Error generating cover letter:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
exports.generateCoverLetter = generateCoverLetter;
