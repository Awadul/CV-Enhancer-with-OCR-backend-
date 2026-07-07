import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { sendToOpenAI } from '../utils/openaiClient';
import multer from 'multer';
// import ConvertAPI from 'convertapi';
// @ts-ignore
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { fromPath as pdf2picFromPath } from 'pdf2pic';
import Tesseract from 'tesseract.js';
import { PDFDocument, PDFDict, PDFName, PDFString, PDFHexString } from 'pdf-lib';
// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

export default upload;

const URL_REGEX = /https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/gi;
const ENABLE_OCR = process.env.ENABLE_OCR === 'true';

const runPdfToText = (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(
      'pdftotext',
      ['-layout', '-enc', 'UTF-8', filePath, '-'],
      { maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(stdout || '');
      }
    );
  });

async function extractPdfContent(filePath: string): Promise<{ content: string[]; links: string[] }> {
  const buffer = fs.readFileSync(filePath);
  const textParts: string[] = [];
  const links: string[] = [];

  try {
    const parsed = await pdf(buffer);
    if (parsed.text) {
      textParts.push(parsed.text);
    }
    const visibleLinks = parsed.text?.match(URL_REGEX) || [];
    links.push(...visibleLinks);
  } catch (err) {
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
    } catch (err) {
      console.warn('pdftotext fallback failed:', err);
    }
  }

  try {
    const doc = await PDFDocument.load(buffer);
    const pages = doc.getPages();

    for (const page of pages) {
      // @ts-ignore
      const annots = page.node.Annots && page.node.Annots();
      if (!annots || typeof annots.asArray !== 'function') continue;

      for (const ref of annots.asArray()) {
        // @ts-ignore
        const annot = doc.context.lookup(ref);
        if (!(annot instanceof PDFDict)) continue;
        const action = annot.get(PDFName.of('A'));
        if (!(action instanceof PDFDict)) continue;
        const uri = action.get(PDFName.of('URI'));
        if (uri instanceof PDFString || uri instanceof PDFHexString) {
          links.push(uri.decodeText());
        }
      }
    }
  } catch (err) {
    console.warn('pdf-lib annotation failed:', err);
  }

  if (textParts.join('').trim() === '' && ENABLE_OCR) {
    const density = 200;
    const images: string[] = [];

    try {
      const pdfDoc = await PDFDocument.load(buffer);
      const pageCount = pdfDoc.getPageCount();

      for (let i = 0; i < pageCount; i++) {
        const converter = pdf2picFromPath(filePath, {
          density,
          format: 'jpeg',
          saveFilename: `page_${i}`,
          savePath: path.dirname(filePath),
        });

        const output = await converter(i + 1);
        if (output?.path) images.push(output.path);
      }

      const ocrTexts = await Promise.all(
        images.map((img) =>
          Tesseract.recognize(img, 'eng').then((result) => result.data.text)
        )
      );

      textParts.push(...ocrTexts);

      const ocrLinks = ocrTexts.join('\n').match(URL_REGEX) || [];
      links.push(...ocrLinks);
    } catch (err) {
      console.warn('OCR fallback failed, returning non-OCR content:', err);
    } finally {
      images.forEach((img) => {
        try { fs.unlinkSync(img); } catch {}
      });
    }
  }

  return {
    content: textParts,
    links: Array.from(new Set(links)),
  };
}

// Update extractContentAndLinks to work with file paths instead of buffers
export async function extractContentAndLinks(filePath: string, extension: string): Promise<{ content: string[], links: string[] }> {
  try {
    let extractedLinks: string[] = [];
    let extractedText: string[] = [];
    
    if (extension === '.pdf') {
      const pdfResult = await extractPdfContent(filePath);
      extractedText = pdfResult.content;
      extractedLinks = pdfResult.links;
    } else if (extension === '.docx' || extension === '.doc') {
      const fileBuffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      extractedText = [result.value];
      const urlRegex = URL_REGEX;
      try {
        extractedLinks = result.value && typeof result.value === 'string' ? (result.value.match(urlRegex) || []) : [];
      } catch (docxRegexError) {
        console.warn('DOCX regex matching error:', docxRegexError);
        extractedLinks = [];
      }
    } else if (extension === '.txt') {
      const text = fs.readFileSync(filePath, 'utf-8');
      extractedText = [text];
      const urlRegex = URL_REGEX;
      try {
        extractedLinks = text && typeof text === 'string' ? (text.match(urlRegex) || []) : [];
      } catch (txtRegexError) {
        console.warn('TXT regex matching error:', txtRegexError);
        extractedLinks = [];
      }
    } else {
      const text = fs.readFileSync(filePath, 'utf-8');
      extractedText = [text];
      const urlRegex = URL_REGEX;
      try {
        extractedLinks = text && typeof text === 'string' ? (text.match(urlRegex) || []) : [];
      } catch (defaultRegexError) {
        console.warn('Default regex matching error:', defaultRegexError);
        extractedLinks = [];
      }
    }
    return {
      content: extractedText,
      links: extractedLinks
    };
  } catch (error) {
    console.error('Error extracting content and links:', error);
    return {
      content: [],
      links: []
    };
  }
}

export const uploadFile = async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  
  let filePath: string | null = null;
  
  try {
    filePath = req.file.path;
    if (!filePath) {
      return res.status(400).json({ message: 'File path not found' });
    }

    // Get file extension from originalname
    const extension = path.extname(req.file.originalname).toLowerCase();
    
    // Use extractContentAndLinks to extract content and links
    console.log("Extracting File Content and Links ...")
    const extractedData = await extractContentAndLinks(filePath, extension);
    console.log("Extracting File Content and Links Completed.")

    // Clean up the uploaded file immediately after extraction
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log("Uploaded file cleaned up successfully");
        filePath = null; // Mark as cleaned up
      } catch (unlinkErr) {
        console.error('Error deleting uploaded file:', unlinkErr);
      }
    }
    
    // If extracted content is null or empty, return error
    if (!extractedData.content || extractedData.content.length === 0) {
      return res.status(500).json({ message: 'Unable to process this file. Please check the file type and content.'});
    }

    const joinedContent = extractedData.content.join("").trim();
    const linkCount = extractedData.links?.length || 0;

    if (joinedContent.length === 0 && linkCount === 0) {
      return res.status(500).json({ message: 'Unable to extract meaningful content from this file. The file may be empty, scanned, or corrupted.'});
    }
    
    const content = extractedData.content.join('\n');
    const fullContent = "Filename: "+ req.file.originalname +'\n\n' + content + '\n\n' + extractedData.links.join('\n')
    console.log("Sending to OpenAI ...")
    const result = await sendToOpenAI(fullContent);
    console.log("OpenAI Processing Completed.")
    res.json(result);
    
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  } finally {
    // Final cleanup - ensure file is deleted even if there was an error
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log("Final cleanup: Uploaded file removed");
      } catch (unlinkErr) {
        console.error('Error in final cleanup deleting uploaded file:', unlinkErr);
      }
    }
  }
};

export const parseText = async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    
    if (!text || text.trim() === '') {
      return res.status(400).json({ message: 'No text provided' });
    }

    console.log("Sending raw wizard text to OpenAI ...")
    // Prepend a small directive so the AI knows this is a brain-dump/wizard input
    const fullContent = "The following is raw user input from a CV creation wizard. Please format it into a professional CV Data JSON structure:\n\n" + text;
    
    const result = await sendToOpenAI(fullContent);
    console.log("OpenAI Processing Completed.")
    
    res.json(result);
  } catch (error) {
    console.error('Error parsing text:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};