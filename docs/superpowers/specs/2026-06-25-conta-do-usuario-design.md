# Conta do usuário (perfil, email, senha, foto)

Data: 2026-06-25
Frente: 2 de 3. Independente da Frente 1 (extensão) e da 3 (pesquisa).

## Problema

O CRM tem `/config` (Configurações do **sistema**: busca, profissão, autopilot, extensão, calendar) mas não tem onde o usuário gerencia a **própria conta**: nome de exibição, email de acesso, senha e foto. Padrão de CRM (Pipedrive, HubSpot, RD) separa "Configurações" (sistema) de "Minha conta" (você). Hoje o avatar no app-shell só oferece "Sair".

## Objetivo

Página `/conta` dedicada onde o usuário altera nome, email, senha e foto de perfil, com segurança (reauth) e tratamento gracioso do modo mock. Avatar passa a aparecer no app-shell (foto quando houver, iniciais como fallback).

## Decisões travadas (com o dono)

- Página `/conta` dedicada (não aba do /config, não modal).
- Foto **agora**, ponta a ponta: migration do bucket `avatars` + `npm run db:push` no Supabase real (o dono autorizou usar o `.env` e dar o push).
- Trocar email/senha **exige a senha atual** (reauth) antes de aplicar.

## Arquitetura

### 1. Rota `/conta` (camada front, page)

`front/src/app/(app)/conta/page.tsx` — dentro do grupo `(app)`, herda o AppShell. Client component, segue o padrão visual de `/config` (componente `Section`) e os inputs do login. Duas seções:

- **Perfil**: nome de exibição + foto.
- **Acesso e segurança**: email + senha. Ambos exigem senha atual.

Cada ação salva isoladamente (botão por campo/bloco), não um "salvar tudo" — reduz risco e deixa claro o que mudou.

### 2. Camada de ações (camada front, lib)

`front/src/lib/account.ts` — funções puras sobre o Supabase Auth/Storage, cada uma guardando o modo mock (lança erro amigável "disponível no modo real" se `activeDataSource() === "mock"`):

- `updateName(name)` → `supabase.auth.updateUser({ data: { full_name: name } })`.
- `reauth(email, currentPassword)` → `supabase.auth.signInWithPassword(...)`; usado antes de email/senha. Erro → "senha atual incorreta".
- `updateEmail(newEmail, currentPassword)` → reauth, depois `updateUser({ email })`. Supabase dispara email de confirmação ao novo endereço; a troca só vale após confirmar (a UI avisa isso).
- `updatePassword(newPassword, currentPassword)` → reauth, depois `updateUser({ password })`. Valida força mínima da nova senha.
- `uploadAvatar(file)` → valida tipo (png/jpeg/webp) e tamanho (≤ 2 MB), sobe pra `avatars/{uid}/avatar.{ext}` com `upsert: true`, pega a URL pública e grava `updateUser({ data: { avatar_url } })`.
- `removeAvatar()` → limpa `avatar_url` (e remove o objeto do Storage).

A skill **code-security** é consultada na implementação dessas funções (validação de entrada, tamanho/tipo de arquivo, sem vazar mensagem de erro crua do Supabase).

### 3. Storage (camada Supabase, migration)

`supabase/migrations/2026062512XXXX_avatars_bucket.sql`:

- Cria o bucket `avatars` **público** (leitura via URL pública; avatar não é dado sensível).
- Policies em `storage.objects` restringindo escrita: o usuário só insere/atualiza/apaga objeto cujo primeiro segmento do path é o próprio `auth.uid()` — `(storage.foldername(name))[1] = auth.uid()::text`. Leitura pública (bucket público).

Aplicada com `npm run db:push` (dry-run antes: `npm run db:push:dry`).

### 4. Sessão e exibição (camada front, auth + app-shell)

- `AuthUser` (em `auth.tsx`) ganha `avatar_url: string | null`, lido de `user_metadata.avatar_url` no `toUser`. Exponho `refreshUser()` pra a página atualizar a UI após salvar (re-lê a sessão).
- `app-shell.tsx`: o bloco do avatar (~linha 600) passa a renderizar `<img src={avatar_url}>` quando houver, senão as iniciais. E vira um menu leve (mesmo padrão de popover do ExtensionBadge): **Minha conta** (→ `/conta`) + **Sair**.

## Fluxo de dados

1. Usuário abre o menu do avatar → "Minha conta" → `/conta`.
2. Edita um campo → clica salvar do bloco → função de `account.ts` (reauth quando aplicável) → Supabase.
3. Sucesso → toast + `refreshUser()` → app-shell reflete (nome/foto novos).
4. Email: toast explica que um link de confirmação foi enviado ao novo endereço.

## Erros e bordas

- **Mock mode**: página renderiza os campos read-only/desabilitados com aviso "disponível no modo real". Nenhuma ação chama Supabase.
- **Senha atual errada**: erro inline no bloco, nada é alterado.
- **Email já em uso / inválido**: mensagem amigável (sem vazar erro cru).
- **Upload falha / arquivo grande / tipo errado**: erro inline, foto não muda.
- **Foto pública**: documentar que a URL é pública (aceitável pra avatar).

## Testes

- Migration: `npm run db:push:dry` valida o SQL antes do push real.
- Helpers de validação (força de senha, tipo/tamanho de arquivo) — testes unitários pequenos, só do núcleo puro.
- Front: eslint + tsc limpos. Comportamento visual confirmado por inspeção/preview, sem suíte pesada de UI.
- Não testar reauth/updateUser com mock de Supabase (over-test pra ganho baixo); confiar nos tipos + revisão.

## Fora de escopo (YAGNI)

- 2FA / MFA.
- Trocar email sem confirmação (mantém o fluxo seguro do Supabase).
- Crop/edição da foto no cliente (sobe como veio, dentro do limite).
- Histórico de logins / sessões ativas.

## Arquivos tocados

- `supabase/migrations/2026062512XXXX_avatars_bucket.sql` (novo)
- `front/src/app/(app)/conta/page.tsx` (novo)
- `front/src/lib/account.ts` (novo)
- `front/src/lib/auth.tsx` (AuthUser.avatar_url + refreshUser)
- `front/src/components/app-shell.tsx` (avatar com foto + menu "Minha conta")
