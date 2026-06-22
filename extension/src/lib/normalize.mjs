// Normalizacao de telefone: mesma logica do banco/esteira (digitos, DDD BR).

export function onlyDigits(value) {
  return (value || "").replace(/\D/g, "");
}

export function normalizePhone(value) {
  let d = onlyDigits(value);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : null;
}

// Chave canonica pra CASAR telefone, a prova de formato e do 9 do celular.
// Tira nao-digitos, tira o 55 do Brasil e remove o 9 extra do celular
// (11 digitos DD9XXXXXXXX -> 10 digitos DDXXXXXXXX). Assim o mesmo numero casa
// com o 9 a mais OU a menos, com ou sem parenteses/traco/espaco/+55. Devolve
// null se curto demais pra ser confiavel.
export function phoneKey(value) {
  let d = onlyDigits(value);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
  return d.length >= 10 ? d : null;
}

export function fmtPhone(value) {
  const d = onlyDigits(value);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return value || "-";
}
