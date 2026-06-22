import { test } from "node:test";
import assert from "node:assert/strict";
import { matchLead, parsePhone } from "../src/lib/match.mjs";

const LEADS = [
  { id: "a", business_name: "Studio Bella Estetica", phone: "44999990002" },
  { id: "b", business_name: "Hamburgueria do Ze", phone: "44999990003" },
  { id: "c", business_name: "Studio Bella Spa", phone: "44999990010" },
];

test("parsePhone extrai numero de texto livre", () => {
  assert.equal(parsePhone("+55 44 99999-0002"), "44999990002");
  assert.equal(parsePhone("(44) 99999-0003"), "44999990003");
  assert.equal(parsePhone("Studio Bella"), null);
});

test("casa por numero (prioridade)", () => {
  const r = matchLead({ phone: "(44) 99999-0002", name: "qualquer" }, LEADS);
  assert.equal(r.method, "phone");
  assert.equal(r.lead.id, "a");
});

test("casa por nome quando nao ha numero", () => {
  const r = matchLead({ phone: null, name: "Hamburgueria do Ze" }, LEADS);
  assert.equal(r.method, "name");
  assert.equal(r.lead.id, "b");
});

test("nome ignora acento/caixa", () => {
  const r = matchLead({ name: "HAMBÚRGUERIA DO ZÉ" }, [
    { id: "b", business_name: "Hamburgueria do Ze", phone: "x" },
  ]);
  assert.equal(r.lead?.id, "b");
});

test("nome ambiguo nao escolhe sozinho", () => {
  const r = matchLead({ name: "Studio Bella" }, LEADS);
  assert.equal(r.method, "ambiguous");
  assert.equal(r.candidates.length, 2);
});

test("sem match retorna none", () => {
  const r = matchLead({ phone: "11888887777", name: "Inexistente" }, LEADS);
  assert.equal(r.method, "none");
  assert.equal(r.lead, null);
});

test("numero casa mesmo com nome divergente (contato salvo com apelido)", () => {
  const r = matchLead({ phone: "44999990002", name: "Maria do Studio" }, LEADS);
  assert.equal(r.lead.id, "a");
  assert.equal(r.method, "phone");
});

test("casa o numero em QUALQUER formato (parenteses, traco, espaco, +55, zero)", () => {
  const leads = [{ id: "x", business_name: "Vi", phone: "44988557262" }];
  for (const fmt of [
    "44988557262",
    "(44) 98855-7262",
    "44 98855 7262",
    "+55 44 98855-7262",
    "55 44 9 8855 7262",
    "  44 98855 7262  ", // espacos nas pontas
  ]) {
    assert.equal(matchLead({ phone: fmt }, leads).lead?.id, "x", `formato: ${fmt}`);
  }
});

test("casa celular BR com o 9 a MAIS ou a MENOS", () => {
  // lead salvo SEM o 9; conversa traz COM o 9 -> casa
  const semNove = [{ id: "s", business_name: "Vi", phone: "4488557262" }];
  assert.equal(matchLead({ phone: "44988557262" }, semNove).lead?.id, "s");
  assert.equal(matchLead({ phone: "+55 44 98855-7262" }, semNove).lead?.id, "s");
  // lead salvo COM o 9; conversa traz SEM o 9 -> casa
  const comNove = [{ id: "c", business_name: "Vi", phone: "44988557262" }];
  assert.equal(matchLead({ phone: "4488557262" }, comNove).lead?.id, "c");
  assert.equal(matchLead({ phone: "554488557262" }, comNove).lead?.id, "c");
});

test("nao confunde numeros realmente diferentes", () => {
  const leads = [{ id: "a", business_name: "A", phone: "44988557262" }];
  assert.equal(matchLead({ phone: "44988557263" }, leads).method, "none");
  assert.equal(matchLead({ phone: "11988557262" }, leads).method, "none"); // DDD diferente
});
