import type { Lead } from "@/lib/types";

// Acha contatos por nome, cidade ou telefone.
// Retorna no maximo 7 resultados.
// Exportado separado do app-shell para ser reutilizado no command palette.
export function searchLeads(leads: Lead[], q: string): Lead[] {
  if (q.trim().length < 2) return [];
  const needle = q.trim().toLowerCase();
  const num = needle.replace(/\D/g, "");
  return leads
    .filter((l) => {
      const hay = [l.business_name, l.city, l.state, l.owner_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (hay.includes(needle)) return true;
      if (num) {
        const p = (l.phone ?? "").replace(/\D/g, "");
        const w = (l.whatsapp ?? "").replace(/\D/g, "");
        if (p.includes(num) || w.includes(num)) return true;
      }
      return false;
    })
    .slice(0, 7);
}
