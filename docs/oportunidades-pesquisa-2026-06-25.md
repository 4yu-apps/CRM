# Oportunidades — o que outros CRMs de prospecção têm e o 4YU ainda não

Data: 2026-06-25. Frente 3/3 (pesquisa de oportunidades).
Método: varredura web 2026 (Overpass/OSM, enrichment B2B, Apollo/lemlist, WhatsApp CRMs, CNPJ grátis, lead scoring) cruzada com o que JÁ está planejado, pra não repetir.

## Regras que filtram tudo (do dono)

- **Só grátis** (ou token grátis). Pago entra só como "registrado, bloqueado".
- **Sem API-produto / webhook / n8n** (vetado em [[direcao-multiservico]]).
- **Multi-serviço**: serve os 4 service_targets, não só tráfego.
- **Nada sai sozinho**: o CRM sugere/lembra, nunca dispara. Vale pra tudo abaixo.

## O que JÁ está coberto (não repetir)

- Roadmap 21 features (`docs/roadmap-21-features.md`): métricas/funil, cadência multi-toque, follow-up, esfriando, botões rápidos, nota rápida, lote no celular, filtro por sinal, não-repetir, presets, notificações, clientes/renovação, templates, **tags + import CSV**, controle do robô, multiusuário, motivo de perda.
- Enriquecimento (`docs/enriquecimento-pesquisa-e-plano-2026-06-23.md`): CNPJ (BrasilAPI), scrape do site, pixel/ads, Meta Ad Library, IG Business Discovery, PageSpeed, Groq.

## Gaps NOVOS (fora dos dois docs acima), grátis

| # | Oportunidade | O que os outros fazem | Gap no 4YU | Esforço | Custo |
|---|---|---|---|---|---|
| O1 | **Sinal "empresa nova"** (data de abertura do CNPJ) | Cadastro Nacional / CNPJá filtram "abertas < 3 meses" como lead quente | O 4YU já busca CNPJ, mas não usa `data_inicio_atividade` como sinal nem filtro | **S** | grátis |
| O2 | **OpenStreetMap / Overpass** como fonte de descoberta | Geração de leads local sem custo (10k req/dia, sem chave, ODbL) | Descoberta hoje é só Google Places (pago, com teto de quota) | **M** | grátis |
| O3 | **Waterfall de CNPJ grátis** (CNPJá / OpenCNPJ de fallback) | Enrichment "waterfall": tenta fonte grátis, cai pra outra se falhar | Só BrasilAPI; se ela cair/limitar, o sinal some | **S** | grátis |
| O4 | **Score transparente** (por que 93?) | Lead scoring explica fit + intenção | O 4YU mostra o número, não o porquê | **S** | grátis |
| O5 | **Melhor horário de contato** | WhatsApp CRMs sugerem janelas (10–12h, 16–18h) e aprendem do histórico | Sem dica de quando mandar | **S–M** | grátis |
| O6 | **Não-perturbe / opt-out (LGPD)** | Do-not-contact list trava recontato | Só tag `sem-whatsapp` parcial; sem "pediu pra não receber" | **S** | grátis |
| O7 | **Lookalike "ache mais como meus melhores"** | "Similar companies" a partir dos que fecharam | Parcial (sugestão ramo/cidade); falta partir dos CLIENTES fechados | **M** | grátis |

## Detalhe das 3 mais fortes

### O1 — Sinal "empresa nova" (menor esforço, dado já na mão)
Empresa aberta há poucos meses quase sempre **precisa de marketing** (site, tráfego, presença). A esteira já puxa o CNPJ pela BrasilAPI; o campo `data_inicio_atividade` vem junto. Ação: gravar `meses_de_aberta`, virar um sinal no score e um chip na ficha ("aberta há 2 meses"), e um filtro na fila ("só empresas novas"). Combina com o filtro por sinal (#9) que já existe.

### O2 — OpenStreetMap/Overpass como descoberta grátis
Google Places custa e tem teto ([[maps-quota-guardrails]]: 25 detalhes/dia, 1.000/mês). O Overpass devolve POIs (nome, categoria, às vezes telefone/site/horário) por área+categoria, **grátis, sem chave, 10k/dia, redistribuível (ODbL)**. No Brasil a cobertura é mais esparsa que na Europa, mas em cidade tem volume. Ação: motor de descoberta alternativo na esteira (ou complementar ao Places) — varre o bairro/cidade no Overpass, cruza com o que já existe (dedupe), e só usa o Places (pago) pra completar o que faltar. **Corta custo e levanta o teto de leads/dia.** Risco: qualidade/telefone variável — tratar como fonte de descoberta, enriquecer depois pelos motores grátis que já existem.

### O4 — Score transparente
O score já soma sinais (sem site, PageSpeed ruim, não anuncia, IG fraco — e, com O1, "empresa nova"). Hoje aparece só o 93. Ação: na ficha, um mini-breakdown ("+20 empresa nova · +25 sem site · +18 PageSpeed ruim · −10 já anuncia"). Custo ~zero (reusa o que o scorer já calcula), e dá confiança + ensina o usuário a priorizar.

## Bloqueado por custo (registrar, não fazer)

- **Google Reviews / nota / "GMB não reivindicado"**: sinal forte de "precisa de marketing" (nota baixa, poucas reviews, ficha não reivindicada), mas vem do Google Places (**pago**). Fica fora pela regra do só-grátis. Se um dia liberar custo de Places, é o sinal de maior valor pra agência.
- **Apollo/Lusha/Snov free tiers**: caps baixos e dados B2B (cargo/email corporativo) que não casam com o ICP local-business do 4YU. Fora.

## Recomendação de ordem (grátis, por ROI/esforço)

1. **O1 empresa nova** — sinal forte, dado já disponível, esforço S.
2. **O4 score transparente** — confiança, reusa o scorer, esforço S.
3. **O2 OpenStreetMap/Overpass** — maior ganho estratégico (corta custo do Maps), esforço M.
4. **O3 waterfall CNPJ** + **O6 opt-out** — robustez/compliance baratos.
5. **O5 melhor horário** e **O7 lookalike** — diferenciais, quando sobrar fôlego.
