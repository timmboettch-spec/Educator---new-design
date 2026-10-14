---
paths:
  - 'src/database/migrations/**/*.ts'
---

# Rules: `src/database/migrations/`

Extends `database-entities-rules.md` and the database section of root `CLAUDE.md`. Background: [DATABASE-GUIDE.md](../../docs/DATABASE-GUIDE.md) → "Entities & Migrations".

## Entity is the source of truth

1. **Entity first, then generate.** Never hand-write schema DDL and sync the entity afterwards (or never).
2. Every table, column, type, length, nullability, default, index, unique constraint, FK and enum in a migration must match an entity declaration exactly (decorators: `database-entities-rules.md`).
3. **Partial/conditional indexes:** declare them on the entity with `@Index(..., { where: '...' })` and use the identical condition in the migration.
4. **Unwanted statement in a generated file = drift.** Fix the cause, don't just edit the SQL.
5. **`migration:create` (hand-written)** is only for data migrations (backfills, value transforms) and things entities can't express (e.g. extensions). Never use it for entity schema.

## Generating

6. **Local DB only.** `.env` `DB_HOST`/`DB_NAME`/`DB_*` must point to local Postgres. If they point at dev, qa, prod or anything else: **stop and ask**.
7. **Sync first:** run `npm run migration:run:dev`, then confirm `npm run migration:show` shows `[X]` for every migration. Otherwise the diff also picks up other branches' changes.
8. **Generate:** `npm run migration:generate --name=<Name>`. Read the file and remove anything outside the intended change (unrelated drift, destructive statements from a stale DB).
9. **Hand-written:** `npm run migration:create -- src/database/migrations/<Name>`.

## Timestamps

TypeORM 0.3.x orders **only** by class-name timestamp. `migration:run` applies pending migrations in ascending order without warning. `migration:revert` undoes the **last-run** migration, not the highest timestamp. Fake timestamps reorder fresh-DB runs.

10. Keep the generated `Date.now()` ms timestamp. Never use `--timestamp`/`-t`. Never hand-pick, round, future-date or date-format one (❌ `1793100000000`, ❌ `2026091712150`).
11. The file name `<timestamp>-<Name>.ts` and class name `<Name><timestamp>` must use the identical timestamp.
12. **Sort after all dependencies.** If a dependency is newer and yours hasn't hit a shared env, regenerate yours. Test from an empty DB, not just incrementally.
13. **Never rename or retimestamp a migration applied to a shared env** (dev, qa, prod). TypeORM keys on the full class name, so it would re-run.
14. **Legacy fakes exist** (`1793…`/`1794…`, `2026091…`/`2026092…`, duplicate `1791300000000`). Real timestamps sort **before** them. If you depend on one, run all migrations from an empty DB.

## Content & safety

15. `synchronize` stays `false`.
16. Every `up()` has a full-reverse `down()`.
17. **Never edit a migration applied to a shared env.** Write a new corrective one.
18. **Never run `npm run migration:run`** (prod/compiled) locally against a shared DB. That's the pipeline's job.

## Definition of done

- [ ] `npm run migration:revert` then `npm run migration:run:dev` both succeed.
- [ ] `npm run migration:generate --name=DriftCheck` reports **no changes**. If it generates a file, fix the entity/migration, then delete `DriftCheck`.
- [ ] If you depend on a newer or legacy-timestamped migration: a full run from an empty DB succeeds.
