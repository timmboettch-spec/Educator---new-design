#!/bin/sh
# Runs the database seeders. Run by the migrate Container Apps Job right after
# migrate.sh, NOT at app startup. Seeders are idempotent (see
# src/database/seeders/index.ts) — safe to re-run.
set -e

echo "Running seeds..."
npm run seed:prod
echo "Seeds complete."
