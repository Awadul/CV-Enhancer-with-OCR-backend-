"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareSalaries = exports.getSalaryInsights = void 0;
const openaiClient_1 = require("../utils/openaiClient");
const getSalaryInsights = async (req, res) => {
    try {
        const { jobTitle, location, experienceLevel, company } = req.body;
        if (!jobTitle?.trim()) {
            return res.status(400).json({ message: 'jobTitle is required.' });
        }
        const result = await (0, openaiClient_1.sendToOpenAIForSalaryInsights)(jobTitle, location || '', experienceLevel || 'Mid-level', company || '');
        res.json(result);
    }
    catch (error) {
        console.error('Error getting salary insights:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
exports.getSalaryInsights = getSalaryInsights;
const compareSalaries = async (req, res) => {
    try {
        const { jobTitle, locations, experienceLevel, company } = req.body;
        if (!jobTitle?.trim()) {
            return res.status(400).json({ message: 'jobTitle is required.' });
        }
        if (!Array.isArray(locations) || locations.length < 2) {
            return res.status(400).json({ message: 'At least 2 locations are required for comparison.' });
        }
        const result = await (0, openaiClient_1.sendToOpenAIForSalaryComparison)(jobTitle, locations, experienceLevel || 'Mid-level', company || '');
        res.json(result);
    }
    catch (error) {
        console.error('Error comparing salaries:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
exports.compareSalaries = compareSalaries;
