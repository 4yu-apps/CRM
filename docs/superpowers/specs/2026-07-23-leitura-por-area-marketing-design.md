# Leitura por área — Marketing primeiro

**Data:** 2026-07-23
**Autor:** Gabriel (mantenedor) + Claude
**Status:** aprovado, em implementação

## Problema

A área (profissão) escolhida na config hoje só muda `suggestedNiches` e
`defaultService` no front. Ela **não** reconfigura a esteira: a leitura de
sinais, a IA e a copy são dominadas por site/LP — que é trabalho de UX/UI/Dev,
não de marketing. Um social media não faz landing page; a leitura dele tem que
ser: tem Google Meu Negócio? tem Instagram (seguidores, engajamento, posts
recorrentes)? como está a presença digital? — e só falar de site como último
recurso, se nada disso existir.

## Princípio central

A área passa a reconfigurar **4 camadas**, hoje espalhadas:

1. **Lente de score** (`scoring.py`) — já existe `score_marketing`; será reescrita.
2. **Leitura da IA** (`ai_stage.py`) — hoje não recebe a profissão; passará a receber.
3. **Copy / oportunidade** (`draft/prompt.py`, `draft/mock.py`) — brief de marketing enriquecido.
4. **Painel de sinais no front + valor sugerido** (`marketing-signals.ts`, ficha, `pricing.py`).

Marketing fica 100% afinado agora. As outras áreas **herdam o comportamento
atual** (zero regressão) até serem afinadas depois.

## Viabilidade confirmada

O workflow de produção da esteira (`.github/workflows/esteira.yml`) injeta
`INSTAGRAM_BUSINESS_ID` + `INSTAGRAM_TOKEN` + `META_AD_LIBRARY_TOKEN`. Logo,
seguidores/engajamento/frequência/recência do IG **são reais em produção**
(ressalvas: só perfis Business/Creator retornam dados; token vence ~2026-08-24).

## ICP de marketing: dois extremos (score em U)

- **Sem/fraca presença** (sem IG, IG parado, sem post recorrente, GMB incompleto)
  → score alto, ângulo **"construir presença"**.
- **Presença forte** (IG ativo + posts recorrentes + engajamento/alcance saudável)
  → score alto, ângulo **"escalar/otimizar"** (cliente com verba, valoriza mkt).
- **Meio-termo morno** (IG ativo mas sem ritmo) → score menor.

O `_marketing_presence` classifica em `construir`/`escalar`/`morno` e é a espinha
do U. `_followers_points` é reenquadrado como "valor de audiência" (base grande =
positivo pro cliente de escala), de modo que os dois extremos passam do corte
(THRESHOLD=50) e o meio fica abaixo.

## Mudanças por camada

### A. Dados novos (de graça, já puxados)
- **Bio do IG** — já vem na query da Graph API, hoje descartada → `social_signals.bio`.
- **Taxa de engajamento (%)** — expor número em `social_signals.engagement_rate`.
- Arquivos: `sources/instagram.py` (emite `instagram_bio`, `instagram_engagement_rate`),
  `cascade.py` (`_SOCIAL_FIELDS`).

### B. Presença no Google (GMB) — composto derivado
`_gmb_presence_points(lead)` a partir de `maps_place_id`, `rating`,
`reviews_count`, `opening_hours`, `website`. Não há coleta nova; é leitura do que
já temos. (Fotos/verificação do GMB a API não entrega barato — fora de escopo.)

### C. Lente `score_marketing` reescrita
Critérios: **Presença** (U-shape), **Alcance** (seguidores), **Engajamento**
(taxa), **Google** (GMB), **Facebook**, **Reputação**, **Idade**, **Contato**.
Site sai do score de marketing (não é a preocupação da área). `_summary` de
marketing reescrito pros dois ângulos.

### D. IA ciente da área
`build_ai_prompt(lead, profession)` acrescenta um bloco de ângulo por área.
Marketing: `maturity` = maturidade de presença digital (não de site); `pain` =
gancho de presença (IG parado, sem recorrência, GMB incompleto), nunca "não tem
site". `_facts` ganha posts/semana, engagement_rate e presença no Google.
`apply_ai(..., profession)` passa a profissão.

### E. Copy de marketing (dois ângulos)
`draft/prompt.py`: quando a área é marketing, injeta sinais de mkt (IG
seguidores/engajamento/recorrência, GMB) e um bloco de ângulo (construir vs
escalar) derivado de `_marketing_angle(lead)`. `draft/mock.py`: gancho de
marketing por ângulo. Nunca usa "não tem site" como gancho.

### F. Valor sugerido
`pricing.py`: `_MARKETING = [800, 1200, 1600, 2200]` (era 600/900/1200/1600).

### G. Front — painel marketing-first
- `front/src/lib/marketing-signals.ts` (novo): `marketingSignalChips(lead)`
  liderando com Google → Instagram (seguidores, engajamento, recorrência,
  ativo/parado) → outros canais → e **só no fim**, se faltar tudo, "presença
  digital incompleta / sem site".
- Ficha (`ficha/[id]/page.tsx`): quando o serviço/área é marketing, o painel de
  mkt lidera e o de site fica recolhido abaixo.
- Fila (`quality-signals.ts`): filtros de mkt — "IG parado", "sem post
  recorrente", "baixo engajamento", "presença forte", "GMB incompleto".
- `professions.ts`: `marketing.defaultService` "indefinido" → "marketing".

## Testes
- `test_instagram_source.py`: bio + engagement_rate expostos.
- `test_scoring.py`: U-shape (sem/forte qualificam, morno reprova).
- `test_pricing.py` (ou test correspondente): faixa nova de marketing.
- `test_ai_stage.py`: prompt ganha ângulo quando profession=marketing.
- `test_prompt.py`: brief de marketing com ângulo, sem menção a criar site.

## Fora de escopo (por agora)
- Afinar branding/tráfego/automação/design (herdam comportamento atual).
- Fotos/verificação do GMB, stories/reels, selo de verificação do IG.
- Deploy (bloqueado por token da Vercel; só commit+push).
