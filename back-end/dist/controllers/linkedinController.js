"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeLinkedInProfile = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const fileController_1 = require("./fileController");
const openaiClient_1 = require("../utils/openaiClient");
const analyzeLinkedInProfile = async (req, res) => {
    try {
        let profileText = '';
        if (req.body.profileText) {
            profileText = req.body.profileText;
        }
        else if (req.file) {
            const filePath = req.file.path;
            const extension = path_1.default.extname(req.file.originalname).toLowerCase();
            const extracted = await (0, fileController_1.extractContentAndLinks)(filePath, extension);
            profileText = extracted.content.join('\n');
            if (fs_1.default.existsSync(filePath)) {
                try {
                    fs_1.default.unlinkSync(filePath);
                }
                catch { }
            }
        }
        else {
            return res.status(400).json({ message: 'profileText or a file is required.' });
        }
        if (!profileText.trim()) {
            return res.status(400).json({ message: 'Could not extract text from the provided profile.' });
        }
        const result = await (0, openaiClient_1.sendToOpenAIForLinkedInProfile)(profileText);
        res.json(result);
    }
    catch (error) {
        console.error('Error analyzing LinkedIn profile:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
exports.analyzeLinkedInProfile = analyzeLinkedInProfile;
