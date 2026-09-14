import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const db = new PGlite(),
  id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1),
  patient = id(2),
  location = "ok2UHC2QMZsd8UHsAgEa",
  workflow = id(3),
  secret = "a".repeat(64),
  token = "b".repeat(64);
const hash = (x) => createHash("sha256").update(x).digest("hex");
let checks = 0;
function check(a, b, label) {
  assert.deepEqual(a, b, label);
  checks++;
  console.log("PASS", label);
}
await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;`);
try {
  // This release does not depend on or install the unapproved AI-analysis migration.
  for (const file of readdirSync("supabase/migrations").sort())
    if (file.endsWith(".sql") && !file.startsWith("20260914140000"))
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.query(
    "INSERT INTO auth.users VALUES ($1,'admin@example.test',now()),($2,'patient@example.test',now())",
    [admin, patient],
  );
  await db.query("INSERT INTO public.user_roles(user_id,role) VALUES ($1,'admin'),($2,'user')", [
    admin,
    patient,
  ]);
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
    let actual;
    try {
      await as(role, user, sql, args);
    } catch (e) {
      actual = e.code;
    }
    check(actual, code, `Recusado: ${sql.split("(")[0].slice(0, 65)}`);
  }
  const config = "SELECT public.configure_intake_automation($1,$2,$3,$4)";
  await denied("anon", "", config, [location, workflow, hash(secret), true]);
  await denied("authenticated", patient, config, [location, workflow, hash(secret), true]);
  await as("authenticated", admin, config, [location, workflow, hash(secret), true]);
  check(
    (await as("authenticated", admin, "SELECT enabled FROM public.intake_automation")).rows[0]
      .enabled,
    true,
    "Somente admin habilita recebimento",
  );
  await denied("authenticated", admin, "SELECT secret_hash FROM public.intake_automation");
  await denied("anon", "", "SELECT public.check_intake_key($1)", [secret]);
  for (const table of [
    "patients",
    "consultations",
    "anamnesis_submissions",
    "intake_invitations",
    "ghl_patient_links",
    "intake_automation",
  ])
    await denied("anon", "", `SELECT * FROM public.${table}`);
  check(
    (await as("authenticated", patient, "SELECT enabled FROM public.intake_automation")).rows
      .length,
    0,
    "Paciente não vê configuração",
  );
  const tomorrow = new Date(Date.now() + 86400000).toISOString(),
    day = tomorrow.slice(0, 10);
  const issue = "SELECT public.issue_intake_invitation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS data";
  const args = [
    secret,
    location,
    workflow,
    "contact_test_01",
    "appointment_test_01",
    tomorrow,
    day,
    "Paciente Teste",
    "ficticio@example.test",
    hash(token),
  ];
  await denied("anon", "", issue, ["c".repeat(64), ...args.slice(1)]);
  await denied("anon", "", issue, [secret, "other_location", ...args.slice(2)]);
  await denied("anon", "", issue, [secret, location, id(99), ...args.slice(3)]);
  const past = [...args];
  past[5] = new Date(Date.now() - 60000).toISOString();
  past[6] = past[5].slice(0, 10);
  await denied("anon", "", issue, past, "22023");
  check(
    (await db.query("SELECT count(*)::int AS n FROM public.consultations")).rows[0].n,
    0,
    "Agendamento passado não cria consulta",
  );
  const first = (await as("anon", "", issue, args)).rows[0].data;
  check(first.status, "pending", "Convite autorizado cria consulta");
  check(
    (await as("anon", "", issue, args)).rows[0].data.consultation_id,
    first.consultation_id,
    "Repetição usa a mesma consulta",
  );
  check(
    (await db.query("SELECT count(*)::int AS n FROM public.patients")).rows[0].n,
    1,
    "Repetição não duplica paciente",
  );
  await denied(
    "anon",
    "",
    issue,
    [...args.slice(0, 3), "other_contact_01", ...args.slice(4)],
    "P0003",
  );
  await denied("anon", "", issue, [...args.slice(0, 7), "Outro Nome", ...args.slice(8)], "P0003");
  const link = (
    await db.query(
      "SELECT patient_id FROM public.ghl_patient_links WHERE location_id=$1 AND contact_id=$2",
      [location, args[3]],
    )
  ).rows[0];
  await db.query("DELETE FROM public.ghl_patient_links WHERE location_id=$1 AND contact_id=$2", [
    location,
    args[3],
  ]);
  await denied("anon", "", issue, args, "P0003");
  await db.query(
    "INSERT INTO public.ghl_patient_links(location_id,contact_id,patient_id) VALUES($1,$2,$3)",
    [location, args[3], link.patient_id],
  );
  check(
    (await as("anon", "", issue, args)).rows[0].data.consultation_id,
    first.consultation_id,
    "Vínculo revalidado antes de reutilizar consulta",
  );
  const resolve = "SELECT public.resolve_intake_invitation($1,$2) AS data";
  await denied("anon", "", resolve, [null, token]);
  await denied("anon", "", resolve, ["c".repeat(64), token]);
  await denied("anon", "", resolve, [secret, "c".repeat(64)]);
  const view = (await as("anon", "", resolve, [secret, token])).rows[0].data;
  check(
    Object.keys(view).sort(),
    ["status", "consultation_id", "patient_name", "consultation_date", "expires_at"].sort(),
    "Convite só mostra identidade e data, sem históricos",
  );
  const submit = "SELECT public.submit_intake_invitation($1,$2,$3,$4,$5,$6) AS data";
  const answers = { patientName: "Paciente Teste", consultationDate: day };
  const submission = [secret, token, id(10), answers, "Paciente Teste", true];
  await denied("anon", "", submit, [null, ...submission.slice(1)]);
  await denied("anon", "", submit, [...submission.slice(0, 5), false], "22023");
  await denied(
    "anon",
    "",
    submit,
    [secret, token, id(10), { ...answers, patientName: "Outro Paciente" }, "Outro Paciente", true],
    "22023",
  );
  await denied(
    "anon",
    "",
    submit,
    [secret, token, id(10), { ...answers, consultationDate: "2000-01-01" }, "Paciente Teste", true],
    "22023",
  );
  const receipt = (await as("anon", "", submit, submission)).rows[0].data;
  check(Object.keys(receipt), ["confirmed_at"], "Confirmação devolve só recibo");
  check(
    (await as("anon", "", submit, submission)).rows[0].data,
    receipt,
    "Repetição do envio confirma o mesmo recibo",
  );
  await denied(
    "anon",
    "",
    submit,
    [secret, token, id(11), answers, "Paciente Teste", true],
    "P0003",
  );
  await denied(
    "anon",
    "",
    submit,
    [secret, token, id(10), { ...answers, profession: "Outra" }, "Paciente Teste", true],
    "P0003",
  );
  check(
    Object.keys((await as("anon", "", resolve, [secret, token])).rows[0].data).sort(),
    ["status", "confirmed_at"].sort(),
    "Link usado não permite reler respostas",
  );
  check(
    (await as("anon", "", issue, args)).rows[0].data.status,
    "submitted",
    "Automação recebe indicação de não reenviar",
  );
  const stored = (
    await as(
      "authenticated",
      admin,
      "SELECT submitted_by,invitation_id,consultation_id FROM public.anamnesis_submissions",
    )
  ).rows[0];
  check(stored.submitted_by, null, "Envio sem Google não inventa usuário");
  check(!!stored.invitation_id, true, "Autoria ligada ao convite");
  check(stored.consultation_id, first.consultation_id, "Respostas ligadas à consulta correta");
  check(
    (await as("authenticated", patient, "SELECT * FROM public.anamnesis_submissions")).rows.length,
    0,
    "Outro paciente não lê a anamnese",
  );
  await denied("authenticated", admin, "SELECT token_hash FROM public.intake_invitations");
  await denied(
    "authenticated",
    patient,
    "INSERT INTO public.anamnesis_submissions(id,consultation_id,answers,confirmed_name,accepted,invitation_id) VALUES($1,$2,$3,$4,true,$5)",
    [id(80), first.consultation_id, answers, "Paciente Teste", stored.invitation_id],
  );
  // Same contact, different appointment: stable patient and independent consultation.
  const next = [...args];
  next[4] = "appointment_test_02";
  next[9] = hash("d".repeat(64));
  const second = (await as("anon", "", issue, next)).rows[0].data;
  check(
    second.consultation_id !== first.consultation_id,
    true,
    "Novo atendimento mantém consulta independente",
  );
  check(
    (await db.query("SELECT count(*)::int AS n FROM public.patients")).rows[0].n,
    1,
    "Vínculo usa ID GHL, sem duplicar paciente",
  );
  const moved = [...next];
  moved[5] = new Date(Date.now() + 2 * 86400000).toISOString();
  moved[6] = moved[5].slice(0, 10);
  moved[9] = hash("e".repeat(64));
  await as("anon", "", issue, moved);
  await denied("anon", "", resolve, [secret, "d".repeat(64)]);
  check(
    (await as("anon", "", resolve, [secret, "e".repeat(64)])).rows[0].data.status,
    "pending",
    "Reagendamento revoga link anterior e gera novo",
  );
  await db.query(
    "UPDATE public.intake_invitations SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
    [hash("e".repeat(64))],
  );
  await denied("anon", "", resolve, [secret, "e".repeat(64)]);
  const revoke = "SELECT public.revoke_intake_invitation($1)";
  await denied("authenticated", patient, revoke, [first.consultation_id]);
  await as("authenticated", admin, revoke, [first.consultation_id]);
  await denied("anon", "", resolve, [secret, token]);
  check(
    (await db.query("SELECT count(*)::int AS n FROM public.anamnesis_submissions")).rows[0].n,
    1,
    "Revogação preserva respostas confirmadas",
  );
  for (let n = 3; n < 100; n++) {
    const batch = [...args];
    batch[4] = `appointment_quota_${n}`;
    batch[9] = hash(`quota-${n}`);
    await as("anon", "", issue, batch);
  }
  const overQuota = [...args];
  overQuota[4] = "appointment_over_quota";
  overQuota[9] = hash("over-quota");
  await denied("anon", "", issue, overQuota, "P0001");
  check(
    (await db.query("SELECT count(*)::int AS n FROM public.consultations")).rows[0].n,
    100,
    "Limite não cria consultas parciais",
  );
  await as("authenticated", admin, config, [location, workflow, "0".repeat(64), false]);
  await denied("anon", "", issue, args);
  check(
    (await db.query("SELECT to_regclass('public.consultation_analyses') IS NULL AS absent")).rows[0]
      .absent,
    true,
    "Migração independente da análise por IA",
  );
  console.log(`${checks} verificações PostgreSQL de convites aprovadas`);
} finally {
  await db.close();
}
