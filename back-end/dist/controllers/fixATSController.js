"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fixATS = void 0;
const openaiClient_1 = require("../utils/openaiClient");
const fixATS = async (req, res) => {
    try {
        const { cvData, jobDescription, issues } = req.body;
        if (!cvData) {
            return res.status(400).json({ message: 'cvData is required.' });
        }
        const result = await (0, openaiClient_1.sendToOpenAIForFixATS)(typeof cvData === 'string' ? JSON.parse(cvData) : cvData, typeof jobDescription === 'string' ? jobDescription : undefined, issues);
        res.json(result);
    }
    catch (error) {
        console.error('Error fixing ATS issues:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
exports.fixATS = fixATS;
