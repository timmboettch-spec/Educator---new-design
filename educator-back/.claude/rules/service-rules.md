---
paths:
  - '**/*.service.ts'
---

# Rules: Services (`*.service.ts`)

Applies to every service class across the codebase (e.g. `src/**/*.service.ts`, `src/student-backend/**/*.service.ts`), **except** existing services in modules that predate this rule — retrofit only when a new-module feature listed in the root `CLAUDE.md`'s new cross-cutting infra (i18n, `ResponseResult`, pagination, all under `src/common/`) is being adopted, never as a drive-by change to an untouched existing service.

## Method signature — `currentUser` first, whole DTO second

Every public service method that serves a request must take the current authenticated user as its **first** parameter, followed by the **entire DTO object** as a single second parameter when the operation takes input — never spread individual DTO fields across multiple parameters:

```ts
// Good
async createStudent(currentUser: ICurrentUser, dto: CreateStudentReqDto): Promise<ResponseResult<StudentResDto>> { ... }

// Bad — fields spread out, no currentUser
async createStudent(name: string, classId: string, schoolId: string): Promise<...> { ... }
```

Controllers extract `currentUser` via the `@CurrentUser()` param decorator (`src/common/decorators/current-user.decorator.ts`, typed as `ICurrentUser` from `src/common/interfaces/auth.interface.ts`) and pass it straight through — never re-derive or re-fetch the user inside the service from a raw token.

Controller-level authorization uses `@RequiredRoles(...roles: RoleSlug[])` (`src/common/decorators/required-roles.decorator.ts`) applied on the `@Controller()` class, enforced by the single global default-deny `AuthGuard` (`src/common/guards/auth.guard.ts`, [ADR-0005](../../docs/adr/0005-single-global-default-deny-auth-guard.md)) as an any-of check against the caller's **selected role** (the token's `type` claim, [ADR-0006](../../docs/adr/0006-selected-role-rbac.md)); roles are flat, so a route serving several roles lists them all. Never re-implement a role check imperatively in a service. Never add `@UseGuards(...)` for authentication or roles; use `@Public()` only per ADR-0005's public-route rule. Resource-level authorization (ownership, assignment) is the service's job, not a guard's.

## No direct database communication — always go through a repository

Services must never import a concrete ORM type (`Repository<T>`, `DataSource`, `@InjectRepository`, a Prisma client, etc.) or issue queries directly. All persistence goes through a repository injected via its DI token, following the `src/database/` pattern from the root `CLAUDE.md`:

```ts
constructor(
  @Inject(STUDENT_REPOSITORY) private readonly studentRepo: StudentRepository,
) {}
```

Type against the concrete repository class (e.g. `StudentRepository`), never a raw `Repository<T>` — this is already the existing convention for anything under `src/database/repositories/`, and new-module services must follow it too rather than reaching for TypeORM directly.

## Call specific repository methods, never pass TypeORM options

Services call **intent-named** repository methods with plain arguments (`this.inviteRepo.findPendingByEmail(dto.email)`), never build `where`/`select`/`relations`/`order` objects or import TypeORM types (`FindOptionsWhere`, `DeepPartial`, `EntityManager`, …). If no method fits, add a specific one to the repository (`database-repositories-rules.md`); don't add new call sites to a legacy generic method (`find`, `findOne`, `findAndCount`, `update`, `delete`). Any params/result shape goes in `src/common/interfaces/`. This keeps queries in one place and lets the ORM adapter be swapped without touching the service. Don't leak driver-specific types (e.g. TypeORM's `QueryFailedError`, Prisma error codes) into a service's own method signatures — that error mapping belongs in the exception filter (`src/common/filters/http-exception.filter.ts`), not in service code.

## Response — always `ResponseResult`, paginated lists via `buildPaginationMeta`

Every service method that returns data to a controller must wrap it in `ResponseResult<T, M>` (`src/common/class/response.class.ts`):

```ts
return new ResponseResult({ message: SUCCESS_MSG.COMMON.CREATED('Student'), data: studentDto });
```

For any list/paginated result, `data` is the plain items array — never `{ docs, ... }` — and pagination info goes on `ResponseResult`'s own `meta` field, a sibling of `data`, built with `buildPaginationMeta()` (`src/common/utils/pagination.util.ts`):

```ts
const { skip, take, page, pageSize } = getPagination({ page: dto.page, pageSize: dto.pageSize });
const [rows, total] = await this.studentRepo.findPageByClassId(dto.classId, { skip, take });
return new ResponseResult({
  message: SUCCESS_MSG.COMMON.FETCHED('Students'),
  data: rows.map(toStudentDto),
  meta: buildPaginationMeta(total, page, pageSize),
});
```

`ResponseInterceptor` puts `meta` on the response body as a sibling of `data` (`{ message, data, meta, error }`), never nested inside `data` — matching the paginated Swagger envelope built with `ApiPaginatedResponseDto` (`dto-rules.md`).

Returning a `ResponseResult` is precisely what opts a route into the envelope. A service method that still returns a bare value keeps its endpoint's existing response shape verbatim — `ResponseInterceptor` passes any non-`ResponseResult` body through unchanged — so this rule does not retroactively alter untouched endpoints, and switching a method's return type to `ResponseResult` is a deliberate, per-endpoint contract change that its consumers and tests must be updated for.

Controllers for these new modules just `return this.service.method(currentUser, dto)` untouched — `ResponseInterceptor` (a global `APP_INTERCEPTOR`, see root `CLAUDE.md`) unwraps `ResponseResult` and handles i18n translation of `message`.

## File placement

- **Utility functions** (pure helpers, no DI, no cross-cutting side effects) always go in `src/common/utils/` — never local to a module (no `src/students/utils/`), and never inline in a service file as an unexported free function when it could be a named export in `src/common/utils/`. (Pagination's `getPagination`/`buildPaginationMeta` already live there too, in `src/common/utils/pagination.util.ts` — new module-local utility functions belong alongside them.) Put a new util in the **existing** `<feature>.util.ts` for that feature if one exists; only create a new file when none does — never a per-sub-feature sibling like `class-transfer.util.ts` next to `class.util.ts` (see `common-rules.md`). The same applies to the constants and interfaces a service needs.
- **Shared, cross-cutting `@Injectable()` services** consumed by more than one domain module (token/logging/mail/blob-storage-style services) belong in `src/common/services/`, matching `TokenService`/`LoggerService`/`AzureBlobService`. **Domain services** (a module's own business logic, e.g. `StudentsService`, `SchoolsService`) stay in their own feature module folder as today — this rule does not move them into `common/services`.

## Every method body wrapped in try/catch → `handleError`

Every public service method that serves a request must wrap its entire body in a `try`/`catch`, funneling any caught error through `handleError` (`src/common/utils/common.util.ts`) rather than letting it propagate raw or swallowing it:

```ts
async createStudent(currentUser: ICurrentUser, dto: CreateStudentReqDto): Promise<ResponseResult<StudentResDto>> {
  try {
    const student = await this.studentRepo.create({ ...dto, createdBy: currentUser.userId });
    return new ResponseResult({ message: SUCCESS_MSG.COMMON.CREATED('Student'), data: toStudentDto(student) });
  } catch (error) {
    handleError(error);
  }
}
```

`handleError` re-throws an existing `HttpException` unchanged, and wraps anything else (a raw driver/ORM error, a programming error) in `InternalServerErrorException` so nothing unhandled ever reaches the exception filter in a shape it doesn't expect. Don't add a second layer of error translation inside the `catch` — `handleError` is the single funnel; the global `HttpExceptionFilter` (registered once as an `APP_FILTER` in `AppModule`, covering every route) does the response-shaping and i18n translation downstream.

## Other requirements

- No floating promises: every `async` call inside a service must be `await`ed or explicitly returned — matches the repo-wide `no-floating-promises` ESLint rule already in effect.
- Don't re-validate DTO fields manually inside the service (`class-validator` + the global `ValidationPipe` already did that) — trust the DTO shape once it reaches the service.
- Error messages in new modules are i18n-encoded keys (`ERROR_MSG.*`/`VALIDATION_MSG.*` from `src/common/messages/`).

These rules apply on top of, not instead of, the repo's general architecture conventions in the root `CLAUDE.md` (module-per-domain structure, the `src/database/` repository-pattern layer, and the global `HttpExceptionFilter`/`ResponseInterceptor`/`createValidationPipe()` `src/common/` infrastructure for i18n/`ResponseResult`/pagination).
