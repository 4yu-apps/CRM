import { describe, it, expect, beforeAll } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { TRANSITIONS, STATUS_META, STATUS_ORDER, canTransition, nextStatuses } from "./state-machine";
import type { LeadStatus } from "./types";

// A maquina de estados vive em QUATRO lugares que precisam concordar:
//
//   1. supabase/migrations  (fonte da verdade, um trigger valida)
//   2. front/src/lib/state-machine.ts
//   3. esteira/.../state_machine.py
//   4. extension/src/lib/state-machine.mjs
//
// Ate agora isso era mantido no olho. Quando divergem, o sintoma nao e um erro
// de build: e um botao que aparece na tela, o usuario clica, e o banco responde
// "Transicao de status invalida" em producao.
//
// Estes testes leem as OUTRAS pontas de verdade (SQL e o .mjs da extensao) e
// comparam. Nao exigem igualdade: o front oferece menos que o banco de
// proposito, e a extensao menos ainda (ela segue o passo a passo do WhatsApp).
// O que nao pode e alguem oferecer o que o banco recusa.

// Modulo .mjs compartilhado com o validador do schema (scripts/db:validate).
import { applyMigrations } from "../../../scripts/schema-offline.mjs";

// Raiz do monorepo, pra alcancar a extensao (que fica fora do front).
const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * Verdade do schema: as migrations aplicadas num Postgres de verdade (pglite,
 * em memoria, sem docker). E o mesmo caminho do `npm run db:validate`.
 *
 * A primeira versao disto lia o SQL com expressao regular e deu errado na hora:
 * ignorou a migration que insere transicoes por cross join de arrays em vez de
 * VALUES, e acusou 22 divergencias que nao existiam. Perguntar pro banco nao
 * tem esse problema, e nenhuma sintaxe futura de migration vai enganar.
 */
let bancoEstados: Set<string>;
let bancoTransicoes: Set<string>;

beforeAll(async () => {
  const db = await applyMigrations();
  const estados = await db.query<{ enumlabel: string }>(
    `select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'lead_status'`,
  );
  const trans = await db.query<{ from_status: string; to_status: string }>(
    `select from_status, to_status from public.lead_status_transitions`,
  );
  bancoEstados = new Set(estados.rows.map((r) => r.enumlabel));
  bancoTransicoes = new Set(trans.rows.map((r) => `${r.from_status}->${r.to_status}`));
}, 60_000);

describe("o schema subiu", () => {
  it("tem estados e transicoes de verdade", () => {
    expect(bancoEstados.size).toBeGreaterThanOrEqual(15);
    expect(bancoTransicoes.size).toBeGreaterThanOrEqual(68);
  });
});

describe("front x banco", () => {
  it("todo estado do front existe no enum do banco", () => {
    const sobrando = STATUS_ORDER.filter((s) => !bancoEstados.has(s));
    expect(sobrando).toEqual([]);
  });

  it("todo estado do banco tem rotulo no front", () => {
    const semRotulo = [...bancoEstados].filter((s) => !(s in STATUS_META));
    expect(semRotulo).toEqual([]);
  });

  it("toda transicao que o front oferece o banco aceita", () => {
    const invalidas: string[] = [];
    for (const [from, tos] of Object.entries(TRANSITIONS)) {
      for (const to of tos) {
        if (!bancoTransicoes.has(`${from}->${to}`)) invalidas.push(`${from}->${to}`);
      }
    }
    // Cada item aqui e um botao que o usuario clica e o banco recusa.
    expect(invalidas).toEqual([]);
  });
});

describe("extensao x banco", () => {
  it("toda transicao que a extensao oferece o banco aceita", async () => {
    const caminho = join(RAIZ, "extension", "src", "lib", "state-machine.mjs");
    const ext = (await import(pathToFileURL(caminho).href)) as {
      TRANSITIONS: Record<string, string[]>;
    };
    const invalidas: string[] = [];
    for (const [from, tos] of Object.entries(ext.TRANSITIONS)) {
      for (const to of tos) {
        if (!bancoTransicoes.has(`${from}->${to}`)) invalidas.push(`${from}->${to}`);
      }
    }
    expect(invalidas).toEqual([]);
  });
});

describe("esteira x banco", () => {
  it("toda transicao que a esteira faz o banco aceita", async () => {
    // A esteira e Python, entao aqui o jeito e ler o arquivo. O dict e literal e
    // o formato e estavel; se um dia deixar de casar, o piso abaixo acusa em vez
    // de passar com conjunto vazio.
    const { readFile } = await import("node:fs/promises");
    const py = await readFile(
      join(RAIZ, "esteira", "src", "garimpo_esteira", "state_machine.py"),
      "utf8",
    );
    const bloco = /TRANSITIONS[^=]*=\s*\{([\s\S]*?)\n\}/.exec(py);
    expect(bloco, "nao achei o dict TRANSITIONS no state_machine.py").not.toBeNull();

    const invalidas: string[] = [];
    let achou = 0;
    for (const linha of bloco![1].matchAll(/"([a-z_]+)"\s*:\s*\(([^)]*)\)/g)) {
      const from = linha[1];
      for (const alvo of linha[2].matchAll(/"([a-z_]+)"/g)) {
        achou++;
        if (!bancoTransicoes.has(`${from}->${alvo[1]}`)) invalidas.push(`${from}->${alvo[1]}`);
      }
    }
    expect(achou, "o dict do Python foi lido vazio").toBeGreaterThanOrEqual(10);
    expect(invalidas).toEqual([]);
  });
});

describe("guarda LGPD", () => {
  it("opt-out bloqueia qualquer passo que leve a contato", () => {
    expect(canTransition("qualificado", "rascunho_pronto", false)).toBe(true);
    expect(canTransition("qualificado", "rascunho_pronto", true)).toBe(false);
    expect(canTransition("rascunho_pronto", "aprovado", true)).toBe(false);
    expect(canTransition("aprovado", "enviado", true)).toBe(false);
  });

  it("opt-out nao impede sair do funil", () => {
    expect(canTransition("qualificado", "descartado", true)).toBe(true);
  });

  it("transicao que nao existe no grafo e recusada mesmo sem opt-out", () => {
    expect(canTransition("bruto", "fechado", false)).toBe(false);
  });
});

describe("formato do grafo", () => {
  it("todo estado tem entrada em TRANSITIONS e em STATUS_META", () => {
    for (const s of STATUS_ORDER) {
      expect(TRANSITIONS[s], `TRANSITIONS sem ${s}`).toBeDefined();
      expect(STATUS_META[s], `STATUS_META sem ${s}`).toBeDefined();
    }
  });

  it("nenhum estado aponta pra si mesmo", () => {
    for (const [from, tos] of Object.entries(TRANSITIONS)) {
      expect(tos, `${from} aponta pra si mesmo`).not.toContain(from);
    }
  });

  it("nenhum destino e um estado que nao existe", () => {
    const conhecidos = new Set<string>(STATUS_ORDER);
    for (const [from, tos] of Object.entries(TRANSITIONS)) {
      for (const to of tos) {
        expect(conhecidos.has(to), `${from}->${to} aponta pra estado inexistente`).toBe(true);
      }
    }
  });

  it("todo estado de saida tem volta, senao o lead fica preso", () => {
    // fechado deixou de ser terminal de proposito (da pra reabrir), e os
    // arquivados reativam. Se algum ficar sem saida, e engano, nao decisao.
    const saidas: LeadStatus[] = ["descartado", "sem_interesse", "perdido", "fechado"];
    for (const s of saidas) {
      expect(nextStatuses(s).length, `${s} nao tem volta`).toBeGreaterThan(0);
    }
  });
});
