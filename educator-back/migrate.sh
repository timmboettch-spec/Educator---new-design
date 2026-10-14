#!/bin/sh
# Applies pending TypeORM migrations. Run by the migrate Container Apps Job
# (infra/modules/containerAppsJob-migrate.bicep) on every deploy, NOT at app
# startup. TypeORM tracks applied migrations, so re-running is safe.
set -e

echo "Running migrations..."
npm run migration:run
echo "Migrations complete."
