import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = uid(1),
  otherAdmin = uid(2),
  patient = uid(3),
  consultation = uid(10),
  otherConsultation = uid(11);
let checks = 0;
function check(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  checks++;
  console.log("PASS", label);
}
await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;`);
for (const file of readdirSync("supabase/migrations").sort())
  if (file.endsWith(".sql")) await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
await db.query(
  `INSERT INTO auth.users VALUES ($1,'admin@example.test',now()),($2,'admin2@example.test',now()),($3,'patient@example.test',now())`,
  [admin, otherAdmin, patient],
);
await db.query(
  `INSERT INTO public.user_roles(user_id,role) VALUES ($1,'admin'),($2,'admin'),($3,'user')`,
  [admin, otherAdmin, patient],
);
async function as(role, user, sql, args = []) {
  await db.exec(`SET ROLE ${role}`);
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [user]);
  try {
    return await db.query(sql, args);
  } finally {
    await db.exec("RESET ROLE");
  }
}
async function denied(role, user, sql, args, pattern, label) {
  let caught;
  try {
    await as(role, user, sql, args);
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, label);
  assert.match(caught.message, pattern, label);
  checks++;
  console.log("PASS", label);
}
const createConsultation = `SELECT public.create_patient_consultation($1,$2,$3,$4,$5,$6)`;
await as("authenticated", admin, createConsultation, [
  consultation,
  uid(20),
  "Paciente Sintético",
  "patient@example.test",
  "2026-09-15",
  false,
]);
await as("authenticated", admin, createConsultation, [
  otherConsultation,
  uid(21),
  "Outro Sintético",
  "",
  "2026-09-15",
  false,
]);
const open = `SELECT public.open_consultation_journey($1,$2,$3,$4,$5,$6,$7,$8) AS journey`;
const args = [
  consultation,
  0,
  null,
  { header: { paciente: "Paciente Sintético" } },
  { historico: [] },
  "a".repeat(64),
  null,
  null,
];
await denied("anon", "", open, args, /permission denied/, "Anon não abre análise");
await denied(
  "authenticated",
  patient,
  open,
  args,
  /Acesso restrito/,
  "Paciente não abre análise administrativa",
);
await denied(
  "authenticated",
  admin,
  open,
  [...args.slice(0, 3), [], ...args.slice(4)],
  /inválidos/,
  "Payload não objeto é recusado",
);
await denied(
  "authenticated",
  admin,
  open,
  [consultation, 99, ...args.slice(2)],
  /consulta mudou/,
  "Versão de fonte forjada é recusada",
);
const first = (await as("authenticated", admin, open, args)).rows[0].journey;
check(first.consultation_id, consultation, "Análise vinculada por ID");
check(first.owner_id, admin, "Dono vem da sessão");
check(
  first.confirmations,
  { anamnese: false, bio: false, revisao: false },
  "Importação não confirma revisão",
);
check(
  (await as("authenticated", admin, open, args)).rows[0].journey.id,
  first.id,
  "Repetir abertura não duplica",
);
check(
  (
    await as("authenticated", otherAdmin, "SELECT id FROM public.jornadas_clinicas WHERE id=$1", [
      first.id,
    ])
  ).rows,
  [],
  "Outro admin não lê análise privada",
);
await denied(
  "authenticated",
  admin,
  `UPDATE public.jornadas_clinicas SET approved_version=1 WHERE id=$1`,
  [first.id],
  /permission denied/,
  "Cliente não forja aprovação por UPDATE",
);
const refresh = [...args.slice(0, 6), first.id, first.version];
await denied(
  "authenticated",
  otherAdmin,
  open,
  refresh,
  /análise mudou/,
  "Outro admin não atualiza análise alheia via RPC",
);
// Mesmo atendimento pode ter análise de outro responsável, respeitando o escopo já existente.
const other = (await as("authenticated", otherAdmin, open, args)).rows[0].journey;
check(other.id !== first.id, true, "Escopo do profissional preservado");
await db.query(
  `INSERT INTO public.jornada_aprovacoes(jornada_id,owner_id,version,content_hash,approved_by,snapshot)
VALUES($1,$2,1,$3,$2,'{"html":"aprovação sintética anterior"}')`,
  [first.id, admin, "a".repeat(64)],
);
await db.query(
  `UPDATE public.jornadas_clinicas SET approved_version=1, approved_by=$2, approved_at=now(), approved_hash=content_hash, status='aprovado' WHERE id=$1`,
  [first.id, admin],
);
await as(
  "authenticated",
  admin,
  `UPDATE public.consultation_drafts SET version=version+1 WHERE consultation_id=$1`,
  [consultation],
);
// O trigger protege também escritas privilegiadas do backend, inclusive a aprovação.
await denied(
  "postgres",
  admin,
  `UPDATE public.jornadas_clinicas SET status='aprovado' WHERE id=$1`,
  [first.id],
  /novos dados/,
  "Fonte antiga bloqueia escrita no banco",
);
await denied(
  "postgres",
  admin,
  `SELECT * FROM public.aprovar_jornada($1,$2,$3,$4,$5)`,
  [first.id, admin, 1, "a".repeat(64), {}],
  /novos dados/,
  "Fonte antiga bloqueia aprovação transacional",
);
check(
  (await as("authenticated", admin, open, args)).rows[0].journey.approved_version,
  1,
  "Abrir análise antiga não sobrescreve aprovação",
);
await denied(
  "authenticated",
  admin,
  open,
  refresh,
  /consulta mudou/,
  "Refresh com fonte antiga falha sem perda de dados",
);
const refreshed = (await as("authenticated", admin, open, [consultation, 1, ...refresh.slice(2)]))
  .rows[0].journey;
check(refreshed.version, 2, "Atualização incrementa versão");
check(refreshed.approved_version, null, "Atualização exige nova aprovação");
check(refreshed.protocolo, null, "Protocolo antigo não acompanha dados novos");
check(
  (
    await db.query("SELECT count(*)::int AS n FROM public.jornada_aprovacoes WHERE jornada_id=$1", [
      first.id,
    ])
  ).rows[0].n,
  1,
  "Snapshot anterior preservado",
);
await denied(
  "authenticated",
  admin,
  open,
  [consultation, 1, ...refresh.slice(2)],
  /análise mudou/,
  "Refresh concorrente não sobrescreve versão mais recente",
);
await denied(
  "postgres",
  admin,
  "UPDATE public.jornadas_clinicas SET consultation_id=$2 WHERE id=$1",
  [first.id, otherConsultation],
  /trocar o atendimento/,
  "Não permite trocar vínculo para outro paciente",
);
await as(
  "authenticated",
  patient,
  `INSERT INTO public.anamnesis_submissions(id,consultation_id,answers,confirmed_name,accepted) VALUES($1,$2,'{}','Paciente Sintético',true)`,
  [uid(30), consultation],
);
await denied(
  "postgres",
  admin,
  "UPDATE public.jornadas_clinicas SET status=status WHERE id=$1",
  [first.id],
  /novos dados/,
  "Nova resposta invalida fonte mesmo sem mudança na ficha",
);
await denied(
  "authenticated",
  admin,
  open,
  [consultation, 1, null, ...args.slice(3, 6), first.id, 2],
  /consulta mudou/,
  "Não ignora anamnese recém-recebida",
);
const newest = (
  await as("authenticated", admin, open, [
    consultation,
    1,
    uid(30),
    ...args.slice(3, 6),
    first.id,
    2,
  ])
).rows[0].journey;
check(newest.source_received_id, uid(30), "Recebimento atual integra a referência de origem");
// Jornadas legadas continuam legíveis e editáveis pelo backend existente, sem vínculo inventado.
await db.query(
  `INSERT INTO public.jornadas_clinicas(id,owner_id,patient_name) VALUES($1,$2,'Registro anterior')`,
  [uid(40), admin],
);
await db.query(`UPDATE public.jornadas_clinicas SET version=2 WHERE id=$1`, [uid(40)]);
check(
  (
    await as(
      "authenticated",
      admin,
      "SELECT consultation_id,version FROM public.jornadas_clinicas WHERE id=$1",
      [uid(40)],
    )
  ).rows,
  [{ consultation_id: null, version: 2 }],
  "Registro legado preservado sem associação por nome",
);
console.log(`${checks} verificações de consulta/análise aprovadas`);
await db.close();
