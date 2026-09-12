import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = process.argv[2];
if (!root) throw new Error('Indique o caminho absoluto do repositório.');
const db = new PGlite();
const admin = '00000000-0000-4000-8000-000000000001';
const user = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
let checks = 0;
function check(value, expected, label) {
  assert.deepEqual(value, expected, label);
  checks++;
  console.log('PASS', label);
}
await db.exec(`
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
`);
const migration = '20260910180000_restrict_report_access.sql';
for (const name of readdirSync(`${root}/supabase/migrations`).sort()) {
  if (name.endsWith('.sql') && name < migration) {
    await db.exec(readFileSync(`${root}/supabase/migrations/${name}`, 'utf8'));
  }
}
await db.exec(`
  INSERT INTO auth.users VALUES ('${admin}'), ('${user}'), ('${other}');
  INSERT INTO public.user_roles(user_id, role) VALUES ('${admin}', 'admin'), ('${user}', 'user'), ('${other}', 'user');
  INSERT INTO public.reports(patient_name) VALUES ('Paciente fictício');
  GRANT ALL ON public.reports, public.user_roles TO anon, authenticated;
`);
async function as(role, uid, sql) {
  await db.exec(`SET ROLE ${role};`);
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [uid]);
  try { return await db.query(sql); }
  finally { await db.exec('RESET ROLE'); }
}
async function denied(role, uid, sql, label) {
  let blocked = false;
  try { await as(role, uid, sql); }
  catch (e) { if (e.code === '42501') blocked = true; else throw e; }
  check(blocked, true, label);
}
check((await as('anon', '', 'SELECT * FROM public.reports')).rows.length, 1, 'Baseline reproduz leitura pública');
await db.exec(readFileSync(`${root}/docs/sql/${migration}`, 'utf8'));
for (const statement of [
  'SELECT * FROM public.reports',
  "INSERT INTO public.reports(patient_name) VALUES ('Teste anónimo')",
  "UPDATE public.reports SET patient_name='Teste anónimo'",
  'DELETE FROM public.reports',
]) await denied('anon', '', statement, `Anon bloqueado: ${statement.split(' ')[0]}`);
check((await as('authenticated', user, 'SELECT * FROM public.reports')).rows.length, 0, 'Utilizador comum não vê relatórios');
check((await as('authenticated', '', 'SELECT * FROM public.reports')).rows.length, 0, 'Authenticated sem identidade não vê relatórios');
await denied('authenticated', user, "INSERT INTO public.reports(patient_name) VALUES ('Teste comum')", 'Utilizador comum não insere');
check((await as('authenticated', user, "UPDATE public.reports SET patient_name='Teste comum' RETURNING id")).rows.length, 0, 'Utilizador comum não altera');
check((await as('authenticated', user, 'DELETE FROM public.reports RETURNING id')).rows.length, 0, 'Utilizador comum não apaga');
check((await as('authenticated', admin, 'SELECT * FROM public.reports')).rows.length, 1, 'Admin lê relatórios');
const created = await as('authenticated', admin, "INSERT INTO public.reports(patient_name) VALUES ('Teste admin') RETURNING id");
check(created.rows.length, 1, 'Admin insere');
const id = created.rows[0].id;
check((await as('authenticated', admin, `UPDATE public.reports SET patient_name='Atualizado' WHERE id='${id}' RETURNING id`)).rows.length, 1, 'Admin altera');
check((await as('authenticated', admin, `DELETE FROM public.reports WHERE id='${id}' RETURNING id`)).rows.length, 1, 'Admin apaga');
check((await as('authenticated', user, 'SELECT user_id FROM public.user_roles')).rows, [{user_id:user}], 'Cada utilizador vê apenas o próprio papel');
await denied('authenticated', user, `INSERT INTO public.user_roles(user_id,role) VALUES ('${user}','admin')`, 'Autoatribuição de admin bloqueada');
for (const role of ['anon','authenticated']) {
  for (const table of ['reports','user_roles']) {
    const r = await db.query(`SELECT has_table_privilege('${role}','public.${table}','TRUNCATE') AS allowed`);
    check(r.rows[0].allowed, false, `${role}: TRUNCATE removido de ${table}`);
  }
}
check((await as('authenticated', admin, `SELECT public.has_role(auth.uid(),'admin') AS allowed`)).rows[0].allowed, true, 'RPC has_role continua funcional');
const counts = await db.query('SELECT (SELECT count(*)::int FROM public.reports) AS reports, (SELECT count(*)::int FROM public.user_roles) AS roles');
check(counts.rows[0], {reports:1,roles:3}, 'Dados iniciais preservados');
await db.close();
console.log(`${checks} verificações passaram; banco temporário com dados fictícios.`);
