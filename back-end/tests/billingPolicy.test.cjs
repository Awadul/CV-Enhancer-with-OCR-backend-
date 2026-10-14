const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {billingUser,checkoutPolicy,billingOrigin}=require(process.env.BILLING_POLICY_BUILD || '../dist/utils/billingPolicy.js');
const env={NODE_ENV:'production',STRIPE_ALLOWED_PRICE_IDS:'price_pro,price_premium',FRONTEND_ORIGIN:'https://www.mynext9to5.com'};
const body={priceId:'price_pro',successUrl:'https://www.mynext9to5.com/app/dashboard?checkout=success',cancelUrl:'https://mynext9to5.com/pricing'};

test('billing identity is verified and forged body user IDs are rejected',()=>{
  assert.throws(()=>billingUser({body:{userId:'victim'}}),error=>error.status===401);
  assert.throws(()=>billingUser({userId:'owner',body:{userId:'victim'}}),error=>error.status===403);
  assert.equal(billingUser({userId:'owner',body:{}}),'owner');
});
test('only server-configured prices are accepted',()=>{
  assert.equal(checkoutPolicy(body,env).priceId,'price_pro');
  assert.throws(()=>checkoutPolicy({...body,priceId:'price_other'},env),error=>error.status===400);
  assert.throws(()=>checkoutPolicy(body,{NODE_ENV:'production'}),error=>error.status===503);
});
test('redirect injection, credentials and production localhost destinations are rejected',()=>{
  for(const successUrl of ['https://www.mynext9to5.com.evil.test/x','https://evil.test','https://user:pass@www.mynext9to5.com/x','http://localhost:3001/x','javascript:alert(1)']) {
    assert.throws(()=>checkoutPolicy({...body,successUrl},env),error=>error.status===400);
  }
});
test('portal destination is server-owned and configured origins must be valid',()=>{
  assert.equal(billingOrigin(env),'https://www.mynext9to5.com');
  for(const FRONTEND_ORIGIN of ['http://www.mynext9to5.com','https://www.mynext9to5.com/path','https://user:pass@www.mynext9to5.com'])assert.throws(()=>billingOrigin({...env,FRONTEND_ORIGIN}),error=>error.status===503);
});
test('billing routes verify users and both webhook aliases preserve raw request bytes',()=>{
  const router=fs.readFileSync(path.join(__dirname,'../src/routes/stripeRoutes.ts'),'utf8');
  for(const endpoint of ['/stripe/create-checkout','/stripe/customer-portal'])assert.ok(router.includes(`router.post('${endpoint}', requireUser`));
  const app=fs.readFileSync(path.join(__dirname,'../src/app.ts'),'utf8');
  for(const endpoint of ['/api/stripe/webhook','/stripe/webhook']){
    const raw=app.indexOf(`app.use('${endpoint}', express.raw`);
    const json = app.indexOf('app.use(express.json');
    assert.ok(raw >= 0 && raw < json);
  }
  assert.ok(app.indexOf("import 'dotenv/config'")<app.indexOf("import fileRoutes"));
});
