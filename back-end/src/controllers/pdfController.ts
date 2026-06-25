import { Request, Response } from 'express';
import puppeteer from 'puppeteer';

export const generatePDFController = async (req: Request, res: Response) => {
  try {
    const { html } = req.body;
    if (!html) {
      return res.status(400).json({ message: 'HTML content is required' });
    }

    // Launch headless browser
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set A4 viewport at 96 DPI
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });

    // Set page content and wait for it to load
    await page.setContent(html, { waitUntil: 'load' });

    // Wait for all web fonts to be fully loaded before generating PDF
    await page.evaluate(async () => {
      await document.fonts.ready;

      const container = document.getElementById('cv-preview-container');
      if (!container) return;

      const pageHeightPx = 297 * 3.779527559;
      const breakables = container.querySelectorAll('.cv-page-breakable');
      
      // Reset all margins first to measure natural layout
      breakables.forEach(el => {
        const htmlEl = el as HTMLElement;
        htmlEl.style.marginTop = '';
        const parent = htmlEl.parentElement;
        const grandparent = parent?.parentElement as HTMLElement | null;
        if (parent && grandparent && htmlEl === parent.firstElementChild) {
          grandparent.style.marginTop = '';
        }
      });

      // Measure and apply sequentially
      breakables.forEach(el => {
        const htmlEl = el as HTMLElement;
        const parent = htmlEl.parentElement;
        const grandparent = parent?.parentElement as HTMLElement | null;
        
        const isFirst = !!(parent && grandparent && htmlEl === parent.firstElementChild);
        const targetEl = (isFirst ? grandparent : htmlEl) as HTMLElement;

        const containerRect = container.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const elRect = htmlEl.getBoundingClientRect();
        
        // Calculate absolute coordinates relative to the container
        const startY = targetRect.top - containerRect.top;
        const endY = elRect.bottom - containerRect.top;
        const blockHeight = endY - startY;

        const startPage = Math.floor(startY / pageHeightPx);
        
        // Define safe margins (approx height of 1 h2 tag + spacing)
        const MARGIN_BOTTOM = 40; 
        const MARGIN_TOP = 40;

        // The safe bottom limit for the page this item starts on
        const pageBottomThreshold = (startPage + 1) * pageHeightPx - MARGIN_BOTTOM;

        // If it ends below the safe threshold, and it's small enough to fit on a single page
        if (endY > pageBottomThreshold && blockHeight < (pageHeightPx - MARGIN_TOP - MARGIN_BOTTOM)) {
          // Push it so it starts exactly below the top margin of the next page
          const targetY = (startPage + 1) * pageHeightPx + MARGIN_TOP;
          const pushAmount = targetY - startY; 
          targetEl.style.marginTop = `${pushAmount}px`;
        }
      });
    });

    // Generate PDF buffer
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0px',
        bottom: '0px',
        left: '0px',
        right: '0px'
      }
    });

    await browser.close();

    // Convert Uint8Array to Node Buffer so Express sends it as raw binary rather than JSON
    const binaryBuffer = Buffer.from(pdfBuffer);

    // Send binary response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=cv.pdf');
    res.send(binaryBuffer);
  } catch (error: any) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ message: 'Failed to generate PDF', error: error.message });
  }
};
