const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=process.env.IMPORT_BUILD || path.join(__dirname,'../dist');
const {validateImportFile,extractImportText,normalizeImportedCV}=require(path.resolve(root,'utils/cvImport.js'));
const {cvImportSlots,receiveCVImport}=require(path.resolve(root,'middleware/cvImportUpload.js'));
const {createTailoringAccess}=require(path.resolve(root,'middleware/tailoringAccess.js'));
const {createImportTailorController}=require(path.resolve(root,'controllers/cvImportTailorController.js'));
const express=require('express');
const sample='Alex Example\nReact developer building Node.js APIs and accessible interfaces for web applications.';
test('file signatures, supported types, UTF-8 and size are validated',()=>{
 assert.equal(validateImportFile('cv.txt',Buffer.from(sample)),'.txt');
 for(const [name,bytes] of [['cv.pdf',Buffer.from(sample)],['cv.doc',Buffer.from(sample)],['cv.txt',Buffer.alloc(0)],['cv.txt',Buffer.alloc(4*1024*1024+1)],['cv.txt',Buffer.from([0xff])]]) assert.throws(()=>validateImportFile(name,bytes));
});
test('DOCX oversized expansion is rejected before decompression',()=>{
 const b=Buffer.alloc(120);b.writeUInt32LE(0x04034b50,0);b.writeUInt32LE(0x02014b50,32);b.writeUInt32LE(100*1024*1024,56);b.writeUInt32LE(0x06054b50,98);b.writeUInt16LE(1,108);b.writeUInt32LE(32,114);
 assert.throws(()=>validateImportFile('cv.docx',b),/expands/);
});
test('worker extracts plain text, rejects unreadable text and supports cancellation',async()=>{
 assert.equal(await extractImportText(Buffer.from(sample),'.txt'),sample);
 await assert.rejects(extractImportText(Buffer.from('short'),'.txt'),/readable/);
 const abort=new AbortController();abort.abort();await assert.rejects(extractImportText(Buffer.from(sample),'.txt',abort.signal),/canceled/);
});
test('AI extraction is normalized into safe editor data without arbitrary fields',()=>{
 const cv=normalizeImportedCV({summary:'React developer',experience:[{description:['Built React UI',null,123]}],skills:[{category:'Frontend',skills:['React',null]}],contact:{email:'alex@example.com',links:{website:'javascript:alert(1)'}},arbitrary:'drop'});
 assert.equal(cv.arbitrary,undefined);assert.equal(cv.contact.links,undefined);assert.deepEqual(cv.experience[0].description,['Built React UI']);assert.deepEqual(cv.skills[0].skills,['React']);assert.throws(()=>normalizeImportedCV({}));
});

let server;
after(()=>new Promise(resolve=>server ? server.close(resolve) : resolve()));
test('multipart import shares the four-credit counter and fifth request never reaches parsing or AI',async()=>{
 let used=0,parsed=0,generated=0;
 const access=createTailoringAccess(()=>({auth:{getUser:async()=>({data:{user:null},error:{}})},rpc:async(_name,args)=>{
  const allowed=used<4;if(args.p_reserve&&allowed)used++;
  return {error:null,data:{allowed,remaining:Math.max(0,4-used),limit:4,reset_at:'2099-01-01T00:00:00Z',guest:true,reason:allowed?undefined:'quota'}};
 }}),()=> 'test-secret');
 const app=express();
 const controller=createImportTailorController(async(buffer,ext,signal)=>{parsed++;return extractImportText(buffer,ext,signal);},async()=>{generated++;return {cvData:{summary:'React developer',skills:[]},summary:'React developer building interfaces.',suggestions:[]}});
 app.post('/import',access.preflight,cvImportSlots,receiveCVImport,access.reserve,controller);
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const url=`http://127.0.0.1:${server.address().port}/import`;
 const upload=async(name='cv.txt',text=sample)=>{const form=new FormData();form.append('file',new Blob([text]),name);form.append('jobTitle','Developer');form.append('jobDescription','Build React interfaces.');return fetch(url,{method:'POST',body:form});};
 const invalid=await upload('cv.pdf');assert.equal(invalid.status,400);assert.equal(used,0);
 for(let i=0;i<4;i++){const response=await upload();assert.equal(response.status,200);const body=await response.json();assert.equal(body.allowance.remaining,3-i);assert.equal(body.cvData.summary,'React developer');}
 const blocked=await upload();assert.equal(blocked.status,429);assert.equal(parsed,4);assert.equal(generated,4);assert.equal((await blocked.json()).code,'AUTH_REQUIRED');
});

test('modern PDF parser extracts text and rejects documents over twenty pages',async()=>{
 const {PDFDocument,StandardFonts}=require('pdf-lib');
 const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);doc.addPage().drawText(sample.replace(/\n/g,' '),{font,size:10});
 assert.match(await extractImportText(Buffer.from(await doc.save()),'.pdf'),/React developer/);
 for(let i=1;i<21;i++)doc.addPage();
 await assert.rejects(extractImportText(Buffer.from(await doc.save()),'.pdf'),/20 pages/);
});
