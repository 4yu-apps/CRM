// Chips de diagnostico MARKETING-FIRST: presenca digital lida como um social
// media leria, nao como dev. Ordem de leitura: Google (Perfil de Empresa) ->
// Instagram (seguidores, engajamento, recorrencia, ativo/parado) -> outros
// canais -> e SO no fim, se faltar tudo, "sem site". Site nao e o protagonista
// da area de marketing (isso e design/dev); entra como ultimo recurso.
import type { SignalChip } from "./site-signals";
import type { Lead } from "./types";

function kfmt(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

export function marketingSignalChips(lead: Lead): SignalChip[] {
  const chips: SignalChip[] = [];
  const soc = lead.social_signals ?? null;

  // 1. Presenca no Google (GMB): tem Perfil de Empresa? esta completo?
  const onGoogle = Boolean(lead.maps_place_id) || lead.rating != null || Boolean(lead.reviews_count);
  if (!onGoogle) {
    chips.push({ label: "Sem Perfil no Google", variant: "warn" });
  } else {
    const completo = Boolean(lead.opening_hours) && Boolean(lead.website) && (lead.reviews_count ?? 0) >= 20;
    chips.push(
      completo
        ? { label: "Perfil no Google completo", variant: "positive" }
        : { label: "Perfil no Google incompleto", variant: "warn" },
    );
  }

  // 2. Instagram: o coracao da leitura de marketing.
  if (!lead.instagram) {
    chips.push({ label: "Sem Instagram", variant: "warn" });
  } else {
    if (soc?.ig_status === "parado") chips.push({ label: "Instagram parado", variant: "warn" });
    else if (soc?.ig_status === "ativo") chips.push({ label: "Instagram ativo", variant: "positive" });
    else chips.push({ label: "Tem Instagram", variant: "neutral" });

    if (typeof soc?.followers === "number") {
      chips.push({ label: `${kfmt(soc.followers)} seguidores`, variant: "neutral" });
    }
    // recorrencia de posts: >=1/semana = ritmo; abaixo = presenca parada.
    if (typeof soc?.post_freq === "number") {
      chips.push(
        soc.post_freq >= 1
          ? { label: "Posta com recorrencia", variant: "positive" }
          : { label: "Quase nao posta", variant: "warn" },
      );
    }
    // engajamento: taxa (%) quando temos; <1% audiencia parada, >3% saudavel.
    if (typeof soc?.engagement_rate === "number") {
      const er = soc.engagement_rate;
      const variant = er < 1 ? "warn" : er >= 3 ? "positive" : "neutral";
      chips.push({ label: `Engajamento ${er}%`, variant });
    }
  }

  if (lead.facebook) chips.push({ label: "Tem Facebook", variant: "neutral" });

  // 3. Outros canais (do scrape do site), quando ja esta neles.
  const sig = lead.site_signals ?? null;
  const canais = [
    ...(sig?.has_tiktok ? ["TikTok"] : []),
    ...(sig?.has_youtube ? ["YouTube"] : []),
    ...(sig?.has_linkedin ? ["LinkedIn"] : []),
  ];
  if (canais.length > 0) chips.push({ label: `Tambem em ${canais.join(", ")}`, variant: "neutral" });

  // 4. Site: ULTIMO recurso. So comenta a ausencia quando nao ha nenhuma outra
  // presenca digital (nem Google, nem Instagram, nem outros canais).
  const semPresenca = !onGoogle && !lead.instagram && !lead.facebook && canais.length === 0;
  if (semPresenca && !lead.website) {
    chips.push({ label: "Sem presenca digital (nem site)", variant: "warn" });
  }

  return chips;
}
