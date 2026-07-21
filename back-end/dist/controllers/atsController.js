"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkATS = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const fileController_1 = require("./fileController");
const atsChecker_1 = require("../utils/atsChecker");
const openaiClient_1 = require("../utils/openaiClient");
const checkATS = async (req, res) => {
    try {
        const jobDescription = req.body.jobDescription;
        let cvText = '';
        let cvData = null;
        if (req.body.cvData) {
            // Structured cvData provided directly — preferred path
            cvData = typeof req.body.cvData === 'string' ? JSON.parse(req.body.cvData) : req.body.cvData;
            cvText = (0, atsChecker_1.cvDataToText)(cvData);
        }
        else if (req.file) {
            const filePath = req.file.path;
            const extension = path_1.default.extname(req.file.originalname).toLowerCase();
            const extracted = await (0, fileController_1.extractContentAndLinks)(filePath, extension);
            cvText = extracted.content.join('\n');
            if (fs_1.default.existsSync(filePath)) {
                try {
                    fs_1.default.unlinkSync(filePath);
                }
                catch { }
            }
        }
        else if (req.body.cvText) {
            cvText = req.body.cvText;
        }
        else {
            return res.status(400).json({ message: 'No CV provided. Upload a file, send cvText, or send cvData.' });
        }
        if (!cvText.trim()) {
            return res.status(400).json({ message: 'Could not extract text from the provided CV.' });
        }
        // 1. Rule-based check (fast) — always uses text
        const ruleResult = (0, atsChecker_1.checkATSRules)(cvText, jobDescription);
        // 2. AI-based analysis — uses structured cvData if available, else raw text
        let aiResult;
        try {
            if (cvData) {
                aiResult = await (0, openaiClient_1.sendToOpenAIForATSWithData)(cvData, jobDescription);
            }
            else {
                const { sendToOpenAIForATS } = await Promise.resolve().then(() => __importStar(require('../utils/openaiClient')));
                aiResult = await sendToOpenAIForATS(cvText, jobDescription);
            }
        }
        catch (aiErr) {
            console.error('AI ATS analysis failed, returning rule results only:', aiErr);
            aiResult = null;
        }
        res.json({
            ruleBased: ruleResult,
            aiAnalysis: aiResult,
        });
    }
    catch (error) {
        console.error('Error in ATS check:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
exports.checkATS = checkATS;
