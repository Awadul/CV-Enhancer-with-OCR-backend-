"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeAttention = void 0;
const openaiClient_1 = require("../utils/openaiClient");
const analyzeAttention = async (req, res) => {
    try {
        const { layoutSummary, cvData } = req.body;
        if (!layoutSummary) {
            return res.status(400).json({ message: 'layoutSummary is required.' });
        }
        const result = await (0, openaiClient_1.sendToOpenAIForAttention)(typeof layoutSummary === 'string' ? JSON.parse(layoutSummary) : layoutSummary, typeof cvData === 'string' ? JSON.parse(cvData) : cvData || {});
        res.json(result);
    }
    catch (error) {
        console.error('Error generating attention analysis:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
exports.analyzeAttention = analyzeAttention;
