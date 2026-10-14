import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),guest='a'.repeat(64),user='00000000-0000-4000-8000-000000000001';
before(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE user_subscriptions(user_id uuid,plan_id text,status text,current_period_end timestamptz); GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;`);
 await db.query('INSERT INTO auth.users VALUES($1)',[user]);
 const sql=await readFile(new URL('../migrations/20261014_guest_tailoring.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
});
after(()=>db.close());
const check=(key,reserve=true,id=null)=>db.query('SELECT check_tailoring_allowance($1,$2,$3) AS q',[id,key,reserve]).then(r=>r.rows[0].q);
test('reads are free; exactly four attempts are reserved, fifth is denied',async()=>{
 assert.equal((await check(guest,false)).remaining,4);
 const results=await Promise.all(Array.from({length:6},()=>check(guest)));
 assert.equal(results.filter(r=>r.allowed).length,4);assert.equal((await check(guest,false)).remaining,0);
});
test('UTC day reset and separate verified identity allowance',async()=>{
 await db.exec("INSERT INTO tailoring_usage(subject,period_start,used) VALUES('guest:"+'b'.repeat(64)+"',(now() AT TIME ZONE 'UTC')::date-1,4)");
 assert.equal((await check('b'.repeat(64),false)).remaining,4);assert.equal((await check(null,true,user)).remaining,3);
});
test('premium allowance uses monthly period and finite limit',async()=>{
 await db.query("INSERT INTO user_subscriptions VALUES($1,'premium','active',now()+interval '1 day')",[user]);const q=await check(null,false,user);assert.equal(q.limit,999);assert.equal(q.remaining,999);
});
test('public roles cannot read counters or reserve quota directly',async()=>{
 for(const role of ['anon','authenticated']) {
  await assert.rejects(db.transaction(async tx=>{await tx.exec(`SET LOCAL ROLE ${role}`);await tx.exec('SELECT * FROM tailoring_usage')}),/permission denied/);
  await assert.rejects(db.transaction(async tx=>{await tx.exec(`SET LOCAL ROLE ${role}`);await tx.query('SELECT check_tailoring_allowance(null,$1,true)',[guest])}),/permission denied/);
 }
});
test('anonymous fleet budget fails closed and deleted accounts lose counters',async()=>{
 await db.exec("UPDATE tailoring_usage SET used=200 WHERE subject='guest-budget' AND period_start=(now() AT TIME ZONE 'UTC')::date");assert.equal((await check('c'.repeat(64))).reason,'budget');
 await db.query('DELETE FROM auth.users WHERE id=$1',[user]);assert.equal((await db.query('SELECT count(*)::int AS n FROM tailoring_usage WHERE user_id=$1',[user])).rows[0].n,0);
});
