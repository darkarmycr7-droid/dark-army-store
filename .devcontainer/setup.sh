#!/usr/bin/env bash
# First-run setup for a Codespace / dev container.
#
# Brings the whole ERP up from a bare clone: real .env files from the tracked
# examples, both dependency trees, and a freshly seeded SQLite database. Safe to
# re-run — existing .env files and an existing database are left alone.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Backend"
cd "$root/backend"
# -n: never clobber a .env someone has already edited.
cp -n .env.example .env 2>/dev/null || true
npm ci
# prisma generate + db push + seed. The seed also copies the committed product
# photos from prisma/seed-images into uploads/.
npm run setup

echo "==> Frontend"
cd "$root/frontend"
cp -n .env.local.example .env.local 2>/dev/null || true
npm ci

cat <<'EOF'

==> Ready.

Start both servers in two terminals:

  cd backend  && npm run dev     # API on 4000
  cd frontend && npm run dev     # Store + Admin on 3200

Then open the forwarded port 3200. The frontend proxies /api and /uploads to
the backend, so port 3200 is the only one you need.

  Store   /
  Admin   /admin/login      admin@darkarmy.store / admin123
  POS     /pos

EOF
