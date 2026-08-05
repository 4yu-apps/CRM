// Retrato JURIDICO da empresa, na ordem em que um advogado le: natureza
// juridica -> quadro societario -> porte/capital -> situacao na Receita ->
// regime tributario -> tempo de casa -> assessoria aparente.
//
// Instagram, engajamento, GMB e "ja anuncia" NAO aparecem: nao sao leitura
// juridica. E o inverso do painel de marketing.
//
// Sao DADOS ROTULADOS, nao chips. Chip marca estado de relance mas engole o
// valor: "Sociedade" nao diz qual natureza juridica, "Capital R$ 800.000" vira
// uma pilula solta numa fileira, e "Fora do Simples" nao deixa claro que aquilo
// e o regime tributario. Aqui cada campo aparece com o nome do lado, o valor
// por extenso, e o tom de cor no proprio valor quando ele e sinal forte.
//
// Ausencia e informacao: "Nao tem" em vez de sumir da tela. Desconhecido vira
// null, que a ficha desenha como "—" — o advogado precisa distinguir "a empresa
// nao tem politica de privacidade" de "ainda nao olhamos o site dela".
import type { SignalFact } from "./site-signals";
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

/** "206-2 - Sociedade Empresaria Limitada" -> "Sociedade Empresária Limitada". */
function naturezaLegivel(nat: string): string {
  const semCodigo = nat.includes(" - ") ? nat.split(" - ").slice(1).join(" - ") : nat;
  return semCodigo.trim() || nat;
}

export function ehMei(lead: Lead): boolean {
  const nat = (lead.natureza_juridica ?? "").toUpperCase();
  return (
    nat.includes("MEI") ||
    nat.includes("MICROEMPREENDEDOR") ||
    (lead.porte ?? "").toUpperCase() === "MEI" ||
    lead.site_signals?.mei === true
  );
}

export function legalFacts(lead: Lead): SignalFact[] {
  const sig = lead.site_signals ?? null;
  const facts: SignalFact[] = [];

  // 1. Natureza juridica: o filtro nº 1. MEI e pessoa com CNPJ, nao empresa
  //    com quadro societario — e o corte duro do ICP, entao vem em destaque.
  const nat = (lead.natureza_juridica ?? "").trim();
  if (ehMei(lead)) {
    facts.push({
      label: "Natureza jurídica",
      value: nat ? `${naturezaLegivel(nat)} (MEI)` : "MEI",
      tone: "warn",
    });
  } else if (nat) {
    const up = nat.toUpperCase();
    const sociedade =
      up.includes("LIMITADA") || up.includes("ANONIMA") || up.includes("ANÔNIMA");
    facts.push({
      label: "Natureza jurídica",
      value: naturezaLegivel(nat),
      tone: sociedade ? "positive" : "neutral",
    });
  } else {
    facts.push({ label: "Natureza jurídica", value: null });
  }

  // 2. Quadro societario: aqui socio e DEMANDA (acordo, saida, sucessao), nao
  //    obstaculo de venda como nas outras areas.
  const n = lead.socios_count;
  facts.push({
    label: "Quadro societário",
    value:
      typeof n === "number"
        ? n === 0
          ? "Sem sócios registrados"
          : n === 1
            ? "Sócio único"
            : `${n} sócios`
        : null,
    tone: typeof n === "number" && n >= 2 ? "positive" : "neutral",
  });

  // 3. Porte real: capital declarado, nao numero de avaliacoes no Maps.
  const cap = lead.capital_social;
  facts.push({
    label: "Capital social",
    value:
      typeof cap === "number"
        ? cap.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
        : null,
    tone: typeof cap === "number" && cap >= 200000 ? "positive" : "neutral",
  });

  if (lead.porte) facts.push({ label: "Porte na Receita", value: lead.porte });

  // 4. Situacao cadastral. Irregular aqui NAO e lead morto: e empresa com
  //    demanda de regularizacao em curso, o oposto das outras lentes.
  const status = (lead.company_status ?? "").trim();
  facts.push({
    label: "Situação na Receita",
    value: status
      ? status.toUpperCase() === "ATIVA"
        ? "Ativa"
        : status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
      : null,
    tone: status ? (status.toUpperCase() === "ATIVA" ? "positive" : "warn") : undefined,
  });

  // 5. Regime tributario: fora do Simples = demanda tributaria de verdade.
  facts.push({
    label: "Regime tributário",
    value:
      sig?.simples === false
        ? "Fora do Simples"
        : sig?.simples === true
          ? "Optante pelo Simples"
          : null,
    tone: sig?.simples === false ? "positive" : "neutral",
  });

  // 6. Tempo de casa (o U do score: recem-aberta ou madura pontuam; o meio nao)
  //    e a data exata, que e o que importa pra contrato social e prescricao.
  const anos = anosDeCasa(lead.opened_on);
  facts.push({
    label: "Tempo de casa",
    value:
      anos === null
        ? null
        : anos < 1
          ? "Menos de 1 ano"
          : anos === 1
            ? "1 ano"
            : `${anos} anos`,
    tone: anos !== null && (anos < 2 || anos >= 5) ? "positive" : "neutral",
  });
  facts.push({
    label: "Aberta em",
    value: lead.opened_on
      ? new Date(lead.opened_on).toLocaleDateString("pt-BR", { timeZone: "UTC" })
      : null,
  });

  if (lead.cnpj) facts.push({ label: "CNPJ", value: lead.cnpj });

  // 7. Assessoria aparente: a AUSENCIA e o sinal. So opina quando ha site pra
  //    ler — sem site, "não tem política" nao significaria nada.
  if (lead.website) {
    facts.push({
      label: "Política de privacidade",
      value:
        sig?.has_privacy_policy === true
          ? "Tem"
          : sig?.has_privacy_policy === false
            ? "Não tem"
            : null,
      tone: sig?.has_privacy_policy === false ? "warn" : "neutral",
    });
    facts.push({
      label: "Termos de uso",
      value:
        sig?.has_terms === true ? "Tem" : sig?.has_terms === false ? "Não tem" : null,
      tone: sig?.has_terms === false ? "warn" : "neutral",
    });
  }

  // 8. Atividades secundarias: risco por ramo (transporte, construcao, saude).
  // Um CNAE inteiro ja ocupa o tile; a partir do segundo vira contagem, senao o
  // valor corta no meio e nao informa nem o primeiro. O titulo do tile (hover)
  // carrega a lista completa.
  const cnaes = sig?.cnaes_sec;
  if (cnaes?.length) {
    facts.push({
      label: "Atividades secundárias",
      value: cnaes.length === 1 ? cnaes[0] : `${cnaes[0]} +${cnaes.length - 1}`,
    });
  }

  return facts;
}
