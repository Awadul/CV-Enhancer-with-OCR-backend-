"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeAttention = void 0;
const crypto_1 = __importDefault(require("crypto"));
const openaiClient_1 = require("../utils/openaiClient");
const attentionCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL
const analyzeAttention = async (req, res) => {
    try {
        const { layoutSummary, cvData } = req.body;
        if (!layoutSummary) {
            return res.status(400).json({ message: 'layoutSummary is required.' });
        }
        const payloadString = JSON.stringify({ layoutSummary, cvData: cvData || {} });
        const cacheKey = crypto_1.default.createHash('sha256').update(payloadString).digest('hex');
        const cached = attentionCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return res.json(cached.data);
        }
        const result = await (0, openaiClient_1.sendToOpenAIForAttention)(typeof layoutSummary === 'string' ? JSON.parse(layoutSummary) : layoutSummary, typeof cvData === 'string' ? JSON.parse(cvData) : cvData || {});
        attentionCache.set(cacheKey, {
            data: result,
            expiresAt: Date.now() + CACHE_TTL_MS,
        });
        res.json(result);
    }
    catch (error) {
        console.error('Error generating attention analysis:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
exports.analyzeAttention = analyzeAttention;
