# Source Instagram — Business Discovery (ativo/parado)

Data: 2026-06-22

## Problema

O cowork (chat de prospecção) prometia "ler o Instagram ao vivo" via extensão no
navegador do usuário — precisa do PC ligado. A esteira roda no cron (PC
desligado). Queremos o sinal "o Instagram do lead está ativo ou abandonado?"
rodando server-side, de graça, sem navegador.

## Decisão de pesquisa (web, 2026)

Quatro fontes investigadas:

- **iFood / aiqfome**: **largados.** Sem endpoint guest público. Todo scraper
  precisa de sessão autenticada (CDP/browser); PerimeterX + Cloudflare bloqueiam
  IP de datacenter. Grátis no cron = inviável. Única via PC-off é Apify pago
  (~centavos/consulta, fura a meta de R$30/mês) ou browser headless na nuvem
  (frágil, ToS cinza). Custo/risco não compensa; o usuário confirma delivery na
  conversa, manual.
- **Google Transparency**: **largado.** RPC `SearchService/SearchCreatives`
  existe sem auth, mas exige TLS fingerprint (curl-cffi), IP de datacenter
  flagado, frágil. Já temos proxy de "anuncia no Google" pelo gtag no site
  (`extract_site_signals`). ROI baixo.
- **Instagram**: **escolhido.** A **Graph API Business Discovery** é oficial,
  grátis (~200 req/h), e retorna `followers_count`, `media_count` e o
  `timestamp` do último post de contas **Business/Creator** de terceiros. Cabe o
  volume diário sem custo. Melhor ROI da pesquisa.

## O que constrói

Reescreve `sources/instagram.py` (hoje só normaliza o handle) para, quando houver
token, consultar a Business Discovery e derivar o estado do perfil. Espelha o
padrão da `ad_library.py`: probe injetável, conservador (sem dado → `None`, nunca
chuta), inerte sem token.

### Endpoint

```
GET /{ig_business_id}
  ?fields=business_discovery.username(HANDLE){followers_count,media_count,media.limit(1){timestamp}}
  &access_token=TOKEN
```

`ig_business_id` = uma conta IG **Business** própria (a do 4YUmkt), vinculada a
uma página FB, com token `instagram_basic` no mesmo app do Meta já usado pelo Ad
Library. Sem isso, a source fica inerte (offline-first; testes rodam no mock).

### Findings emitidos (proveniência, sem coluna nova)

- `instagram` — handle normalizado (comportamento atual, ENRICHABLE)
- `instagram_followers` — número (proveniência)
- `instagram_media_count` — número (proveniência)
- `instagram_status` — `ativo` / `parado` (proveniência; ausente = desconhecido)

`instagram_status` deriva de dias desde o último post: `> 60 dias = parado`,
caso contrário `ativo`. Threshold via env `GARIMPO_IG_STALE_DAYS` (default 60).
Conta pessoal/privada/sem post / API fora → `None` (não emite status).

### Função pura `instagram_status(last_post_iso, *, now=None, stale_days=60)`

Testável sem rede (injeta `now`). Parseia o formato IG
(`2024-03-15T12:00:00+0000`), devolve `"ativo"`/`"parado"`/`None`.

## Score (refina só a lente marketing)

`scoring.score_marketing` hoje só vê "tem IG / não tem". Passa a usar
`signals["instagram_status"]`:

| Situação | Pontos | Nota |
|---|---|---|
| sem IG | 22 | sem Instagram, presença a construir (já existe) |
| **tem IG mas parado** | **18** | **tem mas largou, dá pra assumir a gestão (novo, é ouro)** |
| tem IG ativo | 6 | Instagram ativo, bem cuidado |
| tem IG, status desconhecido | 6 | comportamento atual |

`_summary` (lente marketing) menciona "Instagram parado" quando aplicável. As
outras lentes (tráfego/automação/design) não mudam.

`score_stage` ganha `_ig_signal(provenance)` (lê `instagram_status` da
proveniência) e monta `signals["instagram_status"]`. Reusa a busca de
proveniência já feita pro `ads_active` (uma chamada só).

## Copy

Sem mudança em `prompt.py`. O brief de marketing já instrui "rede fraca, parada
ou ausente". Como o score roteia o lead IG-parado pra marketing, a copy puxa o
ângulo "rede parada" sozinha.

## Config

`config.py`: novas envs `INSTAGRAM_BUSINESS_ID`, `INSTAGRAM_TOKEN` (default =
`META_AD_LIBRARY_TOKEN`), `GARIMPO_IG_STALE_DAYS` (default 60). `build_sources`
(modo real) liga o probe quando há business_id + token; modo fixture mantém
`InstagramSource()` sem probe.

## Arquivos

- `esteira/src/garimpo_esteira/sources/instagram.py` — reescreve
- `esteira/src/garimpo_esteira/score_stage.py` — `_ig_signal` + signal
- `esteira/src/garimpo_esteira/scoring.py` — refina `score_marketing` + `_summary`
- `esteira/src/garimpo_esteira/config.py` — envs + wiring
- `esteira/tests/test_instagram_source.py` — novo (probe, thresholds, conservador)
- `esteira/tests/test_scoring.py` — estende (marketing parado)
- `esteira/.env.example` — documenta as envs

## Fora de escopo (YAGNI)

- iFood / aiqfome / Google Transparency (largados acima)
- Coluna dedicada no Postgres pra IG (proveniência basta; sem migration)
- Frequência/engajamento de posts (Business Discovery dá último post, não série)
- Contas pessoais (a API só retorna Business/Creator; resto vira `None`)
