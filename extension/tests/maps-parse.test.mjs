// Testes do parser de cards do Google Maps.
// Usa HTML fixture estatico que imita a estrutura do Maps — sem acesso real
// a rede ou DOM do Chrome. Cada fixture cobre um cenario de campo faltando.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractPlaceId,
  parseRatingText,
  parseState,
  parseCity,
  parseCard,
  parseResultsList,
} from "../src/lib/maps-parse.mjs";

// Node.js nao tem HTMLElement — simulamos um subconjunto minimo via JSDOM-lite.
// Evitamos instalar jsdom (sem libs novas); usamos a implementacao built-in
// disponivel no Node 18+ via --experimental-vm-modules... mas para manter
// compatibilidade total sem flags, implementamos um mock DOM minimalista.

function fakeEl(html) {
  // Cria um objeto que imita HTMLElement com querySelector/querySelectorAll
  // usando expressoes regulares simples para os selectors usados pelo parser.
  const els = parseHtmlToNodes(html);
  return makeEl(els, html);
}

// Parser HTML minimalista para fixtures de teste.
// Suporta: tags, atributos (incluindo href, aria-label, role), texto.
function parseHtmlToNodes(html) {
  const nodes = [];
  const tagRe = /<(\/?)([\w-]+)([^>]*)>/g;
  const stack = [{ tag: "#root", attrs: {}, children: [], text: "" }];
  let lastIndex = 0;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const text = html.slice(lastIndex, m.index).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    if (text.trim()) stack[stack.length - 1].text += text;
    lastIndex = tagRe.lastIndex;
    const [, close, tag, rawAttrs] = m;
    if (close) {
      if (stack.length > 1) {
        const done = stack.pop();
        stack[stack.length - 1].children.push(done);
      }
    } else {
      const attrs = {};
      const attrRe = /([\w-]+)(?:="([^"]*)")?/g;
      let am;
      while ((am = attrRe.exec(rawAttrs)) !== null) {
        attrs[am[1]] = am[2] !== undefined ? am[2] : "";
      }
      const node = { tag, attrs, children: [], text: "" };
      if (rawAttrs.trimEnd().endsWith("/")) {
        stack[stack.length - 1].children.push(node);
      } else {
        stack.push(node);
      }
    }
  }
  // Texto restante
  const rem = html.slice(lastIndex);
  if (rem.trim()) stack[stack.length - 1].text += rem;
  return stack[0];
}

function makeEl(node, _html) {
  // Achata arvore para facilitar querySelector
  function flatten(n) {
    return [n, ...n.children.flatMap(flatten)];
  }
  const all = flatten(node);

  function matchSelector(n, sel) {
    // Suporta: tag, [attr], [attr*=val], [attr="val"], tag[attr], tag[attr*=val]
    if (!sel) return false;

    // Multiplos seletores separados por virgula
    if (sel.includes(",")) {
      return sel.split(",").some((s) => matchSelector(n, s.trim()));
    }

    // tag[attr*=val]
    const tagAttrContains = sel.match(/^([\w-]+)\[([^\]]+)\*=["']?([^"'\]]+)["']?\]$/);
    if (tagAttrContains) {
      const [, tag, attr, val] = tagAttrContains;
      return n.tag === tag && (n.attrs[attr] || "").includes(val);
    }
    // tag[attr="val"]
    const tagAttrEq = sel.match(/^([\w-]+)\[([^\]]+)=["']?([^"'\]]+)["']?\]$/);
    if (tagAttrEq) {
      const [, tag, attr, val] = tagAttrEq;
      return n.tag === tag && n.attrs[attr] === val;
    }
    // tag[attr] (atributo existente, sem valor)
    const tagAttrOnly = sel.match(/^([\w-]+)\[([^\]]+)\]$/);
    if (tagAttrOnly) {
      const [, tag, attr] = tagAttrOnly;
      return n.tag === tag && attr in n.attrs;
    }
    // [attr*="val"] ou [attr*=val]
    const attrContains = sel.match(/^\[([^\]]+)\*=["']?([^"'\]]+)["']?\]$/);
    if (attrContains) {
      const [, attr, val] = attrContains;
      return (n.attrs[attr] || "").includes(val);
    }
    // [attr="val"]
    const attrEq = sel.match(/^\[([^\]]+)=["']?([^"'\]]+)["']?\]$/);
    if (attrEq) {
      const [, attr, val] = attrEq;
      return n.attrs[attr] === val;
    }
    // [attr]
    const attrOnly = sel.match(/^\[([^\]]+)\]$/);
    if (attrOnly) return attrOnly[1] in n.attrs;
    // tag
    return n.tag === sel;
  }

  function makeNode(n) {
    const allDesc = flatten(n);
    const obj = {
      getAttribute: (a) => n.attrs[a] !== undefined ? n.attrs[a] : null,
      get textContent() {
        function collect(x) {
          return x.text + x.children.map(collect).join("");
        }
        return collect(n);
      },
      querySelectorAll(sel) {
        return allDesc.slice(1).filter((d) => matchSelector(d, sel)).map(makeNode);
      },
      querySelector(sel) {
        const r = allDesc.slice(1).find((d) => matchSelector(d, sel));
        return r ? makeNode(r) : null;
      },
      closest(sel) {
        // Para testes, retorna o proprio elemento se bater
        return matchSelector(n, sel) ? obj : null;
      },
      get parentElement() { return null; },
    };
    return obj;
  }

  return makeNode(node);
}

// ---- fixtures ----

// Card completo: nome, nota, avaliacoes, categoria, endereco, link com place_id
const FULL_CARD_HTML = `
<div role="article">
  <a href="/maps/place/Studio+Bella+Estetica/!1sChIJN1t_tDeuEmsRUsoyG83frY4!4m..." aria-label="Studio Bella Estetica">Studio Bella Estetica</a>
  <span aria-label="4,3 estrelas de 5, com base em 127 avaliacoes">4,3</span>
  <span>Salao de beleza</span>
  <span aria-label="Endereco: Rua Maringa, 100, Maringa - PR">Rua Maringa, 100, Maringa - PR</span>
</div>`;

// Card sem nota nem avaliacoes (novo negocio sem avaliacao)
const NO_RATING_CARD_HTML = `
<div role="article">
  <a href="/maps/place/Hamburgueria+do+Ze/!1sChIJABCDEFGH!8m..." aria-label="Hamburgueria do Ze">Hamburgueria do Ze</a>
  <span>Hamburgueria</span>
</div>`;

// Card com campo endereco faltando
const NO_ADDRESS_CARD_HTML = `
<div role="article">
  <a href="/maps/place/Clinica+Saude+Total/!1sChIJXXXYYYZZZ!4m..." aria-label="Clinica Saude Total">Clinica Saude Total</a>
  <span aria-label="4,8 estrelas de 5, com base em 312 avaliacoes">4,8</span>
  <span>Clinica medica</span>
</div>`;

// Card com telefone (botao "Ligar") e site (link externo) — Maps mostra isso
// em muitos resultados. Sem telefone o lead seria descartado (nao da WhatsApp).
const CARD_WITH_CONTACT_HTML = `
<div role="article">
  <a href="/maps/place/Pizzaria+Boa/!1sChIJPHONE123!4m..." aria-label="Pizzaria Boa">Pizzaria Boa</a>
  <span aria-label="4,6 estrelas de 5, com base em 200 avaliacoes">4,6</span>
  <span>Pizzaria</span>
  <button aria-label="Ligar para Pizzaria Boa: (44) 99876-5432">Ligar</button>
  <a href="https://pizzariaboa.com.br" aria-label="Visitar site: pizzariaboa.com.br">Site</a>
</div>`;

// Lista com 2 cards
const LIST_HTML = `
<div>
  ${FULL_CARD_HTML}
  ${NO_RATING_CARD_HTML}
</div>`;

// ---- testes unitarios ----

test("extractPlaceId extrai place_id do formato !1s...", () => {
  const href = "/maps/place/Studio+Bella/!1sChIJN1t_tDeuEmsRUsoyG83frY4!4m6!";
  assert.equal(extractPlaceId(href), "ChIJN1t_tDeuEmsRUsoyG83frY4");
});

test("extractPlaceId retorna vazio para href sem place_id", () => {
  assert.equal(extractPlaceId(""), "");
  assert.equal(extractPlaceId(null), "");
  assert.equal(extractPlaceId("/maps/"), "");
});

test("parseRatingText extrai nota e avaliacoes", () => {
  const r = parseRatingText("4,3 estrelas de 5, com base em 127 avaliacoes");
  assert.equal(r.rating, 4.3);
  assert.equal(r.reviews_count, 127);
});

test("parseRatingText retorna null para texto sem nota", () => {
  const r = parseRatingText("Salao de beleza");
  assert.equal(r.rating, null);
  assert.equal(r.reviews_count, null);
});

test("parseRatingText aceita ponto como separador", () => {
  const r = parseRatingText("4.8 (312)");
  assert.equal(r.rating, 4.8);
  assert.equal(r.reviews_count, 312);
});

test("parseState extrai UF do endereco", () => {
  assert.equal(parseState("Rua Maringa, 100, Maringa - PR"), "PR");
  assert.equal(parseState("Av. Paulista, 900, Sao Paulo - SP"), "SP");
  assert.equal(parseState("Sem endereco"), "");
});

test("parseCity extrai cidade do endereco", () => {
  assert.equal(parseCity("Rua Maringa, 100, Maringa - PR"), "Maringa");
  assert.equal(parseCity(""), "");
});

test("parseCard extrai card completo", () => {
  const card = fakeEl(FULL_CARD_HTML);
  const r = parseCard(card);
  assert.ok(r, "parseCard deve retornar objeto");
  assert.equal(r.business_name, "Studio Bella Estetica");
  assert.ok(r.maps_place_id.includes("ChIJN1t"), `place_id esperado, recebeu: ${r.maps_place_id}`);
  assert.ok(r.maps_url.includes("google.com"), `maps_url deve ter google.com, recebeu: ${r.maps_url}`);
  assert.equal(r.rating, 4.3);
  assert.equal(r.reviews_count, 127);
  assert.ok(r.address.includes("Maringa"), `address deve ter Maringa, recebeu: ${r.address}`);
  assert.equal(r.state, "PR");
});

test("parseCard degrada quando rating ausente", () => {
  const card = fakeEl(NO_RATING_CARD_HTML);
  const r = parseCard(card);
  assert.ok(r, "deve retornar resultado mesmo sem rating");
  assert.equal(r.business_name, "Hamburgueria do Ze");
  assert.equal(r.rating, null);
  assert.equal(r.reviews_count, null);
});

test("parseCard degrada quando endereco ausente", () => {
  const card = fakeEl(NO_ADDRESS_CARD_HTML);
  const r = parseCard(card);
  assert.ok(r, "deve retornar resultado mesmo sem endereco");
  assert.equal(r.business_name, "Clinica Saude Total");
  assert.equal(r.rating, 4.8);
  assert.equal(r.reviews_count, 312);
  // address pode ser vazio mas nao deve lancar erro
  assert.equal(typeof r.address, "string");
});

test("parseCard retorna null para elemento null", () => {
  assert.equal(parseCard(null), null);
});

test("parseCard extrai telefone e site quando o Maps mostra", () => {
  const card = fakeEl(CARD_WITH_CONTACT_HTML);
  const r = parseCard(card);
  assert.ok(r.phone && r.phone.replace(/\D/g, "").length >= 10,
    `telefone esperado, recebeu: ${r.phone}`);
  assert.ok(r.website && r.website.includes("pizzariaboa"),
    `site esperado, recebeu: ${r.website}`);
});

test("parseCard sem contato deixa telefone e site vazios", () => {
  const r = parseCard(fakeEl(FULL_CARD_HTML));
  assert.equal(r.phone, "");
  assert.equal(r.website, "");
});

test("parseResultsList extrai multiplos cards", () => {
  const root = fakeEl(LIST_HTML);
  const results = parseResultsList(root);
  assert.ok(results.length >= 2, `esperado >= 2 resultados, recebeu ${results.length}`);
  const names = results.map((r) => r.business_name);
  assert.ok(names.some((n) => n.includes("Studio Bella")));
  assert.ok(names.some((n) => n.includes("Hamburgueria")));
});

test("parseResultsList retorna array vazio para root null", () => {
  assert.deepEqual(parseResultsList(null), []);
});

// ---- teste de insertLead com mock fetch ----
test("insertLead retorna null em HTTP 409 (duplicata)", async () => {
  // Importa apenas o modulo de repo e simula fetch
  const { createRepo } = await import("../src/lib/repo.mjs");

  // Mock de cfg supabase
  const cfg = {
    dataSource: "supabase",
    supabaseUrl: "https://fake.supabase.co",
    anonKey: "anon",
    accessToken: "token",
  };

  // Substitui fetch global temporariamente
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 409, text: async () => "conflict" });

  try {
    const repo = createRepo(cfg);
    const id = await repo.insertLead({ business_name: "Teste", maps_place_id: "ChIJXXX" });
    assert.equal(id, null, "409 deve retornar null");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("insertLead retorna id em insercao bem sucedida", async () => {
  const { createRepo } = await import("../src/lib/repo.mjs");
  const cfg = {
    dataSource: "supabase",
    supabaseUrl: "https://fake.supabase.co",
    anonKey: "anon",
    accessToken: "token",
  };
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 201,
    json: async () => [{ id: "uuid-gerado-pelo-banco" }],
  });
  try {
    const repo = createRepo(cfg);
    const id = await repo.insertLead({ business_name: "Novo negocio", maps_place_id: "ChIJYYY" });
    assert.equal(id, "uuid-gerado-pelo-banco");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("insertLead lanca erro em status 500", async () => {
  const { createRepo } = await import("../src/lib/repo.mjs");
  const cfg = {
    dataSource: "supabase",
    supabaseUrl: "https://fake.supabase.co",
    anonKey: "anon",
    accessToken: "token",
  };
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => "internal error" });
  try {
    const repo = createRepo(cfg);
    await assert.rejects(() => repo.insertLead({ business_name: "Erro" }), /insertLead: 500/);
  } finally {
    globalThis.fetch = origFetch;
  }
});
