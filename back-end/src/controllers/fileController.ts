import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { sendToOpenAI } from '../utils/openaiClient';
import multer from 'multer';
// import ConvertAPI from 'convertapi';
// @ts-ignore
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { fromPath as pdf2picFromPath } from 'pdf2pic';
import Tesseract from 'tesseract.js';
// @ts-ignore
import getPdfUrls from 'get-pdf-urls';
import { PDFDocument, PDFDict, PDFName, PDFString, PDFHexString } from 'pdf-lib';
var pdfUtil = require('pdf-to-text')
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

// Helper function to extract annotation URLs using pdf-lib
async function extractPdfLibLinks(filePath: string): Promise<string[]> {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(fileBuffer);
    const links: string[] = [];
    for (let i = 0; i < pdfDoc.getPageCount(); i++) {
      const page = pdfDoc.getPage(i);
      // @ts-ignore
      const annots = page.node.Annots && page.node.Annots();
      if (annots && typeof annots.asArray === 'function') {
        for (const annotRef of annots.asArray()) {
          // @ts-ignore
          const annot = pdfDoc.context.lookup(annotRef);
          if (!(annot instanceof PDFDict)) continue;
          const subtype = annot.get(PDFName.of('Subtype'));
          if (subtype === PDFName.of('Link')) {
            const action = annot.get(PDFName.of('A'));
            if (action instanceof PDFDict) {
              const uri = action.get(PDFName.of('URI'));
              if (uri instanceof PDFString || uri instanceof PDFHexString) {
                links.push(uri.decodeText());
              }
            }
          }
        }
      }
    }
    return links;
  } catch (err) {
    console.error('Error extracting links with pdf-lib:', err);
    return [];
  }
}

// Update extractContentAndLinks to work with file paths instead of buffers
async function extractContentAndLinks(filePath: string, extension: string): Promise<{ content: string[], links: string[] }> {
  try {
    let extractedLinks: string[] = [];
    let extractedText: string[] = [];
    
    if (extension === '.pdf') {
      // Read file buffer for pdf-parse
      const fileBuffer = fs.readFileSync(filePath);
      // Use pdf-parse to extract text
      const data = await pdf(fileBuffer);
      extractedText = [data.text];
      // Extract URLs from the text using regex
      const urlRegex = /https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/gi;
      let textLinks: string[] = [];
      try {
        textLinks = data.text && typeof data.text === 'string' ? (data.text.match(urlRegex) || []) : [];
      } catch (regexError) {
        console.warn('Text regex matching error:', regexError);
        textLinks = [];
      }
      // Use get-pdf-urls to extract all (including hidden/annotation) links
      let annotationLinks: string[] = [];
      try {
        annotationLinks = await new Promise((resolve, reject) => {
          try {
            pdfUtil.pdfToText(filePath, (err: any, data: string | null) => {
              if (err) {
                console.warn('pdf-to-text error:', err);
                resolve([]);
              } else {
                // Extract URLs from the extracted text
                if(data){
                  const urlRegex = /https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/gi;
                  const urls = data && typeof data === 'string' ? (data.match(urlRegex) || []) : [];
                  resolve(urls);
                }else{
                  resolve([]);
                }
              }
            });
          } catch (getPdfUrlsError) {
            console.warn('get-pdf-urls execution error:', getPdfUrlsError);
            resolve([]);
          }
        });
        await new Promise(waiting => setTimeout(waiting, 100));
      } catch (annotationError) {
        console.warn('Annotation links extraction failed:', annotationError);
        annotationLinks = [];
      }
      // Use pdf-lib to extract annotation/hidden links from the file
      let pdfLibLinks: string[] = await extractPdfLibLinks(filePath);
      // Merge and deduplicate links
      extractedLinks = Array.from(new Set([
        ...textLinks,
        ...annotationLinks,
        ...pdfLibLinks
      ]));
      // OCR fallback if all extracted text is empty or whitespace
      if (extractedText.join('').trim() === '') {
        extractedText = [];
        const density = 200;
        let pdfDoc;
        try {
          pdfDoc = await PDFDocument.load(fileBuffer);
        } catch (pdfLibError) {
          console.warn('PDFDocument.load error:', pdfLibError);
          return { content: extractedText, links: extractedLinks };
        }
        const numPages = pdfDoc.getPageCount();
        let allImageFiles: string[] = [];

        for (let pageNum = 0; pageNum < numPages; pageNum++) {
          const page = pdfDoc.getPage(pageNum);
          const { width, height } = page.getSize(); // in points
          const pixelWidth = Math.round(width * (density / 72));
          const pixelHeight = Math.round(height * (density / 72));

          const pdf2pic = pdf2picFromPath(filePath, {
            density,
            format: 'jpeg',
            width: pixelWidth,
            height: pixelHeight,
            saveFilename: path.basename(filePath, path.extname(filePath)) + `_${pageNum + 1}`,
            savePath: path.dirname(filePath),
          });

          const output = await pdf2pic(pageNum + 1); // pdf2pic is 1-based
          if (output && output.path) {
            allImageFiles.push(output.path);
          }
        }
        const ocrResults = await Promise.all(
          allImageFiles.map(imgPath =>
            Tesseract.recognize(imgPath, 'eng').then(({ data: { text } }) => text)
          )
        );
        extractedText.push(...ocrResults);
        // Extract URLs from OCR text
        let ocrLinks: string[] = [];
        try {
          const ocrText = ocrResults.join('\n');
          ocrLinks = ocrText && typeof ocrText === 'string' ? (ocrText.match(urlRegex) || []) : [];
        } catch (ocrRegexError) {
          console.warn('OCR regex matching error:', ocrRegexError);
          ocrLinks = [];
        }
        extractedLinks = Array.from(new Set([
          ...extractedLinks,
          ...ocrLinks
        ]));
        for (const imgPath of allImageFiles) {
          try { fs.unlinkSync(imgPath); } catch {}
        }
      }
    } else if (extension === '.docx' || extension === '.doc') {
      const fileBuffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      extractedText = [result.value];
      const urlRegex = /https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/gi;
      try {
        extractedLinks = result.value && typeof result.value === 'string' ? (result.value.match(urlRegex) || []) : [];
      } catch (docxRegexError) {
        console.warn('DOCX regex matching error:', docxRegexError);
        extractedLinks = [];
      }
    } else if (extension === '.txt') {
      const text = fs.readFileSync(filePath, 'utf-8');
      extractedText = [text];
      const urlRegex = /https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/gi;
      try {
        extractedLinks = text && typeof text === 'string' ? (text.match(urlRegex) || []) : [];
      } catch (txtRegexError) {
        console.warn('TXT regex matching error:', txtRegexError);
        extractedLinks = [];
      }
    } else {
      const text = fs.readFileSync(filePath, 'utf-8');
      extractedText = [text];
      const urlRegex = /https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/gi;
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
    
    if(extractedData.content.join("").trim() == ''){
      return res.status(500).json({ message: 'Unable to process this file. Please check the file type and content.'});
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