import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1),
  patient = id(2),
  otherAdmin = id(3),
  p = id(10),
  c = id(20),
  other = id(21),
  s = id(30),
  job = id(40);
let checks = 0;
const check = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label);
  checks++;
  console.log("PASS", label);
};
await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;`);
try {
  for (const file of readdirSync("supabase/migrations").sort())
    if (file.endsWith(".sql")) await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.query(
    `INSERT INTO auth.users VALUES ($1,'admin@example.test',now()),($2,'patient@example.test',now()),($3,'other-admin@example.test',now())`,
    [admin, patient, otherAdmin],
  );
  await db.query(
    `INSERT INTO public.user_roles(user_id,role) VALUES ($1,'admin'),($2,'user'),($3,'admin')`,
    [admin, patient, otherAdmin],
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
  async function denied(role, user, sql, args = [], code = "42501") {
    let caught;
    try {
      await as(role, user, sql, args);
    } catch (e) {
      caught = e.code;
    }
    check(caught, code, `${role}: ${sql.slice(0, 70)} recusado`);
  }
  await as("authenticated", admin, "INSERT INTO public.patients(id,name) VALUES ($1,$2)", [
    p,
    "Paciente Fictício",
  ]);
  await as(
    "authenticated",
    admin,
    `INSERT INTO public.consultations(id,patient_id,patient_name,consultation_date) VALUES ($1,$3,'Paciente Fictício','2026-09-14'),($2,$3,'Paciente Fictício','2026-09-14')`,
    [c, other, p],
  );
  await as(
    "authenticated",
    admin,
    `INSERT INTO public.anamnesis_submissions(id,consultation_id,answers,confirmed_name,accepted) VALUES ($1,$2,'{"patientName":"Paciente Fictício"}','Paciente Fictício',true)`,
    [s, c],
  );
  await as(
    "authenticated",
    admin,
    `INSERT INTO public.consultation_drafts(consultation_id,anamnesis_id,body_composition) VALUES ($1,$2,'{"weight":"70"}'),($3,null,null)`,
    [c, s, other],
  );
  const begin = "SELECT public.begin_consultation_analysis($1,$2,$3,$4,$5,$6,$7) AS data";
  const args = [job, c, 0, "test-model", "test-v1", "analise", ""];
  await denied("anon", "", begin, args);
  await denied("authenticated", patient, begin, args);
  await denied("authenticated", patient, "SELECT public.clinical_analysis_source($1)", [c]);
  await denied("anon", "", "SELECT * FROM public.consultation_analyses");
  check(
    (await as("authenticated", patient, "SELECT * FROM public.consultation_analyses")).rows,
    [],
    "Paciente não lê análises administrativas",
  );
  await denied(
    "authenticated",
    admin,
    begin,
    [job, other, 0, "test-model", "test-v1", "analise", ""],
    "P0003",
  );
  await denied(
    "authenticated",
    admin,
    begin,
    [job, c, 2, "test-model", "test-v1", "analise", ""],
    "P0003",
  );
  const first = (await as("authenticated", admin, begin, args)).rows[0].data;
  check(first.created, true, "Primeiro pedido reserva geração");
  check(first.analysis.created_by, admin, "Autoria vem da sessão");
  check(first.analysis.source_hash.length, 64, "Impressão digital da fonte calculada no banco");
  check(
    (await as("authenticated", admin, begin, args)).rows[0].data.created,
    false,
    "Repetição do mesmo pedido não inicia outra geração",
  );
  await denied("authenticated", otherAdmin, begin, args, "P0003");
  await denied(
    "authenticated",
    admin,
    begin,
    [job, c, 0, "test-model", "test-v1", "hipertrofia", ""],
    "P0003",
  );
  await denied(
    "authenticated",
    admin,
    begin,
    [id(41), c, 0, "test-model", "test-v1", "analise", ""],
    "P0002",
  );
  await denied(
    "authenticated",
    otherAdmin,
    begin,
    [id(41), c, 0, "test-model", "test-v1", "analise", ""],
    "P0002",
  );
  await denied(
    "authenticated",
    admin,
    "UPDATE public.consultation_analyses SET source_hash=$1 WHERE id=$2",
    ["0".repeat(64), job],
  );
  await denied(
    "authenticated",
    admin,
    "UPDATE public.consultation_analyses SET created_at=now() WHERE id=$1",
    [job],
  );
  check(
    (
      await as(
        "authenticated",
        otherAdmin,
        "UPDATE public.consultation_analyses SET status='failed',error_code='unavailable' WHERE id=$1 RETURNING id",
        [job],
      )
    ).rows,
    [],
    "Outro admin não conclui a geração alheia",
  );
  const output = {
    synthesis: "Síntese fictícia",
    correlations: [],
    missingInformation: [],
    pointsForReview: [],
    professionalDraft: "Nota fictícia",
  };
  const finish =
    "UPDATE public.consultation_analyses SET status='draft',result=$1 WHERE id=$2 RETURNING status,completed_at";
  const done = (await as("authenticated", admin, finish, [output, job])).rows[0];
  check(done.status, "draft", "Resultado salvo como rascunho");
  check(!!done.completed_at, true, "Conclusão datada pelo banco");
  const history = "SELECT public.list_consultation_analyses($1) AS data";
  check(
    (await as("authenticated", admin, history, [c])).rows[0].data[0].is_current,
    true,
    "Rascunho usa a fonte atual",
  );
  check(
    (await as("authenticated", admin, history, [other])).rows[0].data,
    [],
    "Consulta diferente não mistura análises",
  );
  await denied("authenticated", patient, history, [c]);
  await denied("authenticated", admin, finish, [output, job], "P0003");
  await denied(
    "authenticated",
    admin,
    "UPDATE public.consultation_analyses SET status='pending',result=null WHERE id=$1",
    [job],
    "P0003",
  );
  await denied("authenticated", admin, "DELETE FROM public.consultation_analyses WHERE id=$1", [
    job,
  ]);
  await as(
    "authenticated",
    admin,
    `UPDATE public.consultation_drafts SET body_composition='{"weight":"71"}' WHERE consultation_id=$1`,
    [c],
  );
  check(
    (await as("authenticated", admin, history, [c])).rows[0].data[0].is_current,
    false,
    "Mudança de exame detectada mesmo sem incrementar versão",
  );
  const second = id(42);
  await as("authenticated", admin, begin, [second, c, 0, "test-model", "test-v1", "analise", ""]);
  await as(
    "authenticated",
    admin,
    `UPDATE public.consultation_drafts SET version=1 WHERE consultation_id=$1`,
    [c],
  );
  check(
    (await as("authenticated", admin, finish, [output, second])).rows[0].status,
    "stale",
    "Mudança durante geração impede salvar rascunho como atual",
  );
  check(
    (
      await as(
        "authenticated",
        admin,
        "SELECT result FROM public.consultation_analyses WHERE id=$1",
        [second],
      )
    ).rows[0].result,
    null,
    "Resultado da fonte antiga é descartado",
  );
  for (let n = 0; n < 8; n++) {
    const next = id(100 + n);
    await as("authenticated", admin, begin, [next, c, 1, "test-model", "test-v1", "analise", ""]);
    await as(
      "authenticated",
      admin,
      "UPDATE public.consultation_analyses SET status='failed',error_code='unavailable' WHERE id=$1",
      [next],
    );
  }
  await denied(
    "authenticated",
    admin,
    begin,
    [id(150), c, 1, "test-model", "test-v1", "analise", ""],
    "P0001",
  );
  check(
    (await as("authenticated", admin, history, [c])).rows[0].data.length,
    10,
    "Histórico limitado a dez registros",
  );
  check(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM pg_proc WHERE proname IN ('clinical_analysis_source','begin_consultation_analysis','list_consultation_analyses','guard_consultation_analysis') AND prosecdef",
      )
    ).rows[0].n,
    0,
    "Funções preservam RLS com SECURITY INVOKER",
  );
  console.log(`${checks} verificações PostgreSQL de análises aprovadas`);
} finally {
  await db.close();
}
