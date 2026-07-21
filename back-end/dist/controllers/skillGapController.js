"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeSkillGap = void 0;
const openaiClient_1 = require("../utils/openaiClient");
const analyzeSkillGap = async (req, res) => {
    try {
        const { cvData, jobDescription } = req.body;
        if (!cvData) {
            return res.status(400).json({ message: 'cvData is required.' });
        }
        if (!jobDescription?.trim()) {
            return res.status(400).json({ message: 'jobDescription is required.' });
        }
        const result = await (0, openaiClient_1.sendToOpenAIForSkillGap)(typeof cvData === 'string' ? JSON.parse(cvData) : cvData, jobDescription);
        res.json(result);
    }
    catch (error) {
        console.error('Error analyzing skill gap:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
exports.analyzeSkillGap = analyzeSkillGap;
