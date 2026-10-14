"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trimToOnePage = void 0;
const openaiClient_1 = require("../utils/openaiClient");
const trimToOnePage = async (req, res) => {
    try {
        const { cvData, maxPages } = req.body;
        if (!cvData) {
            return res.status(400).json({ message: 'cvData is required.' });
        }
        const result = await (0, openaiClient_1.sendToOpenAIForTrimToOnePage)(typeof cvData === 'string' ? JSON.parse(cvData) : cvData, maxPages && typeof maxPages === 'number' ? maxPages : 1);
        res.json(result);
    }
    catch (error) {
        console.error('Error trimming resume to one page:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
exports.trimToOnePage = trimToOnePage;
