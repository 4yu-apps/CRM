# Enriquecimento de dados — Pesquisa + Plano (2026-06-23)

Autor: Gabriel (gab.feelix) + Claude. Contexto: 4YU CRM, prospecção para
gestão de tráfego. Leads = PMEs locais do Google Maps. Stack: front Next.js +
Supabase; esteira Python (cron GitHub Actions). Regra do dono: **só grátis**.

Pesquisa feita por 5 subagents em paralelo (web 2026). Este doc é a fonte única:
o que existe, o que a pesquisa achou, o que entrou nesta sessão, e o que falta
ligar (chaves grátis que o dono precisa pegar).

---

## 1. O que o gestor de tráfego precisa saber pra decidir o match (ordem)

1. **Já anuncia?** — define o ângulo (começar do zero vs otimizar). Sinal #1.
2. **Pra onde mando tráfego?** — tem site? tem destino (IG/WhatsApp)?
3. **Tem movimento/verba?** — nota + nº de avaliações (proxy de porte).
4. **Canal atual** — Instagram (ativo/parado, seguidores), outros canais.
5. **Contato direto** — WhatsApp.

CNPJ/dono são baixos pra decisão rápida (ficam no fim da ficha).

---

## 2. Melhores práticas (resumo da pesquisa)

- **Waterfall enrichment** (Clay/BetterContact/Apollo): tenta fonte grátis
  primeiro, paga só se faltar. Registra a fonte por campo (proveniência). A
  esteira já faz isso (cascade + lead_field_provenance).
- **Quando enriquecar** numa fila de 800+ onde só ~20% será abordado:
  - grátis/barato → on-ingest e batch (CNPJ, site, pixel, PageSpeed);
  - caro → on-demand (quando abre a ficha). Não gaste no que nunca será tocado.
- **TTL/cache**: "já anuncia" 7-14d; seguidores 14-30d; pixel 30d; CNPJ 180d.
- **Score = fit (ICP) + oportunidade**. A sacada: o lead mais quente é o que
  **tem movimento mas NÃO anuncia**. A esteira já pontua isso.
- **LGPD**: prospecção B2B = legítimo interesse (Guia ANPD, fev/2024). Dado de
  PJ (CNPJ/CNAE) fora da LGPD; sócio (QSA público) ok pra contato B2B. Sempre:
  documentar origem do lead, opt-out na 1ª mensagem, processar opt-out ≤15d, não
  guardar CPF cheio, nunca comprar lista sem origem. (A esteira já tem opt_out +
  proveniência por campo = origem documentada.)

---

## 3. Fontes grátis por sinal (o que vale pro 4YU)

| Sinal | Fonte grátis | Como | Estado |
|---|---|---|---|
| Empresa (razão, CNAE, porte, sócio, tel/email) | **BrasilAPI /cnpj** | grátis, sem chave | **JÁ usa** (cnpj.py) |
| Contatos do site (IG/WhatsApp/FB/tel/email) | fetch + regex | grátis | **JÁ usa** (website.py) |
| Já anuncia (pixel no site) | regex no HTML (fbq/Google Ads/TikTok) | grátis | **JÁ usa, agora preciso** (esta sessão) |
| Já anuncia (definitivo) | **Meta Ad Library API** (por page_id do FB) | token grátis | **pronto, DESLIGADO** (falta token) |
| Instagram seguidores + ativo/parado | **IG Graph Business Discovery** | token grátis (conta IG Business) | **pronto, DESLIGADO** (falta token) |
| Performance do site (mobile) | **PageSpeed Insights API** | chave grátis (sem cobrança) | **NOVO nesta sessão** |
| Extração de contato por IA | **Groq** (LLM grátis) | chave grátis | **JÁ usa** se há GROQ_API_KEY |

Pagos investigados e **descartados** (regra do dono): Apify/scrapers de IG, Wappalyzer/BuiltWith,
Casa dos Dados (nome→CNPJ R$0,01), Speedio/Econodata, Hunter/Apollo (cobertura PME-BR ruim
e pago), Google Places Details (SKU caro; já há ReviewsSource desligada por isso).

---

## 4. O que entrou NESTA sessão (esteira, tudo grátis)

Arquivos: `sources/website.py`, `sources/pagespeed.py` (novo), `config.py`,
`scoring.py`, `.env.example`, testes (`test_site_signals.py`, `test_pagespeed.py`).
294 testes verdes.

1. **"Já anuncia?" mais preciso.** Antes, ter Google Analytics/GTM marcava "já
   anuncia" (falso: quase todo site mede). Agora separa **pixel de anúncio de
   verdade** (Meta `fbq`, Google Ads `AW-`/googleadservices, TikTok `ttq`) do
   analytics. `ads_active=sim` só sai de pixel de anúncio real. Novo campo
   `ad_platforms` (ex.: `["meta","google"]`) pronto pra ficha.
2. **PageSpeed Insights (novo, grátis).** Nota 0-100 de performance no celular +
   LCP + categoria real (Chrome UX), mesclada no `site_signals`. Alimenta a
   lente design ("site lento de verdade, PageSpeed 22/100" = argumento objetivo
   de redesign). Liga sozinho quando houver a chave grátis.
3. **Mais sinais do mesmo fetch (grátis):** canais `has_tiktok/has_youtube/
   has_linkedin`, `has_online_booking` (Calendly/Booksy/etc = ouro p/ automação),
   `has_ecommerce` (Shopify/checkout/carrinho = muda o tipo de campanha).
4. Score: tráfego usa pixel de anúncio real (não analytics); design usa o
   PageSpeed.

Sem migration: tudo cai no `site_signals` (jsonb) que já existe.

---

## 5. AÇÃO DO DONO — pegar estas chaves GRÁTIS (ligam motores já prontos)

Todas são de graça. Cada uma liga um sinal forte sem custo:

1. **PAGESPEED_API_KEY** (performance do site)
   - console.cloud.google.com → criar projeto → "APIs e serviços" → ativar
     "PageSpeed Insights API" → Credenciais → "Criar credencial" → Chave de API.
   - Sem cobrança, sem cartão. 25.000 consultas/dia.
2. **META_AD_LIBRARY_TOKEN** (confirma anúncio Meta de forma definitiva, por
   page_id, além do pixel)
   - developers.facebook.com → criar app → produto "Ad Library API" → verificar
     identidade → gerar token de usuário (trocar por long-lived). Grátis.
3. **INSTAGRAM_BUSINESS_ID + INSTAGRAM_TOKEN** (seguidores + ativo/parado)
   - Mesmo app Meta. Conta IG **Business** sua (a do 4YU) vinculada a uma página
     FB. Permissão `instagram_basic` + `pages_read_engagement`. INSTAGRAM_TOKEN
     vazio cai no META_AD_LIBRARY_TOKEN se ele tiver as permissões.
4. **GROQ_API_KEY** (extração de contato por IA, grátis) — console.groq.com.
   Provavelmente já configurado.

Onde colocar: nos secrets/vars do GitHub Actions (workflow `esteira.yml`) e/ou
no `.env` da esteira. Modelos no `esteira/.env.example`.

---

## 6. Próximos ganhos grátis (não feitos ainda)

- Surfacing no front: mostrar na ficha `ad_platforms`, PageSpeed, canais,
  IG seguidores/status (o dado já é gravado; falta exibir).
- Backfill: rodar `cmd_backfill` pra re-raspar os leads antigos com os novos
  sinais (já existe, idempotente).
- name→CNPJ grátis: não há API limpa grátis (Casa dos Dados é R$0,01). Fica fora.
- Google Places `businessStatus` (descartar fechado): útil, mas Places é pago
  (free cap). Fora por ora pela regra do dono.

---

## 7. Custos

Tudo desta sessão e dos motores prontos = **R$0** (APIs grátis + token grátis).
Único custo já existente do projeto é a descoberta via Google Places (Maps), que
não muda aqui.
