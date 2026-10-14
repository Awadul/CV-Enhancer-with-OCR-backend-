const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bypassLocalCheckLimits } = require(require('node:path').join(process.env.LOCAL_CHECK_BUILD || require('node:path').join(__dirname, '../dist'), 'middleware/localCheckLimits.js'));
const { rateLimiter } = require(require('node:path').join(process.env.LOCAL_CHECK_BUILD || require('node:path').join(__dirname, '../dist'), 'middleware/rateLimiter.js'));
test('local override is opt-in, loopback-only, and impossible in production', () => {
 const oldEnv = process.env.NODE_ENV, oldFlag = process.env.LOCAL_DISABLE_CHECK_LIMITS;
 const local = { ip: '127.0.0.1', socket: { remoteAddress: '::ffff:127.0.0.1' } };
 try {
  process.env.NODE_ENV = 'development'; process.env.LOCAL_DISABLE_CHECK_LIMITS = 'true';
  assert.equal(bypassLocalCheckLimits(local), true);
  assert.equal(bypassLocalCheckLimits({...local, ip: '8.8.8.8'}), false);
  assert.equal(bypassLocalCheckLimits({...local, socket:{remoteAddress:'8.8.8.8'}, headers:{'x-forwarded-for':'127.0.0.1'}}), false);
  process.env.NODE_ENV = 'production'; assert.equal(bypassLocalCheckLimits(local), false);
  process.env.NODE_ENV = 'staging'; assert.equal(bypassLocalCheckLimits(local), false);
  delete process.env.NODE_ENV; assert.equal(bypassLocalCheckLimits(local), false);
  process.env.NODE_ENV = 'development'; process.env.LOCAL_DISABLE_CHECK_LIMITS = 'false'; assert.equal(bypassLocalCheckLimits(local), false);
  process.env.LOCAL_DISABLE_CHECK_LIMITS = 'true';
  const limited = rateLimiter({limit:1}); let calls=0;
  const res={set(){},status(){return this},json(){return this}};
  limited(local,res,()=>calls++); limited(local,res,()=>calls++); assert.equal(calls,1,'unrelated routes remain limited');
  const checks=rateLimiter({limit:1,localCheckBypass:true}); checks(local,res,()=>calls++); checks(local,res,()=>calls++); assert.equal(calls,3);
 } finally {
  if(oldEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldEnv;
  if(oldFlag===undefined)delete process.env.LOCAL_DISABLE_CHECK_LIMITS;else process.env.LOCAL_DISABLE_CHECK_LIMITS=oldFlag;
 }
});
