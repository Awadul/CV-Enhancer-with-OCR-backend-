"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseText = exports.uploadFile = void 0;
exports.extractContentAndLinks = extractContentAndLinks;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const openaiClient_1 = require("../utils/openaiClient");
const multer_1 = __importDefault(require("multer"));
// import ConvertAPI from 'convertapi';
// @ts-ignore
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const mammoth_1 = __importDefault(require("mammoth"));
const pdf2pic_1 = require("pdf2pic");
const tesseract_js_1 = __importDefault(require("tesseract.js"));
const pdf_lib_1 = require("pdf-lib");
// Create uploads directory if it doesn't exist
const uploadsDir = path_1.default.join(__dirname, '../../uploads');
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path_1.default.extname(file.originalname));
    }
});
const upload = (0, multer_1.default)({ storage });
exports.default = upload;
const URL_REGEX = /https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/gi;
const ENABLE_OCR = process.env.ENABLE_OCR === 'true';
const runPdfToText = (filePath) => new Promise((resolve, reject) => {
    (0, child_process_1.execFile)('pdftotext', ['-layout', '-enc', 'UTF-8', filePath, '-'], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (err) {
            reject(err);
            return;
        }
        resolve(stdout || '');
    });
});
async function extractPdfContent(filePath) {
    const buffer = fs_1.default.readFileSync(filePath);
    const textParts = [];
    const links = [];
    try {
        const parsed = await (0, pdf_parse_1.default)(buffer);
        if (parsed.text) {
            textParts.push(parsed.text);
        }
        const visibleLinks = parsed.text?.match(URL_REGEX) || [];
        links.push(...visibleLinks);
    }
    catch (err) {
        console.warn('pdf-parse failed:', err);
    }
    if (textParts.join('').trim() === '') {
        try {
            const text = await runPdfToText(filePath);
            if (text.trim() !== '') {
                textParts.push(text);
                const visibleLinks = text.match(URL_REGEX) || [];
                links.push(...visibleLinks);
            }
        }
        catch (err) {
            console.warn('pdftotext fallback failed:', err);
        }
    }
    try {
        const doc = await pdf_lib_1.PDFDocument.load(buffer);
        const pages = doc.getPages();
        for (const page of pages) {
            // @ts-ignore
            const annots = page.node.Annots && page.node.Annots();
            if (!annots || typeof annots.asArray !== 'function')
                continue;
            for (const ref of annots.asArray()) {
                // @ts-ignore
                const annot = doc.context.lookup(ref);
                if (!(annot instanceof pdf_lib_1.PDFDict))
                    continue;
                const action = annot.get(pdf_lib_1.PDFName.of('A'));
                if (!(action instanceof pdf_lib_1.PDFDict))
                    continue;
                const uri = action.get(pdf_lib_1.PDFName.of('URI'));
                if (uri instanceof pdf_lib_1.PDFString || uri instanceof pdf_lib_1.PDFHexString) {
                    links.push(uri.decodeText());
                }
            }
        }
    }
    catch (err) {
        console.warn('pdf-lib annotation failed:', err);
    }
    if (textParts.join('').trim() === '' && ENABLE_OCR) {
        const density = 200;
        const images = [];
        try {
            const pdfDoc = await pdf_lib_1.PDFDocument.load(buffer);
            const pageCount = pdfDoc.getPageCount();
            for (let i = 0; i < pageCount; i++) {
                const converter = (0, pdf2pic_1.fromPath)(filePath, {
                    density,
                    format: 'jpeg',
                    saveFilename: `page_${i}`,
                    savePath: path_1.default.dirname(filePath),
                });
                const output = await converter(i + 1);
                if (output?.path)
                    images.push(output.path);
            }
            const ocrTexts = await Promise.all(images.map((img) => tesseract_js_1.default.recognize(img, 'eng').then((result) => result.data.text)));
            textParts.push(...ocrTexts);
            const ocrLinks = ocrTexts.join('\n').match(URL_REGEX) || [];
            links.push(...ocrLinks);
        }
        catch (err) {
            console.warn('OCR fallback failed, returning non-OCR content:', err);
        }
        finally {
            images.forEach((img) => {
                try {
                    fs_1.default.unlinkSync(img);
                }
                catch { }
            });
        }
    }
    return {
        content: textParts,
        links: Array.from(new Set(links)),
    };
}
// Update extractContentAndLinks to work with file paths instead of buffers
async function extractContentAndLinks(filePath, extension) {
    try {
        let extractedLinks = [];
        let extractedText = [];
        if (extension === '.pdf') {
            const pdfResult = await extractPdfContent(filePath);
            extractedText = pdfResult.content;
            extractedLinks = pdfResult.links;
        }
        else if (extension === '.docx' || extension === '.doc') {
            const fileBuffer = fs_1.default.readFileSync(filePath);
            const result = await mammoth_1.default.extractRawText({ buffer: fileBuffer });
            extractedText = [result.value];
            const urlRegex = URL_REGEX;
            try {
                extractedLinks = result.value && typeof result.value === 'string' ? (result.value.match(urlRegex) || []) : [];
            }
            catch (docxRegexError) {
                console.warn('DOCX regex matching error:', docxRegexError);
                extractedLinks = [];
            }
        }
        else if (extension === '.txt') {
            const text = fs_1.default.readFileSync(filePath, 'utf-8');
            extractedText = [text];
            const urlRegex = URL_REGEX;
            try {
                extractedLinks = text && typeof text === 'string' ? (text.match(urlRegex) || []) : [];
            }
            catch (txtRegexError) {
                console.warn('TXT regex matching error:', txtRegexError);
                extractedLinks = [];
            }
        }
        else {
            const text = fs_1.default.readFileSync(filePath, 'utf-8');
            extractedText = [text];
            const urlRegex = URL_REGEX;
            try {
                extractedLinks = text && typeof text === 'string' ? (text.match(urlRegex) || []) : [];
            }
            catch (defaultRegexError) {
                console.warn('Default regex matching error:', defaultRegexError);
                extractedLinks = [];
            }
        }
        return {
            content: extractedText,
            links: extractedLinks
        };
    }
    catch (error) {
        console.error('Error extracting content and links:', error);
        return {
            content: [],
            links: []
        };
    }
}
const uploadFile = async (req, res) => {
    if (!req.file)
        return res.status(400).json({ message: 'No file uploaded' });
    let filePath = null;
    try {
        filePath = req.file.path;
        if (!filePath) {
            return res.status(400).json({ message: 'File path not found' });
        }
        // Get file extension from originalname
        const extension = path_1.default.extname(req.file.originalname).toLowerCase();
        // Use extractContentAndLinks to extract content and links
        console.log("Extracting File Content and Links ...");
        const extractedData = await extractContentAndLinks(filePath, extension);
        console.log("Extracting File Content and Links Completed.");
        // Clean up the uploaded file immediately after extraction
        if (filePath && fs_1.default.existsSync(filePath)) {
            try {
                fs_1.default.unlinkSync(filePath);
                console.log("Uploaded file cleaned up successfully");
                filePath = null; // Mark as cleaned up
            }
            catch (unlinkErr) {
                console.error('Error deleting uploaded file:', unlinkErr);
            }
        }
        // If extracted content is null or empty, return error
        if (!extractedData.content || extractedData.content.length === 0) {
            return res.status(500).json({ message: 'Unable to process this file. Please check the file type and content.' });
        }
        const joinedContent = extractedData.content.join("").trim();
        const linkCount = extractedData.links?.length || 0;
        if (joinedContent.length === 0 && linkCount === 0) {
            return res.status(500).json({ message: 'Unable to extract meaningful content from this file. The file may be empty, scanned, or corrupted.' });
        }
        const content = extractedData.content.join('\n');
        const fullContent = "Filename: " + req.file.originalname + '\n\n' + content + '\n\n' + extractedData.links.join('\n');
        console.log("Sending to OpenAI ...");
        const result = await (0, openaiClient_1.sendToOpenAI)(fullContent);
        console.log("OpenAI Processing Completed.");
        res.json(result);
    }
    catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
    finally {
        // Final cleanup - ensure file is deleted even if there was an error
        if (filePath && fs_1.default.existsSync(filePath)) {
            try {
                fs_1.default.unlinkSync(filePath);
                console.log("Final cleanup: Uploaded file removed");
            }
            catch (unlinkErr) {
                console.error('Error in final cleanup deleting uploaded file:', unlinkErr);
            }
        }
    }
};
exports.uploadFile = uploadFile;
const parseText = async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || text.trim() === '') {
            return res.status(400).json({ message: 'No text provided' });
        }
        console.log("Sending raw wizard text to OpenAI ...");
        // Prepend a small directive so the AI knows this is a brain-dump/wizard input
        const fullContent = "The following is raw user input from a CV creation wizard. Please format it into a professional CV Data JSON structure:\n\n" + text;
        const result = await (0, openaiClient_1.sendToOpenAI)(fullContent);
        console.log("OpenAI Processing Completed.");
        res.json(result);
    }
    catch (error) {
        console.error('Error parsing text:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
exports.parseText = parseText;
