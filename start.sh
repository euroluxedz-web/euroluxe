#!/bin/sh
# Euroluxe container entrypoint
# 1. Apply the Prisma schema to PostgreSQL (idempotent — safe on every boot)
# 2. Start the Next.js production server

set -e

echo "[start] Applying database schema..."
npx prisma db push --skip-generate --accept-data-loss 2>&1 || echo "[start] WARNING: prisma db push failed — starting anyway"

echo "[start] Launching Next.js on port ${PORT:-3000}..."
exec npx next start -p "${PORT:-3000}"
