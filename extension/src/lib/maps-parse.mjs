// Parser de resultados do Google Maps. Modulo PURO (sem acesso ao DOM global)
// para facilitar testes com Node.js. Recebe um elemento de card e extrai os
// campos disponiveis. Cada campo ausente retorna string vazia ou null, nunca
// derruba a captura.

// Extrai o place_id de um href tipo:
//   /maps/place/.../data=!3m1!4b1!4m6!3m5!1s0x...!8m2!3d..!4d..!16s...
//   ou via parametro ?placeid=...
export function extractPlaceId(href) {
  if (!href) return "";
  // Formato mais comum: !1s<place_id> na URL data=
  const m1 = href.match(/[!,]1s([A-Za-z0-9_:-]{10,})/);
  if (m1) return m1[1];
  // Fallback: ?placeid=...
  try {
    const u = new URL(href, "https://www.google.com");
    const p = u.searchParams.get("placeid") || u.searchParams.get("place_id");
    if (p) return p;
  } catch (_) { /* ignore */ }
  return "";
}

// Extrai rating e numero de avaliacoes de um texto.
// Suporta formatos:
//   "4,3 (127)"
//   "4.3 stars based on 127 reviews"
//   "4,3 estrelas de 5, com base em 127 avaliacoes"
//   "4,3 (1.234)"  -- milhar com ponto
// Aceita virgula ou ponto como separador decimal na nota.
export function parseRatingText(text) {
  if (!text) return { rating: null, reviews_count: null };

  // Nota: digito, separador (virgula ou ponto), digito
  const ratingMatch = text.match(/\b(\d)[,.](\d)\b/);
  if (!ratingMatch) return { rating: null, reviews_count: null };
  const rating = parseFloat(`${ratingMatch[1]}.${ratingMatch[2]}`);

  // Avaliacoes: numero inteiro apos a nota, ignorando a escala (ex: "de 5").
  // Estrategia: extrai todos os inteiros apos a nota e pega o maior que
  // seja > 5 (escala maxima de nota), ou o ultimo numero se nenhum for > 5.
  const afterRating = text.slice(text.indexOf(ratingMatch[0]) + ratingMatch[0].length);
  // Captura todos os tokens numericos (com separador de milhar opcional)
  const allNums = [...afterRating.matchAll(/\b(\d[\d.,]*\d|\d)\b/g)]
    .map((m) => parseInt(m[1].replace(/[.,]/g, ""), 10))
    .filter((n) => !isNaN(n));

  let reviews_count = null;
  if (allNums.length > 0) {
    // Prefere o primeiro numero maior que 5 (a escala de rating)
    const big = allNums.find((n) => n > 5);
    reviews_count = big !== undefined ? big : allNums[allNums.length - 1];
  }

  return {
    rating: isNaN(rating) ? null : Math.min(5, Math.max(0, rating)),
    reviews_count,
  };
}

// Extrai o estado (UF 2 letras) de um endereco como "Rua X, 123, Maringa - PR".
export function parseState(address) {
  if (!address) return "";
  const m = address.match(/[-,]\s*([A-Z]{2})\s*(?:\d{5}|$)/);
  return m ? m[1] : "";
}

// Extrai cidade do endereco: tenta pegar o trecho antes do " - UF".
export function parseCity(address) {
  if (!address) return "";
  const m = address.match(/,\s*([^,]+?)\s*-\s*[A-Z]{2}/);
  return m ? m[1].trim() : "";
}

// Dado um elemento de card do Google Maps (HTMLElement), extrai os campos
// relevantes para um lead bruto. Cada campo degrada graciosamente.
//
// Estrategia de selecao:
//   - Usa aria-label, role, data-*, href patterns ao inves de classes CSS.
//   - Fallback para posicao/estrutura quando necessario.
//   - Classes minificadas do Maps mudam: evitamos depender delas como primary.
export function parseCard(card) {
  if (!card) return null;

  // Nome: o link principal do card tem aria-label com o nome do negocio,
  // ou o primeiro heading/span em negrito.
  let business_name = "";
  const nameLink = card.querySelector('a[aria-label]');
  if (nameLink) {
    business_name = (nameLink.getAttribute("aria-label") || "").trim();
  }
  if (!business_name) {
    // Fallback: primeiro span/div em data-value ou role="heading"
    const h = card.querySelector('[role="heading"], [role="img"][aria-label]');
    business_name = h ? (h.getAttribute("aria-label") || h.textContent || "").trim() : "";
  }
  if (!business_name) {
    // Ultimo fallback: textContent do primeiro filho com texto substancial
    for (const el of card.querySelectorAll("span, div")) {
      const t = (el.textContent || "").trim();
      if (t.length > 2 && t.length < 120 && !t.includes("\n")) {
        business_name = t;
        break;
      }
    }
  }

  // URL e place_id: link principal do card
  let maps_url = "";
  let maps_place_id = "";
  const linkEl = card.querySelector('a[href*="/maps/"]') ||
                 card.querySelector('a[href*="google.com/maps"]');
  if (linkEl) {
    const href = linkEl.getAttribute("href") || "";
    maps_url = href.startsWith("http") ? href : `https://www.google.com${href}`;
    maps_place_id = extractPlaceId(href);
  }

  // Rating e avaliacoes: busca elemento com aria-label descrevendo avaliacao
  // ex: aria-label="4,3 estrelas de 5, com base em 127 avaliacoes"
  let rating = null;
  let reviews_count = null;
  const ratingEl = card.querySelector('[aria-label*="estrela"], [aria-label*="star"], [aria-label*="avalia"]');
  if (ratingEl) {
    const label = ratingEl.getAttribute("aria-label") || ratingEl.textContent || "";
    const parsed = parseRatingText(label);
    rating = parsed.rating;
    reviews_count = parsed.reviews_count;
  }
  // Se nao achou pelo aria-label, tenta varredura de texto
  if (rating === null) {
    for (const el of card.querySelectorAll("span")) {
      const t = (el.textContent || "").trim();
      if (/^[\d][,.][\d]$/.test(t)) {
        rating = parseFloat(t.replace(",", "."));
        break;
      }
    }
  }

  // Categoria: vem normalmente num span/div apos o rating, sem link
  // Estrategia: busca texto que parece categoria (curto, sem digitos, sem virgula)
  let category = "";
  // Tenta via aria-label especifico de categoria
  const catEl = card.querySelector('[jsaction*="category"], [data-value*="category"]');
  if (catEl) category = (catEl.textContent || "").trim();
  // Fallback heuristico: span curto sem numeros que aparece depois do rating
  if (!category) {
    const spans = Array.from(card.querySelectorAll("span"));
    for (const sp of spans) {
      const t = (sp.textContent || "").trim();
      if (t.length > 1 && t.length < 60 &&
          !/\d/.test(t) &&
          !t.includes("\n") &&
          t !== business_name) {
        category = t;
        break;
      }
    }
  }

  // Endereco: elemento com role="group" ou aria-label com "Endereco"
  let address = "";
  const addrEl = card.querySelector('[aria-label*="ndereco"], [aria-label*="Address"], [data-tooltip*="ndereco"]');
  if (addrEl) address = (addrEl.getAttribute("aria-label") || addrEl.textContent || "").replace(/^[Ee]ndere[cç]o:\s*/i, "").trim();
  // Fallback: busca texto que parece endereco (tem virgula + numero)
  if (!address) {
    for (const el of card.querySelectorAll("span, div")) {
      const t = (el.textContent || "").trim();
      if (t.length > 10 && t.length < 200 && /\d/.test(t) && t.includes(",")) {
        address = t;
        break;
      }
    }
  }

  const state = parseState(address);
  const city = parseCity(address);

  // Telefone: o Maps costuma mostrar no card (botao "Ligar" ou link tel:). Sem
  // telefone o lead seria descartado (nao da pra contatar no WhatsApp), entao
  // vale pegar quando aparece. Best-effort, degrada pra vazio.
  let phone = "";
  const telLink = card.querySelector('a[href*="tel:"]');
  if (telLink) phone = (telLink.getAttribute("href") || "").replace(/^tel:/, "").trim();
  if (!phone) {
    const callEl = card.querySelector('[aria-label*="Ligar"], [aria-label*="telefone"], [data-item-id*="phone"]');
    const src = callEl ? (callEl.getAttribute("aria-label") || callEl.textContent || "") : (card.textContent || "");
    const m = src.match(/\(?\d{2}\)?\s?9?\d{4}[-\s.]?\d{4}/);
    if (m) phone = m[0].trim();
  }

  // Site: link externo (nao google.com/maps) no card, quando o Maps mostra.
  let website = "";
  for (const a of card.querySelectorAll("a[href]")) {
    const h = a.getAttribute("href") || "";
    if (h.startsWith("http") && !h.includes("google.com") && !h.includes("/maps/")) {
      website = h;
      break;
    }
  }

  return {
    business_name,
    maps_place_id,
    maps_url,
    rating,
    reviews_count,
    category,
    address,
    neighborhood: "", // nao disponivel diretamente no card da lista
    city,
    state,
    phone,
    website,
  };
}

// Dado o documento do Maps (ou qualquer root element), retorna array de
// dados extraidos de cada card de negocio na lista de resultados.
// Tolera zero resultados sem lancar erro.
export function parseResultsList(root) {
  if (!root) return [];

  // Containers de resultado: divs com role="article" ou links com /maps/place
  // O Maps usa diferentes estruturas dependendo da variante A/B.
  let cards = Array.from(root.querySelectorAll('[role="article"]'));

  // Fallback: pegar os pais dos links para /maps/place/
  if (cards.length === 0) {
    const links = Array.from(root.querySelectorAll('a[href*="/maps/place/"]'));
    const parents = new Set(links.map((l) => l.closest('li, [jsaction], [data-result-index]') || l.parentElement));
    cards = Array.from(parents).filter(Boolean);
  }

  return cards
    .map((c) => { try { return parseCard(c); } catch (_) { return null; } })
    .filter((r) => r && r.business_name);
}
