// Normalizacao de telefone: mesma logica do banco/esteira (digitos, DDD BR).

export function onlyDigits(value) {
  return (value || "").replace(/\D/g, "");
}

export function normalizePhone(value) {
  let d = onlyDigits(value);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : null;
}

export function fmtPhone(value) {
  const d = onlyDigits(value);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return value || "-";
}
