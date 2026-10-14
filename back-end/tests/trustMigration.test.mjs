import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const share='00000000-0000-4000-8000-000000000003',otherShare='00000000-0000-4000-8000-000000000004';
const sql=await readFile(new URL('../migrations/20261014_trust_and_sharing.sql',import.meta.url),'utf8');
async function as(role,user,callback){return db.transaction(async tx=>{
  await tx.exec(`SET LOCAL ROLE ${role}`);await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[user||'']);return callback(tx);
});}
before(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
 CREATE TABLE public.cv_shares(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users ON DELETE CASCADE,cv_id uuid,cv_name text,share_token text UNIQUE,is_active boolean DEFAULT true,allow_comments boolean DEFAULT true,created_at timestamptz DEFAULT now());
 CREATE TABLE public.cv_comments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),share_id uuid REFERENCES public.cv_shares ON DELETE CASCADE,reviewer_name text,section text,section_index int DEFAULT -1,content text,parent_id uuid REFERENCES public.cv_comments ON DELETE CASCADE,resolved boolean DEFAULT false,created_at timestamptz DEFAULT now());
 ALTER TABLE cv_shares ENABLE ROW LEVEL SECURITY; ALTER TABLE cv_comments ENABLE ROW LEVEL SECURITY;
 CREATE POLICY old_public_read ON cv_shares FOR SELECT USING(true);
 CREATE POLICY old_owner_manage ON cv_shares FOR ALL TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
 CREATE POLICY old_comments ON cv_comments FOR ALL USING(true) WITH CHECK(true);
 GRANT ALL ON cv_shares,cv_comments TO anon,authenticated,service_role;`);
 await db.query('INSERT INTO auth.users VALUES($1),($2)',[owner,other]);
 await db.query("INSERT INTO cv_shares(id,user_id,share_token) VALUES($1,$2,'weaklegacy')",[share,owner]);
 await db.exec(sql);await db.exec(sql);
});
after(()=>db.close());
test('legacy links are revoked and anonymous table enumeration is denied despite old policies',async()=>{
 assert.equal((await db.query('SELECT is_active FROM cv_shares WHERE id=$1',[share])).rows[0].is_active,false);
 await assert.rejects(as('anon',null,tx=>tx.query('SELECT * FROM cv_shares')),/permission denied/);
 await assert.rejects(as('anon',null,tx=>tx.query('SELECT * FROM cv_comments')),/permission denied/);
});
test('owner can read their shares but cannot extend expiry, mutate token or create raw shares',async()=>{
 assert.equal((await as('authenticated',owner,tx=>tx.query('SELECT * FROM cv_shares'))).rows.length,1);
 assert.equal((await as('authenticated',other,tx=>tx.query('SELECT * FROM cv_shares'))).rows.length,0);
 await assert.rejects(as('authenticated',owner,tx=>tx.query("UPDATE cv_shares SET share_token='stolen'")),/permission denied/);
 await assert.rejects(as('authenticated',owner,tx=>tx.query("UPDATE cv_shares SET expires_at=now()+interval '1 year'")),/permission denied/);
 await assert.rejects(as('authenticated',owner,tx=>tx.query("INSERT INTO cv_shares(id,user_id) VALUES(gen_random_uuid(),$1)",[owner])),/permission denied/);
});
test('token-bound comments reject revoked/expired links and cross-share reply parents',async()=>{
 await db.query("UPDATE cv_shares SET share_token=$1,is_active=true,expires_at=now()+interval '7 days',review_snapshot='{}' WHERE id=$2",['a'.repeat(64),share]);
 await db.query("INSERT INTO cv_shares(id,user_id,share_token,is_active,expires_at,review_snapshot) VALUES($1,$2,$3,true,now()+interval '7 days','{}')",[otherShare,other,'b'.repeat(64)]);
 const comment=await as('service_role',null,tx=>tx.query("SELECT add_review_comment($1,'Reviewer','summary','Useful',NULL) AS result",['a'.repeat(64)]));
 const parent=comment.rows[0].result.id;
 await assert.rejects(as('service_role',null,tx=>tx.query("SELECT add_review_comment($1,'Reviewer','','Reply',$2)",['b'.repeat(64),parent])),/Invalid parent/);
 await db.query('UPDATE cv_shares SET allow_comments=false WHERE id=$1',[share]);
 await assert.rejects(as('service_role',null,tx=>tx.query("SELECT add_review_comment($1,'Reviewer','summary','No',NULL)",['a'.repeat(64)])),/Link unavailable/);
 await db.query("UPDATE cv_shares SET allow_comments=true,expires_at=now()-interval '1 second' WHERE id=$1",[share]);
 await assert.rejects(as('service_role',null,tx=>tx.query("SELECT add_review_comment($1,'Reviewer','summary','No',NULL)",['a'.repeat(64)])),/Link unavailable/);
});
test('browser roles cannot invoke service comment RPC or read support tickets',async()=>{
 for(const role of ['anon','authenticated']){
  await assert.rejects(as(role,owner,tx=>tx.query("SELECT add_review_comment($1,'x','summary','y',NULL)",['a'.repeat(64)])),/permission denied/);
  await assert.rejects(as(role,owner,tx=>tx.query('SELECT * FROM support_requests')),/permission denied/);
 }
});
test('owner revocation works and foreign owners cannot change sharing settings',async()=>{
 assert.equal((await as('authenticated',other,tx=>tx.query('UPDATE cv_shares SET is_active=false WHERE id=$1 RETURNING id',[share]))).rows.length,0);
 assert.equal((await as('authenticated',owner,tx=>tx.query('UPDATE cv_shares SET is_active=false WHERE id=$1 RETURNING id',[share]))).rows.length,1);
});
test('account deletion preflight fails closed when a new user table lacks cascade',async()=>{
 assert.equal((await db.query('SELECT account_deletion_ready() AS ready')).rows[0].ready,true);
 await db.exec('CREATE TABLE unsafe_future_table(user_id uuid)');
 assert.equal((await db.query('SELECT account_deletion_ready() AS ready')).rows[0].ready,false);
 await db.exec('DROP TABLE unsafe_future_table');
 await db.query('DELETE FROM auth.users WHERE id=$1',[owner]);
 assert.equal((await db.query('SELECT * FROM cv_shares WHERE id=$1',[share])).rows.length,0);
 assert.equal((await db.query('SELECT * FROM cv_comments WHERE share_id=$1',[share])).rows.length,0);
});
