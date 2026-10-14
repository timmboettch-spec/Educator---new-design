---
name: lite-list-endpoint
description: Add a `lite` opt-in query param to an existing NestJS list/GET endpoint in this repo so the frontend can request a cheap, dropdown-shaped response instead of the full row (which usually carries expensive correlated-subquery aggregates the dropdown never uses). Use this whenever the user asks to add a lightweight/lite/dropdown/filter-list variant of an existing list endpoint, complains that a dropdown is triggering a heavy DB query, or wants "just id and name" from an endpoint that currently returns much more. Also use it as the reference pattern when reviewing a PR that adds a similar flag by hand.
---

# Lite list endpoint

## The problem this solves

A frontend dropdown/filter list usually only needs an id and a label. But if it's backed by the same endpoint that powers a data table (e.g. `GET /classes`), it pays for every column and every correlated-subquery aggregate that endpoint computes (`studentsCount`, `simsCount`, `reportsCount`, …) — work the dropdown throws away immediately. The fix is a `lite` opt-in query param that makes the same endpoint skip that expensive work and return a small, purpose-built shape instead.

The interesting part isn't the query param — it's making the **type system** enforce the contract: a caller in this codebase who passes `{ lite: true }` should get a type that genuinely lacks the heavy fields, so trying to read `studentsCount` off a lite result is a compile error, not a runtime `undefined`. A caller who omits `lite` should keep getting the full type, unchanged. This is done with plain TypeScript function **overloads** keyed on the literal type of `lite` — no library, no codegen, just signatures.

## When to reach for this vs. a separate endpoint

Reach for this when the lite and full variants are genuinely "the same list, fewer columns" — same filters, same access scope, same sort. If the lite consumer needs different filters or a different access rule, it's a different endpoint, not a `lite` flag; don't force it in.

## The four pieces

Work through these in order. `findClasses` (`src/class/classes.service.ts`, `src/database/repositories/class.repository.ts`, `src/class/dto/classes.dto.ts`) is a real, already-heavy list endpoint in this repo — every snippet below is written against it so you can diff the pattern against working code instead of an abstract example.

### 1. A shared, reusable request-side DTO

Don't add a bespoke `lite?: boolean` field to every DTO that wants this — that's the copy-paste this pattern exists to avoid. Add one small DTO once, and mix it into any request DTO via `IntersectionType` (the same `@nestjs/swagger` mixin machinery this codebase already uses for `PickType`/`ApiPaginatedResponseDto`):

```ts
// src/common/dtos/lite-query.dto.ts
import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { VALIDATION_MSG } from '../messages/validation.message';

/** Mix into a list-endpoint request DTO via IntersectionType to opt into a lite, dropdown-shaped response. */
export class LiteQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    // Coerce recognized true/false strings; leave anything else for @IsBoolean to reject —
    // don't collapse `value === 'true' || value === true` into the return, that always
    // yields a boolean and silently turns garbage input into `false`.
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean({ message: VALIDATION_MSG.IS_BOOLEAN('lite') })
  @ApiPropertyOptional({ example: true, description: 'Return only dropdown-shaped fields, skipping expensive per-row aggregates.' })
  lite?: boolean;
}
```

`ListClassesReqDto` already `extends PaginationDto` — TS classes can't extend two things, so where a DTO needs both, compose with `IntersectionType`:

```ts
export class ListClassesReqDto extends IntersectionType(PaginationDto, LiteQueryDto) {
  // ...existing search/schoolIds/classId/status/sortBy fields, unchanged
}
```

If a DTO doesn't already extend something else, a plain `extends LiteQueryDto` is simpler and works the same way.

### 2. A `PickType` response DTO for the lite shape

Build the lite response DTO from the existing full one with `PickType`, the same way `dto-rules.md` already asks response DTOs to be built from a database response DTO — just picking from a feature response DTO instead of an entity one:

```ts
// classes.dto.ts, near ClassSummaryResDto
export class ClassLiteResDto extends PickType(ClassSummaryResDto, ['classId', 'className'] as const) {}

export class ListClassesLiteResponseDto extends ApiPaginatedResponseDto(
  ClassLiteResDto,
  'Classes fetched successfully',
) {}
```

Only pick the fields a dropdown actually renders (usually just an id and a label). Resist the urge to also include `status` "just in case" — every extra field is either dead weight on the wire or, worse, a reason someone later reaches for the lite endpoint for something it wasn't meant to answer.

### 3. Overloads on the repository method — this is where the DB cost actually goes away

The type-safety is nice, but the whole point is that the **lite branch runs a cheaper query**: fewer selected columns, no correlated subqueries. `ClassRepository.findClasses` currently always selects `students_count`/`sims_count`/`reports_count` via three correlated subqueries — that's exactly the cost a dropdown shouldn't pay:

```ts
// src/database/repositories/class.repository.ts
async findClasses(
  educatorId: string,
  filters: ClassFilters & { lite: true },
  sort: { field?: ClassSortField; dir: 'ASC' | 'DESC' },
  pagination: { skip: number; take: number },
): Promise<PaginatedRows<ClassLiteRow>>;
async findClasses(
  educatorId: string,
  filters: ClassFilters & { lite?: false | undefined },
  sort: { field?: ClassSortField; dir: 'ASC' | 'DESC' },
  pagination: { skip: number; take: number },
): Promise<PaginatedRows<ClassRow>>;
async findClasses(
  educatorId: string,
  filters: ClassFilters,
  sort: { field?: ClassSortField; dir: 'ASC' | 'DESC' },
  pagination: { skip: number; take: number },
): Promise<PaginatedRows<ClassRow> | PaginatedRows<ClassLiteRow>> {
  const countQb = this.repo.createQueryBuilder('c');
  this.applyClassFilters(countQb, educatorId, filters);
  const total = await countQb.getCount();

  const qb = this.repo.createQueryBuilder('c').select('c.id', 'id').addSelect('c.class_name', 'class_name');
  if (!filters.lite) {
    qb.addSelect('c.start_date', 'start_date')
      .addSelect('c.end_date', 'end_date')
      .addSelect('c.status', 'status')
      .addSelect('(SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.is_active = true)', 'students_count')
      .addSelect('(SELECT COUNT(*) FROM class_simulations cs WHERE cs.class_id = c.id AND cs.is_active = true)', 'sims_count')
      .addSelect(`(SELECT COUNT(*) FROM simulation_reports sr JOIN students s2 ON s2.id = sr.student_id WHERE s2.class_id = c.id AND s2.is_active = true)`, 'reports_count');
  }
  this.applyClassFilters(qb, educatorId, filters);
  qb.orderBy(this.mapClassSortColumn(sort.field), sort.dir).addOrderBy('c.id', 'ASC').skip(pagination.skip).take(pagination.take);

  const raw = await qb.getRawMany<Record<string, string>>();
  if (filters.lite) {
    return { rows: raw.map((r) => ({ id: r.id, className: r.class_name })), total };
  }
  return { rows: raw.map(/* existing full mapping */) as ClassRow[], total };
}
```

`ClassLiteRow` (`{ id: string; className: string }`) goes in `src/common/interfaces/class.interface.ts` next to `ClassRow`, per this repo's interfaces rule.

**Why three overload signatures, not two:** a caller that only has a runtime `boolean` (not a literal `true`/`false`) — which is exactly what the controller has, since `dto.lite` comes off an HTTP query string — doesn't match either narrow overload. Add a third, widest signature immediately above the implementation for that case:

```ts
async findClasses(
  educatorId: string,
  filters: ClassFilters & { lite?: boolean },
  sort: { field?: ClassSortField; dir: 'ASC' | 'DESC' },
  pagination: { skip: number; take: number },
): Promise<PaginatedRows<ClassRow> | PaginatedRows<ClassLiteRow>>;
```

This is the one thing about TS overloads that's easy to get wrong: forget the wide fallback and every call site that only has a plain `boolean` fails to type-check, even though the runtime logic is correct. If you're unsure whether your three signatures actually produce the guarantee you want, write a throwaway spike like this and run `npx tsc --noEmit --strict` on it before wiring the real code — a `@ts-expect-error` line that *doesn't* error tells you the overload isn't doing what you think:

```ts
declare function findClasses(filters: { lite: true }): { id: string }[];
declare function findClasses(filters: { lite?: false | undefined }): { id: string; count: number }[];

const a = findClasses({ lite: true });
// @ts-expect-error -- lite result has no `count`
a[0].count;

const b = findClasses({});
b[0].count; // fine, full type
```

### 4. Mirror the overloads one layer up, in the service

The service method sits between the controller (which only ever has a plain `boolean`) and the repository (which needs the literal to pick a query). Give the service the same three-overload shape so *its* other internal callers — another service, a script, a test — get the same compile-time guarantee, and have its general implementation forward to whichever repo overload matches:

```ts
async findClasses(currentUser: ICurrentUser, dto: ListClassesReqDto & { lite: true }): Promise<ResponseResult<ClassLiteResDto[], IPaginationMeta>>;
async findClasses(currentUser: ICurrentUser, dto: ListClassesReqDto & { lite?: false | undefined }): Promise<ResponseResult<ClassSummaryResDto[], IPaginationMeta>>;
async findClasses(currentUser: ICurrentUser, dto: ListClassesReqDto): Promise<ResponseResult<ClassSummaryResDto[] | ClassLiteResDto[], IPaginationMeta>> {
  // existing body; branch the `data` mapping on `dto.lite` the same way the repo branches its query
}
```

## What the controller can't do, and why that's fine

The controller receives `dto.lite` as `boolean | undefined` — a runtime value, not a compile-time literal — because it came off a query string. There's no way to make an HTTP route return two statically-different JSON shapes depending on a query param; that's a REST boundary limitation, not something this pattern is trying to solve. The controller method's return type is honestly the union (`ResponseResult<ClassSummaryResDto[] | ClassLiteResDto[], IPaginationMeta>`), and `@ApiOkResponse` documents the full-shape response DTO with a one-line note that `?lite=true` returns the lite shape instead — Swagger doesn't have a clean way to express "shape depends on this query param," and forcing one isn't worth the complexity.

The type safety this pattern buys you is real, but it's scoped to **TypeScript callers inside this codebase** — anything that calls `classesService.findClasses(user, { ...dto, lite: true })` directly gets a compile error if it then reaches for a full-only field. That's still valuable: it's exactly the kind of call another service or a seeder makes when it just needs a dropdown's worth of data internally, and it's the case most likely to silently regress if the lite/full split ever drifts apart.

## Checklist for applying this to a new endpoint

- [ ] Does the full response already carry fields (correlated subqueries, joins, computed values) a dropdown wouldn't render? If the full row is already cheap and small, this pattern isn't buying anything — skip it.
- [ ] Request DTO composes `LiteQueryDto` via `IntersectionType` (or plain `extends` if it has no other base).
- [ ] Lite response DTO is a `PickType` of the existing full response DTO, picking only what a dropdown renders.
- [ ] Repository method has the `lite: true` / `lite?: false | undefined` / `lite?: boolean` three-overload shape, and its **implementation** actually skips the expensive columns/subqueries/joins for the lite branch — the overloads alone don't save anything if the query underneath doesn't change.
- [ ] Service method mirrors the same three-overload shape and maps to the matching response DTO.
- [ ] Controller stays a single route returning the union type; `@ApiOkResponse` documents the full shape with a note about `?lite=true`.
- [ ] `ClassLiteRow`-style raw interfaces live in `src/common/interfaces/`, never declared inline in the repository file.
