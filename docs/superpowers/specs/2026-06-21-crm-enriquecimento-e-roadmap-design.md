# Enriquecimento+ e roadmap de CRM — Design

Data: 2026-06-21
Autor: Gabriel (gab.feelix) + Claude

## Contexto

O CRM já tem Fila (aprovação) e Funil (kanban), mas falta o miolo de um CRM
"de verdade". Discussão estratégica com o dono levantou ~7 frentes. Esta sessão
implementa a primeira (Slice A) e registra a sequência das demais.

## Achado-chave: Meta Ad Library (testado ao vivo, 2026-06-21)

- A Ad Library API **retorna anúncios comerciais de PMEs no Brasil** (não só
  políticos). "Coco Bambu" em BR → 1.174 anúncios ativos.
- **Buscar por `search_terms = nome do negócio` é furado**: esse parâmetro busca
  o texto DENTRO do criativo, não o anunciante. Retorna páginas sem relação.
  O jeito atual da `ad_library.py` (nome → search_terms) gera ruído.
- **O caminho confiável é `page_ids`** (ID da página do Facebook do negócio).
- **Ponte barata pro page_id: raspar o link do Facebook do site** (que já
  baixamos no enriquecimento). Por isso enriquecimento e detecção de anúncio são
  o mesmo movimento. Requer conta com ad account ativa (token do dono).

## Decomposição (sub-projetos)

| # | Slice | Status |
|---|-------|--------|
| **A** | Enriquecimento+ do site (WhatsApp/Facebook/telefone) + campo whatsapp separado | **ESTA SESSÃO** |
| B | Página **Contatos** (tabela: filtro/busca/editar/arquivar/excluir) + busca no header | próxima |
| C | Meta "já anuncia?" via page_id (do Facebook do site) + backfill dos ~639 | depois de A |
| D | Extensão WhatsApp como painel de edição (notas, status, orçamento, editar campos) | depois |
| E | Agenda + notificações + campos de reunião (meeting_at/link/location) | depois |

Decisões do dono (2026-06-21):
- Slice A primeiro (hoje).
- Página de listagem = **"Contatos"**: tabela única com TODOS os leads, por
  status/tag, com filtro e busca. (Slice B)
- Backfill dos 639: **Meta primeiro** (marca quem já anuncia = fora do ICP),
  depois subagent só enriquece quem vale. (Slice C)

Oportunidades extras de CRM levantadas (futuro): tags/labels, tarefas/lembretes,
"último contato há X dias", import/export CSV, dedup/merge.

## Slice A — Enriquecimento+ do site (implementado)

**Esteira (Python):**
- `models.py`: Lead ganha `whatsapp` e `facebook`; ambos entram em
  `ENRICHABLE_FIELDS` (viram coluna via cascade quando vazios).
- `normalize.py`: `normalize_whatsapp` (reusa regra do telefone) e
  `normalize_facebook` (extrai o slug de facebook.com/<slug>).
- `validation.py`: `whatsapp` valida como telefone; `facebook` como slug.
- `sources/website.py`: novos extractors do HTML já baixado —
  `extract_whatsapp` (links wa.me / send?phone=), `extract_facebook` (página,
  pulando sharer/plugins/etc.), `extract_phone` (de `tel:` hrefs). O `enrich`
  emite os Findings (whatsapp 0.7, facebook 0.6, phone 0.5). O telefone só vira
  coluna se o lead ainda não tiver (cascade decide), mas a proveniência registra.
- `sink/supabase.py`: `_LEAD_COLS` inclui `whatsapp`, `facebook`.
- Testes: +4 em `test_website_extract.py` (110 no total, verde).

**Schema:** migration `20260621120002_lead_whatsapp_facebook.sql` (add columns
`whatsapp`, `facebook` em leads; aditivo/idempotente; aplicado em prod via
Management API).

**Front:**
- `types.ts`: `Lead.whatsapp?`, `Lead.facebook?` (opcionais) + em `LeadEditable`.
- `ficha`: linhas e campos de edição de WhatsApp e Facebook (com links e
  proveniência); WhatsApp vira link `wa.me`, Facebook link da página.
- Links de WhatsApp (ficha/fila/celular) passam a **preferir `whatsapp ?? phone`**.

**Fora do escopo de A:** o enriquecimento+ vale pra leads NOVOS (cascade só
processa `bruto`). Os ~639 já em `rascunho_pronto` são backfill do Slice C
(depois da Meta), conforme decisão do dono. A extensão lê `select=*`, então
recebe os campos novos sem alteração.

## Riscos

- Raspagem por regex é best-effort; rodapés variam. Falha = campo vazio (sinal),
  nunca erro — segue o padrão da fonte website.
- Telefone do site pode ser fixo; por isso WhatsApp é campo separado.
