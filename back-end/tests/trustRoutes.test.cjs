const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTrustRouter}=require('../dist/routes/trustRoutes.js');
function response(){return {statusCode:200,status(n){this.statusCode=n;return this},json(data){this.body=data;return this}}}
function handler(db,path,method='post'){
 const route=createTrustRouter(()=>db).stack.find(item=>item.route?.path===path && item.route.methods[method]);
 return route.route.stack.at(-1).handle;
}
test('review create selects CV by verified owner and never trusts caller snapshot',async()=>{
 const filters=[];let inserted;
 const db={from(table){if(table==='saved_cvs')return {select(){return this},eq(k,v){filters.push([k,v]);return this},async maybeSingle(){return {data:{id:'00000000-0000-4000-8000-000000000001',name:'CV',theme_id:'classic',cv_data:{first_name:'Example',contact:{email:'secret'}}}}}};
  return {insert(value){inserted=value;return this},select(){return this},async single(){return {data:inserted}}};}};
 const res=response(); await handler(db,'/reviews/create')({userId:'verified-owner',body:{cvId:'00000000-0000-4000-8000-000000000001',allowComments:true,review_snapshot:{secret:'forged'}}},res);
 assert.equal(res.statusCode,201);assert.ok(filters.some(([k,v])=>k==='user_id'&&v==='verified-owner'));
 assert.equal(inserted.user_id,'verified-owner');assert.equal(inserted.share_token.length,64);
 assert.deepEqual(inserted.review_snapshot.cv_data.contact,{});assert.equal(inserted.review_snapshot.secret,undefined);
});
test('invalid review tokens do not touch database',async()=>{
 const res=response();await handler({from(){throw Error('must not query')}},'/reviews/read')({body:{token:'weak'}},res);
 assert.equal(res.statusCode,404);
});
test('account deletion requires exact confirmation and recent trusted sign-in before mutation',async()=>{
 let deleted=false;
 const db={auth:{async getUser(){return {data:{user:{last_sign_in_at:'2000-01-01'}}}},admin:{deleteUser(){deleted=true}}}};
 for(const confirmation of ['delete','DELETE']){
  const res=response();await handler(db,'/account','delete')({body:{confirmation},headers:{authorization:'Bearer verified'},userId:'owner'},res);
  assert.equal(res.statusCode,confirmation==='DELETE'?403:400);
 }
 assert.equal(deleted,false);
});
test('deletion refuses to continue if schema cascade safety is unavailable',async()=>{
 let deleted=false;
 const db={auth:{async getUser(){return {data:{user:{last_sign_in_at:new Date().toISOString()}}}},admin:{deleteUser(){deleted=true}}},
 from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:null}}}},async rpc(){return {data:false}}};
 const res=response();await handler(db,'/account','delete')({body:{confirmation:'DELETE'},headers:{authorization:'Bearer verified'},userId:'owner'},res);
 assert.equal(res.statusCode,503);assert.equal(deleted,false);
});
test('support save failures never return a false receipt',async()=>{
 const db={from(){return {insert(){return this},select(){return this},async single(){return {error:Error('offline')}}}}};
 const res=response();await handler(db,'/support/requests')({body:{email:'example@example.test',subject:'Help',message:'Please help'}},res);
 assert.equal(res.statusCode,503);assert.equal(res.body.reference,undefined);
});
