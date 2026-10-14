---
paths:
  - '**/*.controller.ts'
---

# Rules: Controllers (`*.controller.ts`)

Extends root `CLAUDE.md` (module-per-domain, global JWT `AuthGuard`, `@Public()`, Swagger at `/api-docs`).
**Scope:** new controllers only. Never apply as a drive-by change to an untouched existing controller.

## Method body

1. **Only call the service and return its result.** No branching, error handling, data shaping, or repository/DB access; those belong in the service (`service-rules.md`).
2. **Return the result as-is.** Never unwrap, rewrap, or build `{ message, data }` manually. `ResponseInterceptor` shapes the response.
3. **Current user:** use `@CurrentUser()` (`src/common/decorators/current-user.decorator.ts`), never `@Req()`/`req.user`. Pass it as the service call's **first** argument.

## Swagger

4. **Tag:** define it once as `<Name>Constants.SWAGGER.TAG` in `src/common/constants/<name>.constants.ts` (never in a module-local constants file). Apply a single `@ApiTags(...)` at **class** level. No inline strings, no per-method `@ApiTags`.

   ```ts
   // src/common/constants/student.constants.ts
   export const StudentConstants = {
     SWAGGER: { TAG: 'Students' },
     ROUTES: { BASE: 'students' },
   };
   ```

5. **Route decorators:** use request/response shape decorators only.
   - Request: `@ApiBody`, `@ApiParam`, `@ApiQuery` (as applicable).
   - Response: `@ApiResponse({ status, type })` / `@ApiOkResponse` / `@ApiCreatedResponse`, plus `@ApiForbiddenResponse` on role-gated controllers (rule 7).
   - **Forbidden:** `@ApiOperation`, `@ApiExtraModels`, and any other descriptive decorator. Docs come from DTO `@ApiProperty` examples (`dto-rules.md`).
6. **Response type:** the decorator names the `*ResponseDto` envelope (`ApiResponseDto(DataType)`). The method's return type stays `Promise<ResponseResult<*ResDto>>`, the bare DTO.

## Authorization

7. Every route declares exactly one of `@Public()`, `@AllowRoleSelectionToken()` or `@RequiredRoles(...)` (root `CLAUDE.md`, [`docs/rbac-role-matrix.md`](../../docs/rbac-role-matrix.md)). Apply `@RequiredRoles(...RoleSlug[])` once at **class** level, so each controller has one authorization boundary.
   - Route-level `@RequiredRoles` is allowed only when a route genuinely differs. It **replaces** the class-level roles; it does not merge with them.
   - Enforced by the global default-deny `AuthGuard` ([ADR-0005](../../docs/adr/0005-single-global-default-deny-auth-guard.md)). Never use `@UseGuards(...)` for auth or roles. Use `@Public()` only per ADR-0005.
   - Every route on a role-gated controller needs `@ApiForbiddenResponse({ description: 'Insufficient role' })`.

## Global infra: never re-apply on a controller

| Registered globally                                      | Where                             | Never add                               |
| -------------------------------------------------------- | --------------------------------- | --------------------------------------- |
| `HttpExceptionFilter`                                    | `APP_FILTER` in `AppModule`       | `@UseFilters(HttpExceptionFilter)`      |
| `createValidationPipe()`                                 | `app.useGlobalPipes` in `main.ts` | `@UsePipes(createValidationPipe())`     |
| `ResponseInterceptor` (with `RequestTimeoutInterceptor`) | `APP_INTERCEPTOR` in `AppModule`  | `@UseInterceptors(ResponseInterceptor)` |

All three cover the root app and `src/student-backend`.

**Envelope behavior:**

- Only `ResponseResult` bodies are wrapped into `{ message, data, meta, error }`. Any other return value (object, array, DTO, `null`) passes through unchanged, with the same keys, nesting and status code.
- **To migrate an endpoint, change its service** to return `ResponseResult`. There is no controller flag, so touching an unmigrated controller doesn't change its response.
- Errors are always enveloped by `HttpExceptionFilter`, whether or not the route is migrated.

## Reference

```ts
@ApiTags(StudentConstants.SWAGGER.TAG)
@RequiredRoles(RoleSlug.EDUCATOR, RoleSlug.DISTRICT_ADMIN)
@Controller(StudentConstants.ROUTES.BASE)
export class StudentsController {
  @Post()
  @ApiForbiddenResponse({ description: 'Insufficient role' })
  @ApiBody({ type: CreateStudentReqDto })
  @ApiOkResponse({ type: CreateStudentResponseDto })
  async createStudent(
    @CurrentUser() currentUser: ICurrentUser,
    @Body() dto: CreateStudentReqDto,
  ): Promise<ResponseResult<CreateStudentResDto>> {
    return this.studentsService.createStudent(currentUser, dto);
  }
}
```
