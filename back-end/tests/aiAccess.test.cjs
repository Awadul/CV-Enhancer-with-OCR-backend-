const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createAiAccess, validateAiInput } = require(process.env.AI_ACCESS_BUILD || '../dist/middleware/aiAccess.js');

function response() {
  return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
function fixture({ authError = null, authThrows = false, quota = { allowed: true }, rpcError = null } = {}) {
  const calls = [];
  const access = createAiAccess(() => ({
    auth: { getUser: async token => {
      calls.push(['auth', token]);
      if (authThrows) throw new Error('offline');
      return { data: { user: authError ? null : { id: 'verified-user' } }, error: authError };
    } },
    rpc: async (name, args) => { calls.push(['rpc', name, args]); return { data: quota, error: rpcError }; },
  }));
  return { calls, ...access };
}

test('missing/malformed authorization never reserves quota or runs generation', async () => {
  for (const authorization of [undefined, 'Basic fake', 'Bearer ', 'Bearer a b']) {
    const f = fixture(); const res = response(); let next = false;
    await f.authenticate({ headers: { authorization }, body: { userId: 'forged' } }, res, () => { next = true; });
    assert.equal(res.code, 401); assert.equal(next, false); assert.equal(f.calls.length, 0);
  }
});
test('invalid session is rejected', async () => {
  const f = fixture({ authError: { message: 'expired' } }); const res = response();
  await f.authenticate({ headers: { authorization: 'Bearer expired' } }, res, () => assert.fail('must not continue'));
  assert.equal(res.code, 401);
});
test('verified identity overrides body claims and quota is checked before generation', async () => {
  const f = fixture(); const req = { headers: { authorization: 'Bearer valid' }, body: { userId: 'forged', plan: 'enterprise', limit: 999999 } };
  await f.authenticate(req, response(), () => {});
  let generated = false;
  await f.reserveQuota('bios')(req, response(), () => { generated = true; });
  assert.equal(generated, true);
  assert.deepEqual(f.calls[1], ['rpc', 'reserve_ai_feature_usage', { p_user_id: 'verified-user', p_feature: 'bios' }]);
});
test('plan denial, exhaustion and missing migration fail closed', async () => {
  for (const [options, expected] of [
    [{ quota: { allowed: false, reason: 'plan' } }, 403],
    [{ quota: { allowed: false, reason: 'quota' } }, 429],
    [{ rpcError: { message: 'function not found' }, quota: null }, 503],
    [{ quota: { unexpected: true } }, 503],
  ]) {
    const f = fixture(options); const res = response();
    await f.reserveQuota('ats_fix')({ userId: 'verified-user' }, res, () => assert.fail('must not generate'));
    assert.equal(res.code, expected);
  }
});
test('authentication infrastructure failures fail closed', async () => {
  const f = fixture({ authThrows: true }); const res = response();
  await f.authenticate({ headers: { authorization: 'Bearer valid' } }, res, () => assert.fail('must not generate'));
  assert.equal(res.code, 503);
});
test('malformed or unbounded input is rejected before quota consumption', () => {
  for (const [feature, body] of [
    ['bios', { cvData: 'broken' }], ['bios', { cvData: [] }],
    ['bios', { cvData: { summary: 'x' }, formats: ['unsupported'] }],
    ['bios', { cvData: { summary: 'x'.repeat(100001) } }],
    ['resume_trim', { cvData: { summary: 'x' }, maxPages: -1 }],
    ['resume_trim', { cvData: { summary: 'x' }, maxPages: 1.5 }],
    ['ats_fix', { cvData: { summary: 'x' }, issues: { failedRules: [null] } }],
  ]) {
    const res = response();
    validateAiInput(feature)({ body }, res, () => assert.fail('invalid input passed'));
    assert.equal(res.code, 400);
  }
});
test('partial ATS reports get safe defaults and legacy JSON CV input is normalized', () => {
  const req = { body: { cvData: '{"summary":"Candidate"}', issues: { keywordGaps: ['React'] } } };
  let next = false;
  validateAiInput('ats_fix')(req, response(), () => { next = true; });
  assert.equal(next, true);
  assert.deepEqual(req.body.issues.failedRules, []);
  assert.equal(req.body.cvData.summary, 'Candidate');
});
test('protected routes have authentication, validation and quota in that order', () => {
  const source = require('node:fs').readFileSync(path.join(__dirname, '../src/routes/fileRoutes.ts'), 'utf8');
  for (const [route, feature] of [['/bios/generate', 'bios'], ['/resume/fix-ats', 'ats_fix'], ['/resume/trim-one-page', 'resume_trim']]) {
    assert.ok(source.includes(`router.post('${route}', requireAiUser, validateAiInput('${feature}'), requireAiQuota('${feature}')`));
  }
});
const {rateLimiter}=require(process.env.AI_ACCESS_BUILD ? path.join(path.dirname(process.env.AI_ACCESS_BUILD),'rateLimiter.js') : '../dist/middleware/rateLimiter.js');
const ipRequest=(forwarded)=>({ip:'203.0.113.1',headers:{'x-forwarded-for':forwarded},socket:{remoteAddress:'203.0.113.1'}});
function limitResponse(){const res=response();res.set=()=>res;return res;}
test('changing forwarded headers cannot bypass an anonymous quota',()=>{
  const limiter=rateLimiter({limit:1});
  limiter(ipRequest('attacker-one'),limitResponse(),()=>{});
  const res=limitResponse();
  limiter(ipRequest('attacker-two'),res,()=>assert.fail('spoofed IP passed'));
  assert.equal(res.code,429);
});
test('anonymous feature quotas use independent counters',()=>{
  const ats=rateLimiter({limit:1}),attention=rateLimiter({limit:5});
  ats(ipRequest(''),limitResponse(),()=>{});
  let allowed=false;
  attention(ipRequest(''),limitResponse(),()=>{allowed=true;});
  assert.equal(allowed,true);
});
