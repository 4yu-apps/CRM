# Esteira segura + Buscar ativo — Design

Data: 2026-06-21
Autor: Gabriel (gab.feelix) + Claude

## Contexto

Dois problemas em produção no CRM Garimpo:

1. **Esteira empacada**: ~565 leads presos em `bruto`. A IA não está sendo a culpada — o
   provider de draft (Gemini/Groq) já cai num `FallbackDraftProvider` que usa o mock quando
   estoura quota, então quota de LLM nunca prende lead. O gargalo real é a etapa
   `bruto → enriquecido`.

2. **Tela Buscar incoerente**: serviço-alvo fixo ignorando a profissão, bairro fake,
   cobertura que não filtra por cidade, autopilot duplicado, "surpreenda-me" fraco, e
   nenhum feedback ao disparar o robô.

## Causa raiz da esteira (verificada no código)

- `cascade.py:32-45` (`enrich_lead`): as chamadas ao sink Supabase (`record_provenance`,
  `update_lead_fields`, `set_status`) fazem `raise_for_status()` **sem** `try/except`. Um
  único 429/5xx/timeout do Supabase **derruba o `enrich_batch` inteiro**; os leads ainda
  não processados ficam em `bruto`.
- `autopilot.py:136-138`: enrich → score → draft de cada owner roda em sequência sem
  isolamento. Se o enrich estoura, score e draft daquele owner nem rodam.
- Nenhuma etapa tem retry/backoff; só um `sleep(0.4)` fixo.
- Cron 2x/dia com lote 150 (`esteira.yml`), enquanto a descoberta (com nichos extras
  aleatórios) enche o funil mais rápido → backlog cresce.
- `fetch_by_status` ordena por `created_at.asc`: um lead "venenoso" no topo trava o lote
  toda execução.

## Decisões (acordadas com o usuário)

1. Autopilot fica **só no Config** (sai do Buscar).
2. Serviço-alvo **reflete a profissão**; perfis "indefinido" **escondem o controle**.
3. Buscar dá **feedback ao vivo** (loading + contagem de leads que chegam).
4. Bairro vira **real**: mapa + persistência + usado pelo robô.

## Design

### Parte A — Esteira: processamento seguro

1. **Isolar erro por lead** em `enrich_batch` (`cascade.py`): envolver o corpo do loop por
   lead em `try/except Exception`, logar e `continue`. Um lead/sink que falha não derruba
   o lote; o "venenoso" é pulado e o resto avança.
2. **Retry com backoff** nas chamadas de rede do sink Supabase que hoje fazem
   `raise_for_status` (`record_provenance`, `update_lead_fields`, `set_status`,
   `fetch_by_status`): 3 tentativas com backoff exponencial (1s, 2s, 4s) em 429/5xx e erros
   de transporte. Implementar como helper interno no `sink/supabase.py`.
3. **Isolar cada owner** no `autopilot.py`: `try/except` em volta de enrich/score/draft por
   owner, para um owner com erro não bloquear os demais.
4. **Lote menor + cron mais frequente**: `GARIMPO_BATCH` 150 → ~40; cron de 2x/dia → de
   hora em hora; reduzir `GARIMPO_EXTRA_NICHES`/`MAPS_PAGES` para a descoberta não atropelar
   o processamento. O backlog de 565 escoa sozinho em poucas horas.

Resultado: leads nunca mais ficam presos por falha pontual de rede; a esteira drena "de
pouquinho em pouquinho" de forma resiliente.

### Parte B — Tela Buscar: busca ativa + mapa reativo

1. **Autopilot**: remover `AutopilotToggle` de `buscar/page.tsx`; manter só em `config/page.tsx`.
2. **Serviço-alvo por perfil**: derivar as opções do `search_profile.profession` /
   `default_service_target`:
   - profissão "ambos" → toggle `trafego | automacao | ambos`.
   - profissão só tráfego → `trafego` fixo (sem toggle, rótulo informativo).
   - profissão só automação → `automacao` fixo.
   - profissão "indefinido" (design/ux/marketing/branding/web) → **controle escondido**; a
     busca capta só pelo nicho. `service` salvo como `indefinido`.
   Helper em `professions.ts`/`service.ts` que mapeia profissão → opções de serviço-alvo.
3. **Mapa 100% reativo**: `useEffect` que geocodifica e recentra ao mudar estado, cidade
   **ou bairro** — sem depender do botão. Geocodificar bairro via novo
   `geocodeNeighborhood(neighborhood, city, uf)` em `geocode.ts` (Nominatim com
   `street`/`suburb`), com fallback pra cidade.
4. **Bairro real**: novo campo `search_profile.neighborhood` (migration). Persistido em
   `saveProfile` (mock + supabase), incluído em `SearchProfileInput` e `types.ts`. Passado
   ao robô como centro da descoberta (a discovery Python aceita um centro lat/lng do bairro;
   se ausente, usa a cidade como hoje).
5. **Cobertura filtra por cidade/UF**: `listCoverage` passa a aceitar filtro de cidade/UF
   (ou filtragem client-side por `region`/cidade selecionada) para as barras
   "cidade / nicho" refletirem a seleção atual, não só o nicho.
6. **Surpreenda-me randomiza tudo menos serviço-alvo**: sorteia estado → cidade (via IBGE)
   → bairro (opcional/limpo) → ramo (dentro dos nichos do perfil). `service` permanece.
7. **Buscar agora = ação com feedback ao vivo**:
   - Captura baseline: contagem atual de leads (total e `rascunho_pronto`).
   - Salva o alvo (`saveProfile`) e dispara `/api/search/run` (workflow_dispatch).
   - Entra em estado "buscando…" e faz polling do banco (ex: a cada ~6s, por alguns
     minutos): mostra "N novos leads encontrados" (delta total) e "M prontos pra revisar"
     (delta `rascunho_pronto`), com atalho pra **Fila**.
   - O polling para sozinho após um teto de tempo ou quando o usuário sai.

### Parte C — Sanidade geral

- `npm run build` + typecheck no front; `pytest` na esteira.
- Passada rápida em fila/funil/ficha/config/resultados/dashboard pra pegar quebra óbvia;
  corrigir o que for pequeno.

## Schema / dados

- Migration nova: `ALTER TABLE search_profile ADD COLUMN neighborhood text`.
- `types.ts`: `SearchProfile.neighborhood?: string | null` e idem em `SearchProfileInput`.
- Repo mock + supabase: ler/gravar `neighborhood`; `listCoverage` aceitar filtro de cidade.

## Riscos / fora de escopo

- Polling ao vivo depende do robô (GitHub Actions) terminar; se demorar além do teto, o
  usuário acompanha na Fila. Aceitável.
- Geocodificação de bairro via Nominatim é best-effort; fallback pra cidade garante o mapa.
- Não vamos reescrever a discovery Python além de aceitar o centro do bairro.
