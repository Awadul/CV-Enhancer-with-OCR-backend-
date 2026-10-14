import { Worker } from 'worker_threads';
import path from 'path';

export const MAX_CV_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_CV_TEXT_CHARS = 60_000;
export function validateImportFile(name: string, buffer: Buffer) {
  const ext = path.extname(name).toLowerCase();
  if (!['.pdf', '.docx', '.txt'].includes(ext) || !buffer.length || buffer.length > MAX_CV_FILE_BYTES) throw new Error('Use a PDF, DOCX or TXT file up to 4 MB.');
  if (ext === '.pdf' && buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('This file is not a valid PDF.');
  if (ext === '.docx') {
    // Inspect the ZIP directory before decompression to bound expansion and entry count.
    let end = -1;
    for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break; }
    if (end < 0 || buffer.readUInt32LE(0) !== 0x04034b50) throw new Error('This file is not a valid DOCX.');
    const count = buffer.readUInt16LE(end + 10);
    let cursor = buffer.readUInt32LE(end + 16), total = 0, document = false;
    if (count > 2000 || !count) throw new Error('DOCX contains too many entries.');
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid DOCX directory.');
      const size = buffer.readUInt32LE(cursor + 24), length = buffer.readUInt16LE(cursor + 28);
      const nameEnd = cursor + 46 + length;
      if (nameEnd > end || (buffer.readUInt16LE(cursor + 8) & 1)) throw new Error('Encrypted or invalid DOCX is unsupported.');
      total += size;
      if (total > 16 * 1024 * 1024 || size > 8 * 1024 * 1024) throw new Error('DOCX expands beyond the import limit.');
      if (buffer.subarray(cursor + 46, nameEnd).toString() === 'word/document.xml') document = true;
      cursor = nameEnd + buffer.readUInt16LE(cursor + 30) + buffer.readUInt16LE(cursor + 32);
    }
    if (!document) throw new Error('DOCX has no document content.');
  }
  if (ext === '.txt') {
    if (buffer.includes(0)) throw new Error('TXT must contain plain UTF-8 text.');
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  }
  return ext;
}

const workerScript = `
const {parentPort,workerData}=require('worker_threads');
(async()=>{
 const buffer=Buffer.from(workerData.bytes);let text='';
 if(workerData.ext==='.txt') text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);
 else if(workerData.ext==='.pdf') {const {getDocument}=await import(require('url').pathToFileURL(workerData.pdf).href); const doc=await getDocument({data:new Uint8Array(buffer),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,stopAtErrors:true}).promise;try {if(doc.numPages>20) throw new Error('Use a PDF with 20 pages or fewer.');for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i);const content=await page.getTextContent();text+=content.items.map(item=>item.str||'').join(' ')+' ';if(text.length>60000) throw new Error('CV text exceeds 60000 characters.');}}finally{await doc.destroy();}}
 else {
  const {inflateRawSync}=require('zlib');let end=buffer.length-22;
  while(end>=0&&buffer.readUInt32LE(end)!==0x06054b50) end--;
  let cursor=buffer.readUInt32LE(end+16),total=0;
  for(let i=0;i<buffer.readUInt16LE(end+10);i++) {
   const compressed=buffer.readUInt32LE(cursor+20),size=buffer.readUInt32LE(cursor+24),method=buffer.readUInt16LE(cursor+10),offset=buffer.readUInt32LE(cursor+42);
   if(offset+30>buffer.length||buffer.readUInt32LE(offset)!==0x04034b50) throw new Error('Invalid DOCX entry.');
   const start=offset+30+buffer.readUInt16LE(offset+26)+buffer.readUInt16LE(offset+28);
   if(start+compressed>buffer.length) throw new Error('Invalid DOCX entry.');
   const input=buffer.subarray(start,start+compressed);
   const output=method===0?input:method===8?inflateRawSync(input,{maxOutputLength:16*1024*1024-total}):null;
   if(!output||output.length!==size) throw new Error('Invalid DOCX expansion.');
   total+=output.length;if(total>16*1024*1024) throw new Error('DOCX expansion limit exceeded.');
   cursor+=46+buffer.readUInt16LE(cursor+28)+buffer.readUInt16LE(cursor+30)+buffer.readUInt16LE(cursor+32);
  }
  text=(await require(workerData.docx).extractRawText({buffer})).value;
 }
 text=(text||'').trim();
 if(text.length<40) throw new Error('No readable CV text found. Export a text-based PDF or paste your details manually.');
 if(text.length>60000) throw new Error('CV text exceeds 60000 characters. Use a shorter document.');
 parentPort.postMessage({text});
})().catch(error=>parentPort.postMessage({error:error.message}));`;

export function extractImportText(buffer: Buffer, ext: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerScript, { eval: true, workerData: { bytes: buffer, ext, pdf: require.resolve('pdfjs-dist/legacy/build/pdf.mjs'), docx: require.resolve('mammoth') }, resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16 } });
    let settled = false;
    const finish = (error?: Error, text?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); signal?.removeEventListener('abort', abort); void worker.terminate();
      if (error) reject(error); else resolve(text!);
    };
    const abort = () => finish(new Error('Import canceled.'));
    const timer = setTimeout(() => finish(new Error('Document parsing timed out. Try a simpler file.')), 10_000);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    worker.once('message', value => finish(value.error ? new Error(String(value.error)) : undefined, value.text));
    worker.once('error', () => finish(new Error('This document could not be read safely. Try a simpler file.')));
    worker.once('exit', code => { if (!settled) finish(new Error('Document parser stopped. Try a simpler file.')); });
  });
}

export function normalizeImportedCV(value: any): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid CV extraction');
  const text = (v: unknown, max = 2000) => typeof v === 'string' ? v.slice(0, max) : '';
  const list = (v: unknown, max = 30) => Array.isArray(v) ? v.slice(0, max) : [];
  const fields = (v: any, keys: string[]) => Object.fromEntries(keys.map(key => [key, text(v?.[key])]));
  const cv = {
    ...fields(value, ['first_name', 'last_name', 'title']), summary: text(value.summary, 10000),
    contact: fields(value.contact, ['email', 'phone', 'location']),
    experience: list(value.experience).map(v => ({ ...fields(v, ['title','company','location','start_date','end_date']), summary: text(v?.summary), description: list(v?.description,20).filter(x => typeof x === 'string').map(x => text(x)) })),
    projects: list(value.projects).map(v => ({ ...fields(v, ['project_name','description','summary','start_date','end_date']), technologies: list(v?.technologies,30).filter(x => typeof x === 'string').map(x => text(x,100)) })),
    education: list(value.education).map(v => fields(v, ['degree','field','institution','location','start_date','end_date'])),
    skills: list(value.skills,12).map(v => ({ category: text(v?.category,100), skills: list(v?.skills,40).filter(x => typeof x === 'string').map(x => text(x,100)) })),
    certifications: list(value.certifications).map(v => fields(v, ['name','issuer','date'])),
    languages_spoken: list(value.languages_spoken).map(v => typeof v === 'string' ? text(v,100) : text(v?.language,100)),
  };
  if (JSON.stringify(cv).length > MAX_CV_TEXT_CHARS || (!cv.summary && !cv.experience.length && !cv.projects.length)) throw new Error('Extraction is incomplete or too large.');
  return cv;
}
