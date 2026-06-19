#!/usr/bin/env bash
# Aplica as migrations no banco Supabase apontado por SUPABASE_DB_URL (.env).
# Uso: bash scripts/db-push.sh [--dry-run]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$ROOT/.env" ]; then
  set -a; . "$ROOT/.env"; set +a
fi
: "${SUPABASE_DB_URL:?defina SUPABASE_DB_URL no .env (veja .env.example)}"

cd "$ROOT"
exec npx supabase db push --db-url "$SUPABASE_DB_URL" "$@"
