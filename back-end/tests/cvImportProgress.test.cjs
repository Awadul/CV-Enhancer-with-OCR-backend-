const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const express=require('express');
const {createImportTailorController}=require(path.join(process.env.IMPORT_BUILD||path.join(__dirname,'../dist'),'controllers/cvImportTailorController.js'));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function fixture(extract,generate){
 const app=express();let file;
 app.post('/import',(req,res,next)=>{file={buffer:Buffer.from('Synthetic CV only')};req.file=file;req.body={jobTitle:'Developer',jobDescription:'React'};res.locals.importExtension='.txt';res.locals.tailoringAllowance={allowed:true,remaining:3};next();},createImportTailorController(extract,generate));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 return {url:`http://127.0.0.1:${server.address().port}/import`,close:()=>new Promise(resolve=>server.close(resolve)),getBuffer:()=>file.buffer};
}
test('stream emits real checkpoints before delayed work finishes and only then sends the result',async()=>{
 const extraction=deferred(),generation=deferred();const f=await fixture(()=>extraction.promise,()=>generation.promise);
 try{
  const response=await fetch(f.url,{method:'POST',headers:{Accept:'application/x-ndjson'}});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/ndjson/);
  const reader=response.body.getReader();const decode=new TextDecoder();let text=decode.decode((await reader.read()).value);assert.match(text,/"percent":25/);assert.doesNotMatch(text,/"result"/);
  extraction.resolve('React developer');text+=decode.decode((await reader.read()).value);assert.match(text,/"percent":50/);assert.doesNotMatch(text,/"result"/);
  generation.resolve({cvData:{summary:'React developer'},summary:'Original facts, clearer wording',suggestions:[]});
  for(;;){const chunk=await reader.read();if(chunk.done)break;text+=decode.decode(chunk.value);}
  const events=text.trim().split('\n').map(JSON.parse);assert.deepEqual(events.filter(e=>e.type==='progress').map(e=>e.percent),[25,50,75]);assert.equal(events.at(-1).type,'result');assert.equal(events.at(-1).body.cvData.summary,'React developer');assert.equal(events.at(-1).body.allowance.remaining,3);assert.equal(f.getBuffer().length,0);
 }finally{await f.close();}
});
test('streamed failure never emits completion or raw provider errors',async()=>{
 const f=await fixture(async()=>{throw new Error('secret provider detail');},async()=>assert.fail());
 try{const response=await fetch(f.url,{method:'POST',headers:{Accept:'application/x-ndjson'}});const text=await response.text();const events=text.trim().split('\n').map(JSON.parse);assert.equal(events.at(-1).type,'error');assert.match(events.at(-1).body.message,/unchanged/);assert.doesNotMatch(text,/secret provider detail/);assert.ok(!events.some(e=>e.type==='result'||e.percent===100));}finally{await f.close();}
});
test('legacy callers keep the JSON response contract',async()=>{
 const f=await fixture(async()=>'React developer',async()=>({cvData:{summary:'React developer'},summary:'React developer',suggestions:[]}));
 try{const response=await fetch(f.url,{method:'POST'});assert.match(response.headers.get('content-type'),/application\/json/);assert.equal((await response.json()).cvData.summary,'React developer');}finally{await f.close();}
});
