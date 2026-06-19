import { test } from "node:test";
import assert from "node:assert/strict";
import { contextualButtons, transitionLabel, TRANSITIONS } from "../src/lib/state-machine.mjs";

test("botoes contextuais do status 'enviado' (secao 6 do mapa)", () => {
  const btns = contextualButtons("enviado");
  const labels = btns.map((b) => b.label);
  assert.deepEqual(labels, ["Respondeu", "Sem resposta", "Numero errado"]);
  assert.ok(btns.every((b) => !b.blocked));
});

test("botoes do status 'respondeu' incluem 'Agendou reuniao'", () => {
  const labels = contextualButtons("respondeu").map((b) => b.label);
  assert.deepEqual(labels, ["Interessado", "Sem interesse", "Agendou reuniao"]);
});

test("opt-out bloqueia botoes de contato", () => {
  const btns = contextualButtons("rascunho_pronto", true);
  const aprovar = btns.find((b) => b.to === "aprovado");
  assert.equal(aprovar.blocked, true);
});

test("status final nao tem botoes", () => {
  assert.equal(contextualButtons("fechado").length, 0);
  assert.equal(contextualButtons("perdido").length, 0);
  assert.equal(contextualButtons("sem_interesse").length, 0);
});

test("descartado pode ser reativado", () => {
  const labels = contextualButtons("descartado").map((b) => b.label);
  assert.deepEqual(labels, ["Reativar"]);
});

test("transitionLabel usa rotulo custom ou o padrao", () => {
  assert.equal(transitionLabel("enviado", "descartado"), "Numero errado");
  assert.equal(transitionLabel("bruto", "enriquecido"), "Enriquecer");
});

test("toda transicao do mapa esta coberta", () => {
  assert.ok(TRANSITIONS.enviado.includes("respondeu"));
  assert.ok(TRANSITIONS.proposta.includes("fechado"));
  assert.equal(TRANSITIONS.fechado.length, 0);
});
