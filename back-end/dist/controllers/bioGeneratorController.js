"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBios = void 0;
const openaiClient_1 = require("../utils/openaiClient");
const generateBios = async (req, res) => {
    try {
        const { cvData, formats, tones } = req.body;
        if (!cvData) {
            return res.status(400).json({ message: 'cvData is required.' });
        }
        const selectedFormats = Array.isArray(formats) && formats.length > 0 ? formats : ['linkedin_headline'];
        const selectedTones = Array.isArray(tones) && tones.length > 0 ? tones : ['executive'];
        const parsedCvData = typeof cvData === 'string' ? JSON.parse(cvData) : cvData;
        const bios = await (0, openaiClient_1.sendToOpenAIForBioGenerator)(parsedCvData, selectedFormats, selectedTones);
        res.json({ bios });
    }
    catch (error) {
        console.error('Error generating bios:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
exports.generateBios = generateBios;
