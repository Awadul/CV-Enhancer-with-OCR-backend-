import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

// Disposable PostgreSQL staging: no production URLs, credentials or user data.
const db = new PGlite();
const owner = randomUUID(), other = randomUUID(), pro = randomUUID(), premium = randomUUID();
const expired = randomUUID(), canceled = randomUUID(), trial = randomUUID();
const project = randomUUID();
let ownVersion;
const cvSql = await readFile(new URL('../migrations/20261014_cv_versions.sql', import.meta.url), 'utf8');
const quotaSql = await readFile(new URL('../migrations/20261014_ai_feature_usage.sql', import.meta.url), 'utf8');
const legacySql = await readFile(new URL('../migrations/20261014_legacy_usage_alignment.sql', import.meta.url), 'utf8');
const {buildMigrationBundle}=createRequire(import.meta.url)('../scripts/build-migration-bundle.cjs');

async function asRole(role, user, action) {
  assert.ok(['authenticated', 'anon', 'service_role'].includes(role));
  return db.transaction(async tx => {
    await tx.exec(`SET LOCAL ROLE ${role}`);
    await tx.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [user || '']);
    await tx.query("SELECT set_config('request.jwt.claim.role', $1, true)", [role]);
    return action(tx);
  });
}
const reserve = (user, feature) => asRole('service_role', null, async tx =>
  (await tx.query('SELECT public.reserve_ai_feature_usage($1::uuid, $2::text) AS result', [user, feature])).rows[0].result);

before(async () => {
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text UNIQUE);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      'SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
      'SELECT nullif(current_setting(''request.jwt.claim.role'', true), '''')';
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  `);
  // Snapshots of the existing schema: keep tests reproducible in this repository alone.
  await db.exec(await readFile(new URL('./fixtures/core-schema.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('./fixtures/subscriptions.sql', import.meta.url), 'utf8'));
  await db.exec('GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_cvs TO authenticated');
  await db.exec(cvSql);
  await db.exec(quotaSql);
  for (const user of [owner, other, pro, premium, expired, canceled, trial]) {
    await db.query('INSERT INTO auth.users(id, email) VALUES ($1, $2)', [user, `${user}@example.test`]);
  }
  await db.query('INSERT INTO public.user_usage(user_id, atsscanspermonth, resumeprojects) VALUES ($1, 2, 7)', [owner]);
  await db.exec('GRANT SELECT, UPDATE ON public.user_usage TO authenticated');
  await db.exec(legacySql);
  await db.query("INSERT INTO public.saved_cvs(id,user_id,name) VALUES ($1,$2,'Test CV')", [project, owner]);
  for (const [user, plan, status, end] of [
    [pro, 'pro', 'active', '2099-01-01'], [premium, 'premium', 'active', '2099-01-01'],
    [expired, 'premium', 'active', '2000-01-01'], [canceled, 'premium', 'canceled', '2099-01-01'],
    [trial, 'pro', 'trialing', '2099-01-01'],
  ]) await db.query('INSERT INTO public.user_subscriptions(user_id,plan_id,status,current_period_end) VALUES ($1,$2,$3,$4)', [user,plan,status,end]);
});
after(async () => { await db.close(); });

test('all release migrations apply again without duplicate-policy or index failures', async () => {
  await db.exec(cvSql); await db.exec(quotaSql); await db.exec(legacySql);
});
test('production SQL bundle matches its sources and executes as one transaction',async()=>{
  const bundle=await readFile(new URL('../migrations/releases/20261014.sql',import.meta.url),'utf8');
  assert.equal(bundle,buildMigrationBundle());
  await db.exec(bundle);
});
test('owner guards constrain legacy permissive policies and restore the project foreign key', async () => {
  await db.exec(`
    CREATE POLICY legacy_open_versions ON public.cv_versions FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY legacy_open_usage ON public.ai_feature_usage FOR SELECT TO authenticated USING (true);
    ALTER TABLE public.cv_versions DROP CONSTRAINT cv_versions_owned_project_fk;
  `);
  await db.exec(cvSql); await db.exec(quotaSql);
  const fk = await db.query("SELECT conname FROM pg_constraint WHERE conrelid='public.cv_versions'::regclass AND conname='cv_versions_owned_project_fk'");
  assert.equal(fk.rows.length, 1);
  // Later access tests run with those permissive policies still present.
});
test('owner can create and read an immutable CV version', async () => {
  const result = await asRole('authenticated', owner, tx => tx.query(
    'INSERT INTO public.cv_versions(project_id,user_id,name,cv_data) VALUES ($1,$2,$3,$4) RETURNING id',
    [project, owner, 'Snapshot', { first_name: 'Candidate' }]));
  ownVersion = result.rows[0].id;
  const visible = await asRole('authenticated', owner, tx => tx.query('SELECT id FROM public.cv_versions'));
  assert.equal(visible.rows.length, 1);
  await assert.rejects(asRole('authenticated', owner, tx => tx.query("UPDATE public.cv_versions SET name='changed'")), { code: '42501' });
});
test('another user cannot read or delete owner versions', async () => {
  const rows = await asRole('authenticated', other, tx => tx.query('SELECT id FROM public.cv_versions'));
  assert.equal(rows.rows.length, 0);
  const deleted = await asRole('authenticated', other, tx => tx.query('DELETE FROM public.cv_versions WHERE id=$1 RETURNING id', [ownVersion]));
  assert.equal(deleted.rows.length, 0);
});
test('forged version identity and cross-owner project insertion are rejected', async () => {
  for (const claimed of [owner, other]) await assert.rejects(asRole('authenticated', other, tx => tx.query(
    'INSERT INTO public.cv_versions(project_id,user_id,name,cv_data) VALUES ($1,$2,$3,$4)',
    [project, claimed, 'Forged', {}])), error => ['42501','23503'].includes(error.code));
});
test('anonymous users cannot read versions', async () => {
  await assert.rejects(asRole('anon', null, tx => tx.query('SELECT * FROM public.cv_versions')), { code: '42501' });
});
test('CV data must be an object and deleting a CV cascades versions', async () => {
  await assert.rejects(asRole('authenticated', owner, tx => tx.query(
    'INSERT INTO public.cv_versions(project_id,user_id,name,cv_data) VALUES ($1,$2,$3,$4)', [project, owner, 'Bad', []])), { code: '23514' });
  const temporary = randomUUID();
  await db.query("INSERT INTO public.saved_cvs(id,user_id,name) VALUES ($1,$2,'Temporary')", [temporary,owner]);
  await db.query("INSERT INTO public.cv_versions(project_id,user_id,name,cv_data) VALUES ($1,$2,'Temporary','{}')", [temporary,owner]);
  await asRole('authenticated', owner, tx => tx.query('DELETE FROM public.saved_cvs WHERE id=$1', [temporary]));
  assert.equal((await db.query('SELECT id FROM public.cv_versions WHERE project_id=$1', [temporary])).rows.length, 0);
});
test('starter gets three trim attempts, then a quota denial', async () => {
  for (let used=1; used<=3; used++) assert.equal((await reserve(owner,'resume_trim')).used, used);
  assert.deepEqual(await reserve(owner,'resume_trim'), { allowed:false, reason:'quota' });
  assert.deepEqual(await reserve(owner,'bios'), { allowed:false, reason:'plan' });
  assert.deepEqual(await reserve(owner,'ats_fix'), { allowed:false, reason:'plan' });
});
test('plan, status and expiry are resolved in the database', async () => {
  assert.equal((await reserve(pro,'bios')).allowed, true);
  assert.equal((await reserve(pro,'ats_fix')).reason, 'plan');
  assert.equal((await reserve(premium,'ats_fix')).allowed, true);
  assert.equal((await reserve(trial,'bios')).allowed, true);
  assert.equal((await reserve(expired,'bios')).reason, 'plan');
  assert.equal((await reserve(canceled,'bios')).reason, 'plan');
});
test('browser roles cannot invoke quota RPC or mutate counters', async () => {
  for (const role of ['anon','authenticated']) await assert.rejects(asRole(role, owner, tx => tx.query(
    "SELECT public.reserve_ai_feature_usage($1,'bios')", [pro])), { code:'42501' });
  for (const query of [
    'UPDATE public.ai_feature_usage SET used=0', 'DELETE FROM public.ai_feature_usage',
    "INSERT INTO public.ai_feature_usage(user_id,feature,period_start) VALUES ('"+owner+"','bios',current_date)",
  ]) await assert.rejects(asRole('authenticated', owner, tx => tx.exec(query)), { code:'42501' });
});
test('usage reads are owner-scoped and old months do not consume the current allowance', async () => {
  const mine = await asRole('authenticated', owner, tx => tx.query('SELECT user_id FROM public.ai_feature_usage'));
  assert.ok(mine.rows.length > 0); assert.ok(mine.rows.every(row => row.user_id === owner));
  await db.query("INSERT INTO public.ai_feature_usage(user_id,feature,period_start,used) VALUES ($1,'resume_trim','2000-01-01',3)", [other]);
  const current = await reserve(other,'resume_trim');
  assert.equal(current.used,1);
  assert.notEqual(current.period_start,'2000-01-01');
});
test('only one final paid slot is granted; separate feature counters do not collide', async () => {
  await db.query("UPDATE public.ai_feature_usage SET used=998 WHERE user_id=$1 AND feature='bios'", [pro]);
  const attempts = await Promise.all([reserve(pro,'bios'),reserve(pro,'bios')]);
  assert.equal(attempts.filter(result => result.allowed).length,1);
  assert.equal(attempts.filter(result => result.reason==='quota').length,1);
  assert.equal((await reserve(pro,'resume_trim')).used,1);
  // PGlite serializes one connection: a hosted multi-session race is a separate test.
});
test('unknown and null feature requests are rejected without ledger writes', async () => {
  for (const feature of ['unknown',null]) await assert.rejects(reserve(owner,feature), { code:'P0001' });
});
test('owner may delete a version without altering other project data', async () => {
  await asRole('authenticated', owner, tx => tx.query('DELETE FROM public.cv_versions WHERE id=$1', [ownVersion]));
  assert.equal((await db.query('SELECT id FROM public.cv_versions WHERE id=$1', [ownVersion])).rows.length,0);
  assert.equal((await db.query('SELECT id FROM public.saved_cvs WHERE id=$1', [project])).rows.length,1);
});
test('legacy migration preserves existing counts and accepts canonical UI feature names', async () => {
  const before = (await db.query('SELECT atsscanspermonth,resumeprojects FROM public.user_usage WHERE user_id=$1', [owner])).rows[0];
  assert.deepEqual(before, {atsscanspermonth:2,resumeprojects:7});
  await asRole('authenticated', owner, tx => tx.query("SELECT public.increment_usage($1,'atsScansPerMonth')", [owner]));
  assert.equal((await db.query('SELECT atsscanspermonth FROM public.user_usage WHERE user_id=$1', [owner])).rows[0].atsscanspermonth,3);
});
test('legacy RPC cannot change another user or arbitrary columns; global resets are private', async () => {
  await assert.rejects(asRole('authenticated', owner, tx => tx.query("SELECT public.increment_usage($1,'atsScansPerMonth')", [other])), {code:'42501'});
  await assert.rejects(asRole('authenticated', owner, tx => tx.query("SELECT public.increment_usage($1,'user_id')", [owner])), {code:'P0001'});
  await assert.rejects(asRole('anon', null, tx => tx.query("SELECT public.increment_usage($1,'atsScansPerMonth')", [owner])), {code:'42501'});
  await assert.rejects(asRole('authenticated', owner, tx => tx.exec('SELECT public.reset_daily_usage()')), {code:'42501'});
  await assert.rejects(asRole('authenticated', owner, tx => tx.exec('UPDATE public.user_usage SET atsscanspermonth=0')), {code:'42501'});
});
test('legacy monthly resets retain lifetime counts and service calls remain supported', async () => {
  await db.query("UPDATE public.user_usage SET monthly_period_start='2000-01-01',last_reset='2000-01-01',jobsearchesperday=4 WHERE user_id=$1",[owner]);
  await asRole('service_role', null, tx => tx.query("SELECT public.increment_usage($1,'resumeProjects')",[owner]));
  const row=(await db.query('SELECT atsscanspermonth,resumeprojects,jobsearchesperday FROM public.user_usage WHERE user_id=$1',[owner])).rows[0];
  assert.deepEqual(row,{atsscanspermonth:0,resumeprojects:8,jobsearchesperday:0});
});
test('ATS reservation atomically uses the legacy counter without double charging', async()=>{
  const call=()=>asRole('service_role',null,async tx=>(await tx.query('SELECT public.reserve_ats_usage($1) AS result',[other])).rows[0].result);
  assert.equal((await call()).used,1);
  assert.equal((await call()).used,2);
  const attempts=await Promise.all([call(),call()]);
  assert.equal(attempts.filter(q=>q.allowed).length,1);
  assert.equal((await db.query('SELECT atsscanspermonth FROM public.user_usage WHERE user_id=$1',[other])).rows[0].atsscanspermonth,3);
});
test('browser callers cannot reserve ATS counters directly',async()=>{
  await assert.rejects(asRole('authenticated',owner,tx=>tx.query('SELECT public.reserve_ats_usage($1)',[owner])),{code:'42501'});
});
