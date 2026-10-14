# Recent Changes: Cookie-Based Auth & Env Config/DTO Pattern

This covers two related backend changes and what to do (and not do) about them going forward.
Applies to both the root app (`src/*`) and `src/student-backend/*` — they share one process and
one cookie.

---

## 1. Access tokens moved to httpOnly cookies

### What changed

The backend no longer expects callers to store the access token in JS and attach it manually via
`Authorization: Bearer`. Every token-issuing endpoint (`signup`, `dual-role-signup`, `login`) now
also sets it as an `httpOnly` cookie, and every protected route accepts the token from that cookie
first, falling back to the `Authorization` header if no cookie is present.

Single source of truth: `TokenService` (`src/common/services/token.service.ts`) —
`generateTokens()`, `setAuthCookies()`, `clearAuthCookies()`, `verifyToken()`. Extraction is
cookie-first with header fallback via `extractAccessToken()` (`src/common/utils/token-extractor.util.ts`),
used by both root and student-backend `JwtStrategy`, and by the Socket.IO gateway
(`extractAccessTokenFromCookieHeader()`, since `cookie-parser` doesn't run on the WS handshake).

Cookie (`accessToken`): `httpOnly` always; `secure`+`sameSite: 'strict'` in production,
`sameSite: 'lax'` otherwise; `maxAge` matches the token's `expires_in` (`JWT_EXPIRES_IN`, default
24h). **There is no refresh token / refresh endpoint** — on expiry, the user re-authenticates.

Login/signup response bodies still include the token (`data.tokens.accessToken`, and
`data.educator_tokens.accessToken` for dual-role accounts) for backward compatibility during the
transition — this is informational, not something new code should store and re-send.

One deliberate gap: `dual-role-signup` and the dual-role branch of `login` issue an Educator token
and an Admin token, but `TokenService` only has one fixed cookie name, so only the **Admin** token
is set as the cookie. The Educator token exists only in the response body. We will be refactoring this in next tasks.

### Do

- Set the token via `TokenService.setAuthCookies()`/`clearAuthCookies()` for any new endpoint that
  issues or invalidates tokens — never hand-roll `res.cookie(...)` for auth tokens elsewhere.
- Use `extractAccessToken()` (or the cookie-header variant for non-Express contexts like a WS
  handshake) to read the token — never read `req.cookies.accessToken` or the `Authorization`
  header directly in new code.
- If a new flow needs a second, simultaneously-valid token for a different role (like dual-role
  today), keep returning it in the response body and require it be sent as a Bearer header — don't
  try to cram a second cookie in without a real per-purpose cookie name.
- Tell frontend/API consumers to send credentials (`credentials: 'include'` / `withCredentials:
true`) on every request, and on Socket.IO connections, once cookie auth is expected.

### Do not

- Do not introduce a second cookie name/shape for tokens without discussing it — `TokenService` is
  intentionally the single source of truth for cookie attributes (httpOnly/secure/sameSite/maxAge)
  so token handling stays consistent across both apps.
- Do not add a silent client-side refresh flow assuming a refresh token exists — it doesn't. If
  refresh tokens get added later, they go through `TokenService`, not ad hoc.
- Do not remove the `Authorization: Bearer` fallback from `extractAccessToken()` without confirming
  every consumer (mobile clients, server-to-server calls, tests) has moved to cookies first.
- Do not assume the CSRF guard (`src/csrf/csrf.guard.ts`) is actively enforcing anything right now
  — it currently has an unconditional `return true;` before its real checks. Treat that as a bug to
  fix or a deliberate temporary state to confirm with the team, not as "CSRF is handled."

---

## 2. Env vars: `registerAs` config + validated DTO

### What changed

`src/config/env.validation.ts`, `src/config/db.config.ts`, `src/config/azure-blob.config.ts`, and
`src/config/security-headers.config.ts` were removed in favor of the existing
`src/common/config/` structure, which is now the **only** place env vars are read and validated:

- `src/common/config/env.validation.ts` — one `EnvironmentVariables` class, `class-validator`
  decorators on every env var the process reads. Passed to `ConfigModule.forRoot({ validate })` in
  `src/app.module.ts`, so an invalid/missing required value crashes app **startup**, not some
  request three services deep later. Fields with no `@IsOptional()` are load-bearing (DB, JWT,
  `NODE_ENV`) — everything else is optional with a fallback or opt-in behavior.
- `src/common/config/<name>.config.ts` — one file per concern (`jwt.config.ts`, `app.config.ts`,
  `database.config.ts`, `redis.config.ts`, `ai.config.ts`, …), each a `registerAs('<namespace>', () =>
({...}))` default export that turns already-validated env vars into a typed, namespaced object.
- `src/common/config/index.ts` — re-exports every config's default export as the flat `envConfig`
  array passed to `ConfigModule.forRoot({ load: envConfig })`, plus `validateEnv`.
- Consumers inject `ConfigService` and read `configService.get<T>('<namespace>.<key>')` — e.g.
  `TokenService` reads `jwt.accessSecret`/`jwt.accessExpiresIn`.

### Do

- Add a new env var in three steps: (1) a field on `EnvironmentVariables` in
  `src/common/config/env.validation.ts` with the right `class-validator` decorators, (2) a
  read/parse of it inside the relevant `src/common/config/<name>.config.ts` `registerAs` factory
  (add a new config file only if it's a genuinely new concern), (3) if it's a new config file, add
  its default export to the `envConfig` array in `src/common/config/index.ts`. Nothing else needs
  to change in `app.module.ts`.
- Document every new var in `.env.example` with a one-line comment on what it's for and whether
  it's required.
- Keep new required fields `@IsOptional()`-free only when the app truly cannot run without them —
  otherwise give consuming code a safe default and mark it optional.
- Read config exclusively via `ConfigService.get<T>('namespace.key')` in application code.

### Do not

- Do not read `process.env.X` directly anywhere outside a `src/common/config/*.config.ts` factory
  — that defeats the validate-once-at-boot guarantee and reintroduces untyped access.
- Do not recreate `src/config/` or any parallel env-loading path — `src/common/config/` is the only
  place this happens now; the old `src/config/*` files were removed, not relocated-and-duplicated.
- Do not add a new standalone `class-validator` DTO per feature/module for env vars — every env var
  the process reads is a field on the one shared `EnvironmentVariables` class, validated in a single
  pass at boot.
- Do not silently swallow a validation failure — if a var genuinely has no safe default, leave it
  required and let boot fail loudly rather than adding a fallback that masks misconfiguration.
