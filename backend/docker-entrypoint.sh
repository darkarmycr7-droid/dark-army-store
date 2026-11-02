#!/bin/sh
set -e

echo "[entrypoint] Applying database schema (waiting for Postgres)…"
until npx prisma db push --skip-generate; do
  echo "[entrypoint] Database not ready, retrying in 3s…"
  sleep 3
done

if [ "$SEED_ON_START" = "true" ]; then
  echo "[entrypoint] Seeding initial data (idempotent)…"
  npx tsx prisma/seed.ts || echo "[entrypoint] seed skipped/failed (continuing)"
fi

echo "[entrypoint] Starting API server…"
exec node dist/index.js
