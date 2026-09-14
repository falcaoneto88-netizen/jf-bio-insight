import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  STORAGE_KEY,
  RETENTION_MS,
  emptyDays,
  parseGoal,
  restoreChecklist,
  serializeChecklist,
  readSaved,
} from "../public/hiper-hidratacao.js";

test("meta em ml aceita inteiros e milhares brasileiros sem prescrever pelo peso", () => {
  for (const value of ["2450", "2.450", " 2450 "]) assert.equal(parseGoal(value), 2450);
  for (const value of [
    "",
    "0",
    "-100",
    "NaN",
    "2,450",
    "24.50",
    "70kg",
    "2e3",
    "10001",
    "<script>",
    "2450ml",
  ])
    assert.equal(parseGoal(value), null);
});

test("dias independentes e restauração apenas de booleanos válidos", () => {
  const days = emptyDays();
  days[0][0] = true;
  assert.equal(days[1][0], false);
  const now = Date.now();
  const restored = restoreChecklist(serializeChecklist(days, now), now);
  assert.equal(restored.days[0][0], true);
  assert.equal(restored.days[1][0], false);
  assert.equal(restoreChecklist(JSON.stringify({ ...restored, days: [["false"]] }), now), null);
  assert.equal(restoreChecklist("invalid"), null);
});

test("checklist expira, rejeita versões futuras e não recupera outros dados pessoais", () => {
  const now = Date.now();
  const saved = {
    version: 1,
    createdAt: now,
    days: emptyDays(),
    name: "Dado de teste",
    goal: 2450,
  };
  assert.deepEqual(Object.keys(restoreChecklist(JSON.stringify(saved), now)), [
    "version",
    "createdAt",
    "days",
  ]);
  assert.equal(restoreChecklist(JSON.stringify(saved), now + RETENTION_MS), null);
  assert.equal(restoreChecklist(JSON.stringify(saved), now - 1), null);
  assert.equal(restoreChecklist(JSON.stringify({ ...saved, version: 2 }), now), null);
});

test("armazenamento inválido é removido, indisponibilidade permite continuar sem salvar", () => {
  const calls = [];
  assert.deepEqual(readSaved({ getItem: () => "invalid", removeItem: (key) => calls.push(key) }), {
    saved: null,
    available: true,
  });
  assert.deepEqual(calls, [STORAGE_KEY]);
  assert.deepEqual(
    readSaved({
      getItem: () => {
        throw Error("blocked");
      },
    }),
    { saved: null, available: false },
  );
});

test("página não contém campos GHL soltos, rastreamento de compra ou conexão externa de dados", async () => {
  const html = await readFile(new URL("../public/hiper-hidratacao.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /\{\{|google\.com\/aclk|onerror=/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.doesNotMatch(html, /Prévia para revisão clínica|Versão para revisão|em avaliação/);
});
