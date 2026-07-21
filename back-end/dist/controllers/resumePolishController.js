"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.polishResume = void 0;
const openaiClient_1 = require("../utils/openaiClient");
const polishResume = async (req, res) => {
    try {
        const { cvData } = req.body;
        if (!cvData) {
            return res.status(400).json({ message: 'cvData is required.' });
        }
        const result = await (0, openaiClient_1.sendToOpenAIForResumePolish)(typeof cvData === 'string' ? JSON.parse(cvData) : cvData);
        res.json(result);
    }
    catch (error) {
        console.error('Error polishing resume:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
exports.polishResume = polishResume;
