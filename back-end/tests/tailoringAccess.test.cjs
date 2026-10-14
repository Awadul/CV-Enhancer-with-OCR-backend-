const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTailoringAccess,validateTailoringInput}=require(process.env.TAILORING_BUILD || '../dist/middleware/tailoringAccess.js');
const response=()=>({locals:{},code:200,status(c){this.code=c;return this},json(b){this.body=b;return this},setHeader(){}});
const valid={allowed:true,remaining:3,limit:4,reset_at:'2026-10-15T00:00:00Z',guest:true};
function fixture({quota=valid,rpcError=null,authError=null}={}) {
 const calls=[];
 const access=createTailoringAccess(()=>({auth:{getUser:async()=>({data:{user:authError?null:{id:'verified'}},error:authError})},rpc:async(name,args)=>{calls.push(args);return {data:quota,error:rpcError}}}),()=> 'stable-secret-for-test');
 return {...access,calls};
}
test('guest identity uses trusted IP, ignores forged body and forwarding claims',async()=>{
 const f=fixture(),res=response();let next=false;
 await f.reserve({headers:{'x-forwarded-for':'9.9.9.9'},ip:'127.0.0.1',socket:{},body:{userId:'forged',limit:999}},res,()=>next=true);
 assert.equal(next,true);assert.equal(f.calls[0].p_user_id,null);assert.match(f.calls[0].p_guest_key,/^[a-f0-9]{64}$/);assert.equal(f.calls[0].p_reserve,true);
 const second=fixture();await second.reserve({headers:{},ip:'127.0.0.1',socket:{}},response(),()=>{});assert.equal(f.calls[0].p_guest_key,second.calls[0].p_guest_key);
});
test('quota exhaustion blocks generation and asks guest to sign in',async()=>{
 const f=fixture({quota:{...valid,allowed:false,remaining:0,reason:'quota'}}),res=response();
 await f.reserve({headers:{},ip:'127.0.0.1',socket:{}},res,()=>assert.fail());assert.equal(res.code,429);assert.equal(res.body.code,'AUTH_REQUIRED');
});
test('invalid session is never downgraded to anonymous access',async()=>{
 const f=fixture({authError:{message:'expired'}}),res=response();await f.reserve({headers:{authorization:'Bearer bad'},socket:{}},res,()=>assert.fail());assert.equal(res.code,401);assert.equal(f.calls.length,0);
});
test('verified identity is server-derived',async()=>{
 const f=fixture();await f.reserve({headers:{authorization:'Bearer valid'},socket:{},body:{userId:'forged'}},response(),()=>{});assert.equal(f.calls[0].p_user_id,'verified');assert.equal(f.calls[0].p_guest_key,null);
});
test('missing migration and malformed RPC responses fail closed',async()=>{
 for(const options of [{rpcError:{}},{quota:null},{quota:{allowed:true}}]) {const f=fixture(options),res=response();await f.reserve({headers:{},ip:'127.0.0.1',socket:{}},res,()=>assert.fail());assert.equal(res.code,503);}
});
test('allowance reads do not reserve an AI request',async()=>{
 const f=fixture();await f.allowance({headers:{},ip:'127.0.0.1',socket:{}},response(),()=>assert.fail());assert.equal(f.calls[0].p_reserve,false);
});
test('malformed or oversized input is rejected before quota middleware',()=>{
 for(const body of [{},{cvData:[],jobTitle:'Dev',jobDescription:'React'},{cvData:{summary:'x'.repeat(60001)},jobTitle:'Dev',jobDescription:'React'},{cvData:{summary:'Developer'},jobTitle:'x'.repeat(201),jobDescription:'React'}]) {const res=response();validateTailoringInput({body},res,()=>assert.fail());assert.equal(res.code,400);}
 const req={body:{cvData:{summary:'Developer'},jobTitle:' Dev ',jobDescription:' React ',userId:'forged'}};let next=false;validateTailoringInput(req,response(),()=>next=true);assert.equal(next,true);assert.equal(req.body.userId,undefined);assert.equal(req.body.jobTitle,'Dev');
});
