# Logging Guide

This document explains the structured logging system introduced in `feature/rwai-3027-structured-logging`, why it replaced the previous setup, and how to use it when writing new code or reviewing PRs.

## Why we changed it

Before this change, the codebase had **three logging mechanisms active at once**, with no consistent contract between them:

1. **`winston`** — listed as a dependency but never actually wired up anywhere in the code. Dead weight.
2. **`nestjs-pino`** — registered as Nest's global logger via `LoggerModule.forRoot()`, but configured to always use the `pino-pretty` transport, including in production. That meant production logs were single-line human-readable text instead of structured JSON — unusable for log aggregation/querying in Application Insights or any log platform.
3. **Nest's built-in `Logger`** (`new Logger(ClassName.name)`) — used as a static, un-injected instance in ~65 files. Every call site logged a different shape: some plain strings, some string + context, a handful of ad-hoc objects. Nothing was queryable by field (no consistent `topic`, no request correlation ID, no PII redaction).

On top of that, request/response audit logging lived in an `AuditLoggerInterceptor` built on RxJS `tap()`, which **only fires on the success path** — it silently skipped every 4xx/5xx response, every guard rejection (401/403/429), and every 404 for an unmatched route. The one thing you'd most want logged (things going wrong) was the one thing never logged.

The goal of this migration: **one logger, one shape, one place logs actually go**, with automatic PII redaction and request correlation, and audit logging that genuinely fires on every request outcome.

## What changed, at a glance

| Before                                                    | After                                                                      |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `winston` (unused)                                        | Removed                                                                    |
| `nestjs-pino` (`LoggerModule.forRoot`)                    | Removed                                                                    |
| `new Logger(ClassName.name)` static instances             | `LoggerService` (DI-injected) everywhere                                   |
| `AuditLoggerInterceptor` (RxJS interceptor, success-only) | `TraceMiddleware` (Express middleware, fires on every outcome)             |
| No PII redaction                                          | Automatic redaction of `metadata`/`refData` via `SENSITIVE_KEYS`           |
| No request correlation                                    | `traceId` auto-attached from `ClsService` (`nestjs-cls`) on every log line |
| Ad-hoc log shapes per call site                           | One structured contract: `LogInfo`                                         |

## Architecture

### `LoggerService` (`src/common/services/logger.service.ts`)

A single `@Injectable()` class wrapping a standalone `pino` instance. It's registered app-wide via the `@Global()` `ServicesModule`, and it's also wired as Nest's global logger in `main.ts`:

```ts
const logger = app.get(LoggerService);
app.useLogger(logger);
```

Because it's Nest's global logger, it has to accept **two calling conventions**:

1. **Nest's own framework calls** — `logger.log('Nest application successfully started')`, `logger.error(message, stack, context)` — plain strings, exactly like the built-in `Logger` class always accepted. This means `LoggerService` is a drop-in replacement: existing `new Logger(ClassName.name)` call sites needed their _construction_ changed, not their `.log()`/`.error()`/`.warn()`/`.debug()` call arguments.
2. **The app's own structured calls** — a single object matching the `LogInfo` shape (see below).

It tells the two apart with a type guard (`isLogInfo`) that checks for `topic`/`subTopic`/`operation` on the argument. Anything else — a string, or an object missing those fields — is logged as a framework-style message instead of being blindly stringified (this specifically fixes a bug where passing a plain object produced `[object Object]` in the output).

### The `LogInfo` contract (`src/common/interfaces/log-info.interface.ts`)

This is the shape every **application-level** log call should use:

```ts
export interface LogInfo {
  topic: string; // class/service name, e.g. 'EducatorsService'
  subTopic: string; // method name, e.g. 'sendReactivationInvite'
  operation: string; // kebab-case action, e.g. 'email-send-failed'
  traceId?: string; // auto-filled from ClsService if omitted
  message?: string; // optional human-readable summary; derived from topic.subTopic - operation if omitted
  refData?: unknown; // decision-driving input data (sanitized before writing)
  metadata?: Record<string, unknown>; // runtime context (sanitized before writing)
  error?: unknown; // Error instance or error-shaped object
}
```

`topic`/`subTopic`/`operation` are **required** — that's what makes every log line queryable by "which class, which method, what happened" without parsing free text.

### PII redaction

`metadata` and `refData` are automatically run through `sanitize()` (`src/common/utils/common.util.ts`) against the `SENSITIVE_KEYS` list (`src/common/constants/app.constants.ts`) before being written. Any object key whose name matches (case-insensitively, substring match) an entry in that list — `password`, `token`, `authorization`, `ssn`, `cardNumber`, `apiKey`, etc. — has its value replaced with `'[REDACTED]'`, recursively through nested objects/arrays.

**This means you never need to manually scrub a request body or payload before logging it** — pass it straight into `metadata` or `refData` and redaction happens automatically. If you need to redact a field that isn't already covered, add it to `SENSITIVE_KEYS` rather than hand-rolling redaction at the call site.

`topic`, `subTopic`, `operation`, `message`, and `traceId` are **not** sanitized — don't put PII there; those are meant to be short, static, developer-authored strings, not user data.

### Request correlation (`traceId`)

`ClsModule` (`nestjs-cls`) is configured in `app.module.ts` to auto-generate a UUID per request:

```ts
ClsModule.forRoot({
  global: true,
  middleware: {
    mount: true,
    generateId: true,
    idGenerator: () => randomUUID(),
  },
}),
```

`LoggerService` reads that ID (`this.cls.getId()`) and attaches it as `traceId` on every structured log line automatically — you don't pass it yourself unless you're deliberately correlating logs across a boundary CLS can't see (e.g. a background job). This is also how you get every log line for a single HTTP request grouped together in log aggregation.

### Request/response audit logging (`TraceMiddleware`)

`src/common/middleware/trace.middleware.ts`, registered globally in `app.module.ts`:

```ts
consumer.apply(XssMiddleware, TraceMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
```

It listens on `res.on('finish')` rather than wrapping the request in an interceptor. This is the important architectural difference from the old `AuditLoggerInterceptor`: middleware runs at the Express layer _before_ Nest's routing/guards/interceptors, so the `finish` callback fires for **every** possible outcome — a normal 2xx response, an exception turned into a response by `HttpExceptionFilter`, a guard rejection, or a 404 for a route that doesn't exist. An interceptor-based `tap()` approach only ever sees the success path.

It calls `LoggerService.logRequestTrace()`, which auto-picks the log level from the response status code:

```ts
// 5xx → error, 4xx → warn, everything else → info
```

so a failed request is never buried at `info` level, and you can alert on `error`-level `RequestTrace` logs without separately parsing status codes.

## How to use this in your code

### 1. Inject it

```ts
import { LoggerService } from '../common/services'; // adjust the relative path to your file

@Injectable()
export class SomeService {
  constructor(
    // ...your other deps
    private readonly logger: LoggerService,
  ) {}
}
```

`LoggerService` is provided by the `@Global()` `ServicesModule`, so you never need to import a module for it — just add it to your constructor.

### 2. Log with the structured shape

```ts
this.logger.log({
  topic: 'EducatorsService',
  subTopic: 'createEducator',
  operation: 'educator-created',
  metadata: { educatorId: educator.id, schoolId: school.id },
});

this.logger.error({
  topic: 'EducatorsService',
  subTopic: 'sendReactivationInvite',
  operation: 'email-send-failed',
  error, // the caught Error — stack/message/name are extracted automatically
});

this.logger.warn({
  topic: 'HealthService',
  subTopic: 'checkBlobStorage',
  operation: 'azure-authentication-failed',
  metadata: { filename },
});
```

Method to level mapping: `log` → `info`, `warn` → `warn`, `error` → `error`, `debug`/`verbose` → `debug`, `fatal` → `error`.

### 3. Don't hand-roll redaction

```ts
// Don't do this:
metadata: { email: user.email, password: '[hidden manually]' }

// Just do this — password gets redacted automatically because the key matches SENSITIVE_KEYS:
metadata: { email: user.email, password: user.password }
```

### 4. Never use `console.log`/`console.error` in application code

The only exception is standalone CLI/ops scripts that run outside the Nest app entirely (e.g. `src/database/seeders/`, `src/scripts/reencrypt-lms-secrets.ts`) — those have no DI container to inject `LoggerService` into, so they're intentionally left on `console.*`.

### 5. Never construct `new Logger(...)` from `@nestjs/common`

If you're adding a new service, inject `LoggerService` in the constructor from day one rather than reaching for Nest's built-in `Logger`. The only legitimate exception in this codebase is `src/common/dtos/env.validation.ts`, which runs during `ConfigModule.forRoot({ validate })` — before the Nest DI container exists, so nothing is injectable there yet.

## Testing

`LoggerService` is a normal injectable — mock it in unit/integration tests like any other dependency:

```ts
const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  fatal: jest.fn(),
};

const module = await Test.createTestingModule({
  providers: [
    SomeService,
    { provide: LoggerService, useValue: mockLogger },
    // ...
  ],
}).compile();
```

If your test imports a **real Nest module** (e.g. `imports: [AdminModule]`) rather than listing flat providers, a top-level `providers` entry won't be visible inside that module's own DI scope — Nest module boundaries are isolated. In that case, wrap the mock in a small `@Global()` module and add it to `imports` instead:

```ts
@Global()
@Module({
  providers: [{ provide: LoggerService, useValue: mockLogger }],
  exports: [LoggerService],
})
class MockLoggerModule {}

// ...
imports: [AdminModule, JsonDataModule, MockLoggerModule],
```

(See `src/student-backend/modules/admin/required-fields-validation.spec.ts` for the original example of this pattern.)

If a test previously used `jest.spyOn(Logger.prototype, 'error')` to assert on logging behavior, that spy no longer intercepts anything once the class under test uses injected `LoggerService` instead of the static `Logger`. Retarget the assertion at your `LoggerService` mock's method instead (`expect(mockLogger.error).toHaveBeenCalledWith(...)`).

## Known limitations / follow-ups

- CLS `'user'` population lives in `common/strategy/jwt.strategy.ts`'s `validate()`. That single strategy backs the global `AuthGuard` for both the root app and `/students-backend/*`, so `TraceMiddleware`'s `userId` is populated for every authenticated request.
- Pino output field names are camelCase (`subTopic`, `traceId`, `refData`) to match the rest of the codebase's conventions — if you're grepping old logs from before this migration, the shapes won't match.

## Quick reference

| I want to...                         | Do this                                                             |
| ------------------------------------ | ------------------------------------------------------------------- |
| Log something happened               | `this.logger.log({ topic, subTopic, operation, metadata })`         |
| Log a caught error                   | `this.logger.error({ topic, subTopic, operation, error })`          |
| Log a recoverable problem            | `this.logger.warn({ topic, subTopic, operation, metadata })`        |
| Add a new service that needs logging | Inject `LoggerService` in the constructor — never `new Logger(...)` |
| Log something that might contain PII | Put it in `metadata`/`refData` — redaction is automatic             |
| Correlate logs for one request       | Nothing to do — `traceId` is automatic via CLS                      |
| Mock the logger in a test            | `{ provide: LoggerService, useValue: { log: jest.fn(), ... } }`     |
