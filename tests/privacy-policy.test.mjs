import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("src/routes/privacidade.tsx", "utf8");
const gate = readFileSync("src/components/AccessBoundary.tsx", "utf8");

/** Fatos que só o responsável pelo tratamento pode confirmar. */
const facts = [...page.matchAll(/export const PRIVACY_(?:RESPONSIBLE|RESPONSIBLE_ID|CONTACT|RETENTION) = "([^"]*)"/g)].map(
  (match) => match[1],
);

test("the policy page states responsible party, contact and retention", () => {
  assert.equal(facts.length, 4, "faltam dados do responsável na página da política");
});

test("an unfinished policy is never presented silently as final", () => {
  const incomplete = facts.some((value) => value.startsWith("[preencher"));
  const warns = /role="status"/.test(page);
  assert.ok(
    !incomplete || warns,
    "com dados por confirmar, a página precisa exibir o aviso de texto em revisão",
  );
});

test("the policy is reachable from the patient form and the sign-in screen", () => {
  assert.match(gate, /"\/privacidade"/, "a política precisa continuar pública sem sessão");
  assert.match(readFileSync("src/routes/anamnese.tsx", "utf8"), /to="\/privacidade"/);
  assert.match(readFileSync("src/routes/login.tsx", "utf8"), /to="\/privacidade"/);
});

test("the policy page reads nothing from the clinical backend", () => {
  assert.doesNotMatch(page, /supabase|@\/integrations/);
});

test("the policy page has its own title and self-referencing address", () => {
  assert.match(page, /title: "Política de Privacidade — Dr\. João Falcão"/);
  assert.match(
    page,
    /rel: "canonical",\s*href: "https:\/\/jf-bio-insight\.lovable\.app\/privacidade"/,
  );
});
