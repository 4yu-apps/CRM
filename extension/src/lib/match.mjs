// Casamento conversa-aberta <-> lead. O ponto mais dificil da extensao
// (territorio Opus): o WhatsApp Web nem sempre expoe o numero cru no DOM.
// Estrategia: numero quando disponivel -> nome exibido como fallback ->
// "colar numero manual" como rede de seguranca. Logica pura, testavel.

import { normalizePhone, phoneKey } from "./normalize.mjs";

// Tenta achar um telefone num texto livre (header de contato nao salvo costuma
// ser o proprio numero). Retorna normalizado ou null.
export function parsePhone(text) {
  if (!text) return null;
  // sequencia tipo telefone: opcional +, com espacos/().- no meio
  const m = String(text).match(/\+?\d[\d\s().-]{8,}\d/);
  return m ? normalizePhone(m[0]) : null;
}

function norm(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

// parsed: { phone?, name? }  ·  leads: [{ id, phone, business_name, ... }]
// Retorna { lead, method: 'phone'|'name'|'ambiguous'|'none', candidates? }
export function matchLead(parsed, leads) {
  // Casa por chave canonica: ignora formato (parenteses/traco/espaco/+55) e o
  // 9 do celular, entao o mesmo numero bate com 9 a mais ou a menos.
  const key = parsed.phone ? phoneKey(parsed.phone) : null;
  if (key) {
    const byPhone = leads.find((l) => phoneKey(l.phone) === key);
    if (byPhone) return { lead: byPhone, method: "phone" };
  }

  const name = norm(parsed.name);
  if (name) {
    const exact = leads.filter((l) => norm(l.business_name) === name);
    if (exact.length === 1) return { lead: exact[0], method: "name" };

    const partial = leads.filter((l) => {
      const bn = norm(l.business_name);
      return bn && (bn.includes(name) || name.includes(bn));
    });
    if (partial.length === 1) return { lead: partial[0], method: "name" };
    if (partial.length > 1) return { lead: null, method: "ambiguous", candidates: partial };
  }

  return { lead: null, method: "none" };
}
