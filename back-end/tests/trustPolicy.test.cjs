const {test}=require('node:test');
const assert=require('node:assert/strict');
const {reviewSnapshot,validShareToken,recentlySignedIn}=require('../dist/utils/trustPolicy.js');

test('public snapshots exclude structured private data and unknown fields without mutating CV',()=>{
  const cv={first_name:'Example',contact:{email:'private@example.test',phone:'123',location:'Home'},photo:'private-photo',references:[{email:'ref@example.test'}],
    personalInfo:{contact:{email:'nested@example.test'}},customSections:[{content:'private'}],
    experience:[{title:'Developer',description:['Built an API'],location:'Precise address',secret:'hidden'}],
    projects:[{project_name:'App',technologies:['Node']}],languages_spoken:['English',{language:'Urdu',level:'Native',secret:true}],unknown:'secret'};
  const original=structuredClone(cv);const result=reviewSnapshot(cv);
  assert.deepEqual(result.contact,{});assert.deepEqual(result.references,[]);
  for(const field of ['photo','personalInfo','customSections','unknown']) assert.equal(result[field],undefined);
  assert.deepEqual(result.experience,[{title:'Developer',description:['Built an API']}]);
  assert.equal(JSON.stringify(result).includes('private@example.test'),false);
  assert.deepEqual(cv,original);
});
test('weak legacy tokens and malformed bearer tokens are rejected',()=>{
  assert.equal(validShareToken('a'.repeat(64)),true);
  for(const value of [null,{},'abc','a'.repeat(32),'g'.repeat(64),'../secret']) assert.equal(validShareToken(value),false);
});
test('account deletion requires a valid recent actual sign-in',()=>{
  const now=Date.parse('2026-10-14T12:00:00Z');
  assert.equal(recentlySignedIn('2026-10-14T11:59:00Z',now),true);
  for(const value of [null,'bad','2026-10-14T11:49:59Z','2026-10-14T12:01:00Z']) assert.equal(recentlySignedIn(value,now),false);
});
