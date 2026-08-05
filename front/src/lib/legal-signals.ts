// Chips de diagnostico JURIDICO, na ordem em que um advogado le uma empresa:
// natureza juridica -> socios -> porte/capital -> situacao na Receita -> tempo
// de casa -> assessoria aparente.
//
// Instagram, engajamento, GMB e "ja anuncia" NAO aparecem: nao sao leitura
// juridica. E o inverso do painel de marketing.
import type { SignalChip } from "./site-signals";
import type { Lead } from "./types";

function anosDeCasa(openedOn: string | null | undefined): number | null {
  if (!openedOn) return null;
  const d = new Date(openedOn);
  if (Number.isNaN(d.getTime())) return null;
  const meses =
    (new Date().getFullYear() - d.getFullYear()) * 12 +
    (new Date().getMonth() - d.getMonth());
  return Math.max(0, Math.floor(meses / 12));
}

export function legalSignalChips(lead: Lead): SignalChip[] {
  const chips: SignalChip[] = [];
  const sig = lead.site_signals ?? null;

  // 1. Natureza juridica: o filtro nº 1. MEI nao contrata advogado.
  const nat = (lead.natureza_juridica ?? "").toUpperCase();
  const ehMei = nat.includes("MEI") || (lead.porte ?? "").toUpperCase() === "MEI";
  if (ehMei) {
    chips.push({ label: "MEI", variant: "warn" });
  } else if (nat.includes("LIMITADA") || nat.includes("ANONIMA") || nat.includes("ANÔNIMA")) {
    chips.push({ label: "Sociedade", variant: "positive" });
  } else if (nat.includes("INDIVIDUAL") || nat.includes("EIRELI")) {
    chips.push({ label: "Empresário individual", variant: "neutral" });
  }

  // 2. Socios: demanda societaria (acordo, saida, sucessao).
  if (typeof lead.socios_count === "number" && lead.socios_count >= 2) {
    chips.push({ label: `${lead.socios_count} sócios`, variant: "positive" });
  } else if (lead.socios_count === 1) {
    chips.push({ label: "Sócio único", variant: "neutral" });
  }

  // 3. Porte real (capital declarado, nao avaliacoes no Maps).
  if (typeof lead.capital_social === "number" && lead.capital_social > 0) {
    chips.push({
      label: `Capital R$ ${lead.capital_social.toLocaleString("pt-BR")}`,
      variant: lead.capital_social >= 200000 ? "positive" : "neutral",
    });
  }

  // 4. Situacao na Receita. Irregular aqui NAO e lead morto: e demanda.
  const status = (lead.company_status ?? "").toUpperCase();
  if (status && status !== "ATIVA") {
    chips.push({ label: `Empresa ${status.toLowerCase()}`, variant: "warn" });
  } else if (status === "ATIVA") {
    chips.push({ label: "Ativa na Receita", variant: "positive" });
  }

  // 5. Regime tributario.
  if (sig?.simples === false) {
    chips.push({ label: "Fora do Simples", variant: "positive" });
  } else if (sig?.simples === true) {
    chips.push({ label: "Optante pelo Simples", variant: "neutral" });
  }

  // 6. Tempo de casa (o U: nova ou madura).
  const anos = anosDeCasa(lead.opened_on);
  if (anos !== null) {
    chips.push({
      label: anos < 2 ? `Aberta há ${anos < 1 ? "menos de 1 ano" : "1 ano"}` : `${anos} anos de casa`,
      variant: anos < 2 || anos >= 5 ? "positive" : "neutral",
    });
  }

  // 7. Assessoria aparente: a ausencia e o sinal. So opina se ha site lido.
  if (lead.website) {
    if (sig?.has_privacy_policy === false) {
      chips.push({ label: "Sem política de privacidade", variant: "warn" });
    }
    if (sig?.has_terms === false) {
      chips.push({ label: "Sem termos de uso", variant: "warn" });
    }
    if (sig?.has_privacy_policy && sig?.has_terms) {
      chips.push({ label: "Já tem política e termos", variant: "neutral" });
    }
  }

  return chips;
}
