"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCareerRoadmap = void 0;
const openaiClient_1 = require("../utils/openaiClient");
const generateCareerRoadmap = async (req, res) => {
    try {
        const { cvData, targetRole, timeline, experienceLevel } = req.body;
        if (!cvData) {
            return res.status(400).json({ message: 'cvData is required.' });
        }
        if (!targetRole?.trim()) {
            return res.status(400).json({ message: 'targetRole is required.' });
        }
        const result = await (0, openaiClient_1.sendToOpenAIForCareerRoadmap)(typeof cvData === 'string' ? JSON.parse(cvData) : cvData, targetRole, timeline || '12 months', experienceLevel || '');
        res.json(result);
    }
    catch (error) {
        console.error('Error generating career roadmap:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
exports.generateCareerRoadmap = generateCareerRoadmap;
