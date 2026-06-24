# Copy humana com auto-apresentação — design

Data: 2026-06-24

## Problema
A copy de abertura (msg1) gerada pela esteira soava comercial/coach/robótica e
**não apresentava quem está falando**. O dono quer mensagem que soe gente: pessoa
real puxando conversa, curiosa, humana, com auto-apresentação ("me chamo X, ...").

## Voz alvo (msg1 = só abertura; pitch é passo 2)
Estrutura solta, varia a cada lead:
1. Cumprimento natural variado ("Oi, tudo bem?", "Opa, tudo bem?", "Bom dia, tudo certo?").
2. Apresentação leve: `me chamo {sender_name}, {self_desc}` — identidade, NÃO oferta.
3. Observação real e curiosa do negócio (reputação, sem site, já anuncia...), honesta, nunca diagnóstico/acusação.
4. UMA pergunta aberta, de curiosidade genuína, como a um conhecido.

Proibido: travessão; cargo pomposo (gestor de tráfego/growth/especialista); jargão de
leigo; "região"/"aqui perto" (diga "no Google"); **número cru** (nota/avaliações);
buzzword; >1 emoji; vender na 1ª msg; pergunta-diagnóstico/agressiva; repetir "vocês" (máx 2).

## self_desc por profissão (linguagem de leigo)
- tráfego / **ambos** / marketing → `trabalho com marketing pra negócio local`
- design / web / branding → `mexo com criação de site pra negócio local`
- automação (puro) → `trabalho com atendimento no WhatsApp pra negócio local`
- desenvolvedor (futuro) → `desenvolvo site e sistema pra negócio local`
- fallback → `trabalho com marketing pra negócio local`

## Onde mexer
1. **Migration** `search_profile.sender_name text` — nome de quem prospecta.
2. **Onboarding (front)** — após login, se `sender_name` vazio → tela obrigatória
   "Como você quer ser chamado?" (nome). Salva no perfil. Padrão de mercado.
3. **`draft/prompt.py`** — `SYSTEM_INSTRUCTION` reescrito pra voz acima; `build_prompt`
   injeta `sender_name` + `self_desc` (derivado da profissão); reputação como PALAVRA,
   nunca número; pergunta-diagnóstico vira PROIBIDO.
4. **`draft/mock.py`** — mesma voz no piso determinístico (fallback).
5. **Seed** `sender_name` dos donos atuais: gab.feelix=Gabriel, gu2012.rocha=Gustavo,
   4yumkt+yamamoto+trafegodojapa+gab.feelix1=Eduardo (mesmo dono, várias contas).

## Re-gerar os 1199 (rascunho_pronto)
- Modelo: **Haiku** (teste de 4 confirmou que dá conta da voz; único defeito, número
  cru, resolvido tirando o número do contexto + validação).
- Fluxo: prep (contexto sem número, com sender_name+self_desc) → ~30 subagents Haiku →
  validação dura (rejeita diagnóstico/cargo/travessão/número/sem-nome) → fallback no
  mock-novo → push. Backup já existe (`scratchpad/copy/backup.json`).
- Antes do run cheio: mostrar ~10 reescritos pro dono aprovar a voz.

## Não-objetivos
- Não coletar a self_desc no onboarding (derivada da profissão por ora).
- Não mexer em `enviado`/`respondeu`/`descartado`.
