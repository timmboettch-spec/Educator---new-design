# Database Interaction Guide

Proof-of-concept reference for developers on how to work with the database in this
repo: seeding, entities/migrations, and the repository pattern in `src/database/`.
This is a practical how-to — for the architectural rationale, see
[`ARCHITECTURE.md`](./ARCHITECTURE.md) and the root `CLAUDE.md`.

All commands below assume the project root and a working `.env` (copy from
`.env.example`, never commit `.env`).

---

## 1. Seeders

Seeders populate **essential reference data** after migrations run (today: the two
auth roles, `District Admin` and `Educator`). The full policy lives in
[`.deployment/SEEDING.md`](../.deployment/SEEDING.md) — this section is the short
version.

### How it works

- `src/database/seeders/index.ts` scans `src/database/seeders/` for every
  `*.seeder.ts` (local) / `*.seeder.js` (compiled) file, imports each one, and
  expects a **default export** with the signature
  `(dataSource: DataSource) => Promise<void>`.
- Seeders run **sequentially, in filename-sorted order**, sharing one `DataSource`
  connection that `index.ts` initializes and destroys — a seeder must not call
  `dataSource.initialize()`/`destroy()` itself.
- If one seeder throws, the error is logged and the rest still run.
- `npm run seed:prod` (compiled) runs on **every container boot, in every
  environment** (dev/qa/prod share the same image/`CMD`). `npm run seed:local`
  runs the same thing via `ts-node` against your local DB.

### Generating a new seeder

1. Create the file directly — there is no CLI generator, just follow the pattern:

   ```typescript
   // src/database/seeders/schools.seeder.ts
   import { DataSource } from 'typeorm';
   import { Schools } from '../entities';

   export default async function seedSchools(dataSource: DataSource): Promise<void> {
     const schoolRepo = dataSource.getRepository(Schools);
     const schools = [{ name: 'Central High School', code: 'CHS-001' }];

     for (const school of schools) {
       const exists = await schoolRepo.findOneBy({ code: school.code });
       if (!exists) {
         await schoolRepo.save(school);
         console.log(`Seeded school: ${school.name}`);
       }
     }
   }
   ```

2. That's it — no npm script to add, no config file to register it in. It is
   auto-discovered the next time `seed:prod`/`seed:local` runs.
3. Run it locally: `npm run seed:local`.

### Running seeders

```bash
npm run migration:run   # run migrations first
npm run seed:prod       # compiled, runs in containers/CI
npm run seed:local      # ts-node, against your local dev DB, no build step
```

### Do NOT

- **Do not** add anything that isn't idempotent (check-then-insert, like
  `role.seeder.ts`). Every seeder here re-runs on every container boot, forever.
- **Do not** add sample/demo data (fake schools, bulk test students, demo
  educators, etc.) to `src/database/seeders/`. This directory always runs in
  **production**, unattended, with no per-environment allow-list.
  For dev-only sample data, write a one-off manual script under `scripts/` that a
  developer runs by hand against their own DB — never auto-discovered.
- **Do not** use `truncateBeforeSeed`/truncate logic against production data.
- **Do not** call `dataSource.initialize()` or `dataSource.destroy()` inside a
  seeder — `index.ts` owns that lifecycle for the whole batch.
- **Do not** assume the `seeders` array in `.deployment/seeding-config.json`
  controls which files run — it's descriptive metadata only. `seed:prod` always
  runs _every_ file it finds in the directory. The `enabled`/`autoSeed` flags are
  the only part of that config actually consumed (by `scripts/Deploy-Backend.ps1`,
  to decide whether to invoke `seed:prod` for an environment at all).

---

## 2. Entities & Migrations

TypeORM entities live in **`src/database/entities/`** (re-exported via
`entities/index.ts`) and are the source of truth for schema. Migrations live in
`src/database/migrations/`, generated from the entities via the TypeORM CLI wired
to `src/database/data-source.ts`.

**The entity is the single source of truth.** Always change the entity first and
generate the migration from it. A migration must never add schema that the entity
doesn't declare. That includes columns, types, nullability, defaults, indexes
(including partial ones via `@Index(..., { where })`), unique constraints, foreign
keys and enums. Hand-written `migration:create` files are only for data changes,
such as backfills, or for things an entity can't express, such as extensions.

To check, apply your migration locally and run
`npm run migration:generate --name=DriftCheck` again. It must report no changes.
If it generates a file, the entity and migration disagree. Fix that, then delete
the `DriftCheck` file.

`synchronize: false` is set in `data-source.ts` — schema changes **only** happen
through committed migrations, never auto-sync.

### Making a schema change

1. **Edit (or add) the entity** in `src/database/entities/`, e.g. adding a column:

   ```typescript
   @Column({ name: 'avatar_enabled', type: 'boolean', default: false })
   avatarEnabled!: boolean;
   ```

   - New entity → also add it to the `entities` array in
     `src/database/database.module.ts` (this is what both `TypeOrmModule.forFeature`
     and `data-source.ts` consume — `data-source.ts` imports `entities` from
     `database.module.ts`).

2. **Generate the migration against your local database only.** `migration:generate`
   diffs the entities against whatever DB your `.env` points to. Before you run it:

   - Check that `DB_HOST`, `DB_NAME` and the other `DB_*` values in `.env` point to
     your **local** Postgres (e.g. `localhost`). They must not point to the dev, qa
     or prod servers.
   - Bring the local DB up to date with `npm run migration:run:dev`, then run
     `npm run migration:show`. Every migration should be marked `[X]`, so the diff
     contains only your new change.

   ```bash
   npm run migration:generate --name=AddAvatarEnabledToStudents
   ```

   This writes `src/database/migrations/<timestamp>-AddAvatarEnabledToStudents.ts`.
   TypeORM fills in `<timestamp>` from `Date.now()`, i.e. the real current time in
   milliseconds (see [Migration timestamps](#migration-timestamps) below). **Always
   read the generated file.** If your local DB isn't in sync, the diff can pick up
   unrelated drift, such as reordered indexes or columns. Remove anything that isn't
   part of your intended change.

   For a migration you're writing by hand (e.g. a data migration, not a pure
   entity diff), use `migration:create` instead, which scaffolds an empty
   `up`/`down` pair without diffing:

   ```bash
   npm run migration:create -- src/database/migrations/BackfillSomething
   ```

3. **Run it locally** against your dev DB:

   ```bash
   npm run migration:run:dev
   ```

4. **Verify both directions** — the `down()` method must actually reverse the
   `up()`:

   ```bash
   npm run migration:revert   # confirm it undoes cleanly
   npm run migration:run:dev  # re-apply
   ```

5. Check status any time with:

   ```bash
   npm run migration:show
   ```

### Migration timestamps

TypeORM orders migrations **only** by the timestamp at the end of the class name
(e.g. `AddAvatarEnabledToStudents1790166751680`). The file name doesn't affect the
order. In the TypeORM version used here (0.3.x):

- `migration:run` applies **every** migration not yet listed in the `migrations`
  table, in **ascending timestamp order**. A migration with an older timestamp
  still runs even after newer ones have been applied, and TypeORM gives no warning.
- `migration:revert` undoes the migration that was **executed** last, i.e. the
  last row in the `migrations` table. That isn't necessarily the one with the
  highest timestamp.

So the timestamp has to be the **real time the migration was created**. Anything
else causes problems:

- **Wrong order on a fresh database.** On a new local DB, CI or a new environment,
  a migration that depends on a table or column from another migration only works
  if its timestamp is higher. Say someone hand-writes `1795000000000` (a future
  date), and a later real migration gets `1790166751680`. The later migration then
  runs first on every fresh DB and can fail.
- **Different schema history per environment.** On existing environments the same
  migrations run in order of deployment, but on fresh ones they run in timestamp
  order. The two can end up differently.
- **Name clashes.** Round or copied timestamps such as `1791300000000` make
  duplicates likely. Two migrations in this repo already share `1791300000000`.

Rules:

- Always create migrations with `npm run migration:generate` /
  `npm run migration:create` and keep the timestamp TypeORM generates. **Don't**
  pass `--timestamp`/`-t`, and don't rename the file or class to a made-up number
  such as `1793100000000` or a date-shaped number such as `2026091712150`.
- The timestamp in the file name and the class name must be identical.
- If your branch lives a long time and someone merges a migration into `dev` with a
  **newer** timestamp that yours depends on, regenerate yours so it sorts after it.
  Only do this if yours hasn't been applied to a shared environment yet.
- **Don't** change the timestamp of a migration that has already run on dev, qa or
  prod. TypeORM stores the full class name in the `migrations` table, so a renamed
  migration looks new and runs again.

> **Legacy note:** some existing migrations were given hand-picked timestamps,
> either future-dated (`1793…`/`1794…`, which is about Oct–Nov 2026) or
> date-shaped (`20260917…`, `20260923…`, which as milliseconds is around 2034).
> A new migration with a real timestamp sorts **before** these. If your migration
> depends on one of them (e.g. `user_roles`, `user_tokens`, `district_admins`),
> test it on a completely empty database (`migration:run:dev` from scratch) before
> opening the PR.

Production/CI apply migrations with `npm run migration:run` (uses the compiled
`dist/database/data-source.js` via `typeorm:prod`) — this is invoked by the deploy
pipeline, not run manually against prod by developers.

### Do NOT

- **Do not** set `synchronize: true`, ever — it's how you silently drop/alter
  production columns.
- **Do not** hand-edit a migration file that has already been applied to a shared
  environment (dev/qa/prod). If the shape is wrong, write a **new** migration to
  fix it forward.
- **Do not** commit an autogenerated migration without reading it — diffs against
  a stale local DB can include destructive statements you didn't intend (dropped
  columns/indexes from other in-progress branches).
- **Do not** run `migration:generate` against a shared dev/qa/prod database.
  Generate only against your local DB, after bringing it fully up to date.
- **Do not** hand-pick, round or future-date a migration timestamp, and don't
  rename a generated migration's timestamp. Keep the real `Date.now()` value
  TypeORM writes (see [Migration timestamps](#migration-timestamps)).
- **Do not** skip writing a correct `down()` — an empty or wrong `down()` blocks
  `migration:revert` for everyone after you.
- **Do not** reference the raw TypeORM entity from application code outside
  `src/database/` (and `src/users/`, which still owns `User`/`Role` directly per
  the existing exception) — go through the repository. Entities are private
  implementation detail of the database layer.
- **Do not** run `migration:run` (the prod script) against a shared qa/prod
  database from your machine — that's the deploy pipeline's job.

---

## 3. Repository Pattern

`src/database/` is the abstraction layer between the app and the ORM. It follows a
strict per-entity structure: **entity → repository → token → module wiring**. This
is additive alongside older per-domain entities/services (e.g. `UsersService` still
owns `user.entity.ts` directly under `src/users/`) — it is not a wholesale
replacement, and there is **no separate `contracts/`/interface layer**: repositories
are concrete TypeORM classes, injected and typed by their class directly.

### What to create for a new entity

Say you're adding a `Certificate` entity. Create, in this order:

1. **Entity** — `src/database/entities/certificate.entity.ts`
   (a plain `@Entity()` TypeORM class), then re-export it from
   `src/database/entities/index.ts`.

2. **Repository** — `src/database/repositories/certificate.repository.ts`:

   ```typescript
   import { Injectable } from '@nestjs/common';
   import { InjectRepository } from '@nestjs/typeorm';
   import { Repository } from 'typeorm';
   import { Certificate } from 'src/database/entities';
   import { CreateCertificateInput } from 'src/common/interfaces';

   @Injectable()
   export class CertificateRepository {
     constructor(
       @InjectRepository(Certificate)
       private readonly repo: Repository<Certificate>,
     ) {}

     async createForStudent(input: CreateCertificateInput): Promise<Certificate> {
       return this.repo.save(this.repo.create(input));
     }

     async findByStudentId(studentId: string): Promise<Certificate[]> {
       return this.repo.find({ where: { studentId }, order: { createdAt: 'DESC' } });
     }

     async findById(certificateId: string): Promise<Certificate | null> {
       return this.repo.findOne({ where: { certificateId } });
     }
   }
   ```

   Repositories expose **specific, intent-named methods** only — one per query
   or write a consumer actually needs (`findByStudentId`, `deactivate`,
   `countActiveByClass`, a `createQueryBuilder` query, a transactional
   `acceptInvite`). Don't add generic pass-throughs that take TypeORM options
   from the caller (`find(options)`, `findOne(options)`, `update(where, data)`,
   `delete(where)`); older repositories still have some, but new code neither
   adds them nor adds call sites to them. TypeORM types (`FindOptionsWhere`,
   `FindOneOptions`, `DeepPartial`, `EntityManager`, …) stay inside the method
   body — public signatures take plain values or a params interface
   (`CreateCertificateInput`) declared in `src/common/interfaces/`, never in the
   repository file. Full rules: `.claude/rules/database-repositories-rules.md`.
   Re-export the class from `src/database/repositories/index.ts`.

3. **Token** — add to `src/database/tokens.ts`:

   ```typescript
   export const CERTIFICATE_REPOSITORY = Symbol('CERTIFICATE_REPOSITORY');
   ```

4. **Wiring** — in `src/database/database.module.ts`:
   - add `Certificate` to the `entities` array (feeds both
     `TypeOrmModule.forFeature` and `data-source.ts`'s migration entity list),
   - add `{ provide: CERTIFICATE_REPOSITORY, useClass: CertificateRepository }`
     to `providers`,
   - add `CERTIFICATE_REPOSITORY` to `exports`.

   `DatabaseModule` is `@Global()`, so once exported, any module can inject the
   token without importing `DatabaseModule` itself.

5. **Consume it** by injecting the token and typing against the concrete class:

   ```typescript
   constructor(
     @Inject(CERTIFICATE_REPOSITORY)
     private readonly certificateRepo: CertificateRepository,
   ) {}
   ```

### Transactions — use `DatabaseService`

Multi-step writes that must succeed/fail atomically (e.g. redeeming a code and
activating a user) go through `DatabaseService.runInTransaction`, injected via
`DatabaseService` (it's provided/exported by the `@Global()` `DatabaseModule`, so
just inject it like any other provider — no token needed):

```typescript
constructor(private readonly databaseService: DatabaseService) {}

async redeemAndActivateUser(params: RedeemParams): Promise<User | null> {
  return this.databaseService.runInTransaction(async (manager) => {
    const userRepo = manager.getRepository(User);
    const redemptionRepo = manager.getRepository(Redemption);

    const user = await userRepo.findOne({ where: { id: params.userId } });
    if (!user) return null;

    await redemptionRepo.save(redemptionRepo.create({ user, ...params }));
    user.is_license_active = true;
    return userRepo.save(user);
  });
}
```

See `src/users/redemptions.service.ts` and `src/schools/schools.service.ts` for
real examples. Note the one deliberate exception to "always go through the
repository class": **inside** a `runInTransaction` callback, use
`manager.getRepository(Entity)` for the entities participating in that
transaction, not the injected repository singleton — the injected repository is
bound to the app's default (non-transactional) connection, so writes through it
inside the callback would not be part of the transaction and would not roll back
with it. Everything outside the transaction callback still goes through the
normal repository/token.

Never reach for `@InjectDataSource()`/a raw `DataSource` in application code to
do this yourself — `DatabaseService` is the one place that owns the connection.

### Do NOT

- **Do not** call the database from a service/controller by any path other than
  a repository (its token) or `DatabaseService` — no `@InjectRepository()`, no
  `@InjectDataSource()`, no raw `dataSource.query(...)` in feature code. If a
  query doesn't exist yet, add a method to the relevant repository rather than
  reaching around it.
- **Do not** inject a raw `Repository<T>` (via `@InjectRepository`) into a
  service/controller outside `src/database/repositories/` — always go through the
  repository class and its token. This is what lets the ORM be swapped later
  without touching consumers.
- **Do not** re-introduce a `contracts/`/interface layer for repositories —
  inject and type against the concrete repository class directly (e.g.
  `private studentsRepo: StudentsRepository`), per the existing pattern.
- **Do not** put business logic in a repository — it's a thin CRUD-ish adapter
  (`create`/`find`/`findOne`/`update`/`delete`/entity-specific finders like
  `findBySubscriptionCode`). Query composition and rules belong in the calling
  service.
- **Do not** forget to add the new token to both `providers` **and** `exports` in
  `database.module.ts` — a token that's provided but not exported will fail to
  resolve (`Nest can't resolve dependencies`) in any other module.
- **Do not** mix the injected (non-transactional) repository singleton with
  `manager.getRepository(Entity)` for the same write inside a
  `runInTransaction` callback — pick one per transaction (the manager-scoped
  one) so every statement actually participates in the transaction/rollback.
