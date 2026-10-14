# CLAUDE.md

## Agent docs

- Specs, tickets/issues and plans: write **all** of them under `docs-local/` (git-ignored, local only) — never at the repo root or in `docs/`. Layout: `docs/agents/issue-tracker.md`. Triage labels: `docs/agents/triage-labels.md`.
- Domain: root `CONTEXT.md` + `docs/adr/` — `docs/agents/domain.md`.
- Path-scoped rules in `.claude/rules/` load automatically for controllers, services, DTOs, `src/common/`, auth, and `src/database/` (entities, repositories, migrations).

## Project Overview

NestJS REST API for the Educator App (Realityworks AI healthcare simulation platform) on Azure Container Apps + PostgreSQL Flexible Server. Manages educators, classes and students; integrates with the student simulation app (`HS-online-AI-app`) via shared Azure Blob Storage (`units.json`, `scenarios.json`, `reports.json`).

**Two Nest apps in one process:**

- Root `AppModule` (`src/*`) — the educator-facing API.
- `StudentBackend` (`src/student-backend/*`) — mounted at `/students-backend` via `RouterModule.register(...)` in `src/student-backend/app.module.ts`, imported into `AppModule`. Own `modules/`, `data/`, `helpers/`. Global guards, `HttpExceptionFilter`, `ResponseInterceptor` and versioning cover it; for anything else, check its `helpers/` before assuming `src/common` applies.

Package manager: **npm** (`package-lock.json` is the committed lockfile).

## Commands

```bash
npm run build              # nest build
npm run start:dev          # http://localhost:3000, prefix /api, health at /health
npm run lint | lint:fix
npm run format:check       # see Conventions before running `npm run format`

npm test                   # unit (jest config inline in package.json: tests/unit/**/*.spec.ts, src/**/*.spec.ts, maxWorkers 1)
npm run test:unit          # unit, root app + student-backend
npm run test:integration   # tests/jest-integration.json + student-backend config — needs a real DB
npm run test:e2e           # tests/jest-e2e.json
npm run test:api | test:api:smoke   # against a running server (--runInBand --forceExit)

npx jest path/to/file.spec.ts
npx jest --config tests/jest-integration.json path/to/file.integration.spec.ts

# TypeORM migrations (src/database/data-source.ts)
npm run migration:generate -- src/database/migrations/MigrationName
npm run migration:create -- src/database/migrations/MigrationName
npm run migration:run:dev | migration:revert | migration:show
```

Integration/e2e/api suites each have their own `tests/**/jest-*.json` — check it before assuming module mapping, test regex or timeouts.

## Architecture

- **Module-per-domain** under `src/` (`students/`, `schools/`, `class/`, `simulation/`, `lti/`, `lms/`, …): `*.module.ts`, `*.controller.ts`, `*.service.ts`, `entity/`, `dto/`. Cross-cutting code in `src/common/`.
- **Auth** — one global default-deny `AuthGuard` (`src/common/guards/auth.guard.ts`, [ADR-0005](docs/adr/0005-single-global-default-deny-auth-guard.md)). Global guard order: `AuthThrottlerGuard` → `AuthGuard` → `CsrfGuard` (`src/csrf/`), so unauthenticated gets 401 before CSRF's 403.
  - Every route declares **exactly one** of `@Public()`, `@AllowRoleSelectionToken()` or `@RequiredRoles(...)`. `@Public()` only per ADR-0005's public-route rule. Missing markers fail `tests/integration/auth/route-coverage.integration.spec.ts`.
  - `@RequiredRoles` is any-of against the token's **selected role** ([ADR-0006](docs/adr/0006-selected-role-rbac.md)); roles are flat, so a route open to everyone lists all four roles. A route-level `@RequiredRoles` replaces the controller-level one.
  - Allowed roles per route: [`docs/rbac-role-matrix.md`](docs/rbac-role-matrix.md), mirrored as `ROLE_MATRIX` in the route-coverage test — **change both together**.
  - **Never** check roles imperatively in a controller or service, add `@UseGuards(...)` for auth/roles, or register a second auth `APP_GUARD`. Non-auth guards are fine. Ownership/school scoping and `resolveActingEducatorId`/`resolveActingAdminId` belong in the service; `@RequiredRoles` never implies row-level isolation.
  - Machine callers: `@ServiceAuth()` ([ADR-0007](docs/adr/0007-service-key-auth-for-machine-callers.md)).
  - Token/cookie internals: `.claude/rules/auth-rules.md` (loads when editing auth code).
- **Error messages**: new code uses i18n message keys (`ERROR_MSG`/`SUCCESS_MSG`/`VALIDATION_MSG` in `src/common/messages/`, paired with `src/common/i18n/en/`); the flat `Messages` object in `utils/messages.ts` is legacy — don't add to it.
- **Global wiring** (never re-apply per controller): `main.ts` sets the `ValidationPipe` (`createValidationPipe()`: whitelist, forbidNonWhitelisted, transform, first error per field), prefix `api` (excluding `api-docs`, `health`, `healthz`, `readyz`), Swagger at `/api-docs`, `cookie-parser`. `AppModule` registers `HttpExceptionFilter` (`APP_FILTER`), `RequestTimeoutInterceptor` + `ResponseInterceptor` (`APP_INTERCEPTOR`) and the guards above.
- **Response envelope is opt-in per route**: `ResponseInterceptor` wraps only `ResponseResult` bodies (`src/common/class/response.class.ts`) into `{ message, data, meta, error }`; any other body passes through byte-for-byte. Migrating a route = its service returns `ResponseResult` (a deliberate contract change). Errors are **always** enveloped by `HttpExceptionFilter`.
- **Versioning**: URI versioning with `VERSION_NEUTRAL` default (`main.ts`). Add `@Version('1')` only to a route/controller that needs a breaking change — never blanket.
- **Data layer**: TypeORM + PostgreSQL. `src/database/` is a repository layer (`entities/` → `repositories/` → `tokens.ts` → `database.module.ts`), alongside legacy per-domain entities (e.g. `src/users/entity/`). Services inject repositories by token and type against the concrete repository class — never a raw `Repository<T>`. New repository methods are **specific and intent-named** (`findPendingByEmail(email)`), never generic pass-throughs taking TypeORM options; services never build `FindOptions`. Details in `.claude/rules/database-*.md`.
- **Outbound HTTP**: every outbound HTTP call must go through the `OutboundHttpClient` service (`src/common/services/outbound-http.client.ts`) — never call `axios`/`fetch`/`HttpService` directly ([ADR-0011](docs/adr/0011-outbound-http-time-bounded-and-request-scoped.md)).
- **Rate limiting**: `@nestjs/throttler` with Redis-backed `RedisFallbackThrottlerStorage` (degrades if Redis is down).
- **Logging**: `nestjs-pino`; request context via `nestjs-cls`.
- **Config**: one `registerAs('<ns>', ...)` file per concern in `src/common/config/`, added to the `envConfig` array in `src/common/config/index.ts` (no `app.module.ts` change). Read via `configService.get<T>('<ns>.<key>')`.

## Conventions

- Prettier: single quotes, semicolons, trailing commas, 100-char width, 2-space indent. The repo is **not** Prettier-clean — format only changed files (`npx prettier --write <files>`), never repo-wide `npm run format`.
- ESLint errors: `no-explicit-any`, `no-unsafe-*`, `no-floating-promises`. Prefer explicit return types on exported functions.
- Imports: `@/*` and `src/*` both map to `src/`; follow the surrounding file's style.
- DTOs: `class-validator`/`class-transformer`; never re-validate manually.
- **Types/interfaces** → `src/common/interfaces/<name>.interface.ts` (re-exported from `index.ts`), unless private to one file's implementation.
- **Constants and enums** → `src/common/constants/<name>.constants.ts` (re-exported from `index.ts`). Constants: a `PascalCaseConstants` grouping object with `SCREAMING_SNAKE_CASE` keys (`PaginationConstants.DEFAULT_PAGE_SIZE`). Enums: `PascalCase`, same folder. No inline enums or bare top-level constants elsewhere. `src/common/enums/` is legacy — don't add to it.
- **Dates**: dayjs only, imported from `src/common/utils/dayjs.utils.ts` (`dayjs`, `nowUtc`, `toUtc`, `toUtcIsoString`), never from `'dayjs'`. UTC by default. No other date library, no raw `Date` math.
- Variables and parameters: `camelCase` everywhere.
- Commits: Conventional Commits (`CONTRIBUTING.md`). Branches: `feature/{ticket}-{desc}` off `dev`, `bugfix/…` off `qa`, `hotfix/…` off `main` (`main`→prod, `qa`→qa, `dev`→dev).

## Do NOT

- Rename/delete `main`, `qa`, `dev`, or force-push shared branches.
- Hand-edit `dist/`.
- Add a dependency without checking `overrides` in `package.json` (pinned for security: `multer`, `nodemailer`, `ws`, `undici`, `form-data`, `socket.io-parser`, nested `js-yaml`).
- Commit `.env` — only `.env.example` is tracked.

## Verification

- Always: `npm run lint`, `npm run build`, and the relevant test tier.
- Logic changes: `npm run test:unit`.
- DB access, entities or migrations: also `npm run test:integration` (real Postgres via `.env`).
- Routes/controllers: consider `npm run test:e2e` and/or `tests/api/modules/**` via `npm run test:api`.
