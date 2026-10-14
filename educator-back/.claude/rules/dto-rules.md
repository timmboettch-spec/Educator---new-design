---
paths:
  - '**/*.dto.ts'
---

# Rules: DTOs (`*.dto.ts`)

Extends root `CLAUDE.md` (`class-validator`/`class-transformer`, global `ValidationPipe`, no manual re-validation).

## File & naming

1. **One file per feature/endpoint** holds its request, response and envelope DTOs. Never split them.
2. **Class suffixes:**

| Kind             | Suffix        | Example                 |
| ---------------- | ------------- | ----------------------- |
| Request          | `ReqDto`      | `CreateStudentReqDto`   |
| Response data    | `ResDto`      | `GetStudentResDto`      |
| Swagger envelope | `ResponseDto` | `GetStudentResponseDto` |

3. **Fields are `camelCase`** in every DTO, regardless of DB column casing (`imageUrl`, not `image_url`).

## Every field

4. **Swagger:** every field (request **and** response) has `@ApiProperty` or, for optional fields, `@ApiPropertyOptional`, with a realistic `example`. No `'string'` or `'test'` placeholders.
   - Enum fields: `example` is a real enum member.
   - Array fields: `example` is an array literal of realistic items.
5. **Validation messages:** every `class-validator` decorator sets `message:` from `VALIDATION_MSG` (`src/common/messages/validation.message.ts`). Never a string literal, never omitted. Raw strings bypass `HttpExceptionFilter`'s i18n.
   - Missing builder → add it to `validation.message.ts` **and** `src/common/i18n/en/validation.json`.

## Request DTOs

6. **Paginated:** `extends PaginationDto` (`src/common/dtos/pagination.dto.ts`). Never redeclare `page`/`pageSize` or their decorators. Pass the DTO to `getPagination()` in the service (`service-rules.md`).

## Response DTOs

7. **Data DTO:** `extends PickType(<Entity>ResponseDto, [...] as const)` from the `src/database/response-dto` barrel (`database-entities-rules.md`).
   - Never redeclare a picked field, even just to repeat its `@ApiProperty`.
   - Add only net-new fields (computed or aggregated values) as extra members.
8. **Envelope (non-paginated):** `<Feature>ResponseDto extends ApiResponseDto(<Feature>ResDto)`. The controller's `@ApiOkResponse`/`@ApiCreatedResponse` references the envelope, never the bare `ResDto`.
   - Nothing to return (e.g. delete) → `ApiResponseDto(EmptyDataDto)`. No one-off empty classes.
9. **Envelope (paginated):** `<Feature>ResponseDto extends ApiPaginatedResponseDto(<Item>ResDto)`. No intermediate list `ResDto`.
   - `data` is the plain item array (never `{ docs, ... }`). `meta` is `PaginationMetaDto` (`total`, `page`, `pageSize`, `totalPages`, `hasNextPage`, `hasPrevPage`), matching `buildPaginationMeta()`.
   - Never redeclare envelope fields. Add net-new ones only if truly needed (rare).

Mixins `ApiResponseDto`, `ApiPaginatedResponseDto` and `EmptyDataDto` live in `src/common/dtos/api-response.dto.ts`.

## Reference

```ts
// get-student.dto.ts
export class GetStudentReqDto {
  @IsUUID('4', { message: VALIDATION_MSG.IS_UUID('studentId') })
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  studentId!: string;
}

export class GetStudentResDto extends PickType(StudentResponseDto, [
  'studentId',
  'name',
] as const) {}
export class GetStudentResponseDto extends ApiResponseDto(GetStudentResDto) {}

// list-students.dto.ts
export class ListStudentsReqDto extends PaginationDto {
  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('search') })
  @ApiPropertyOptional({ example: 'Ava' })
  search?: string;
}

export class StudentItemResDto extends PickType(StudentResponseDto, [
  'studentId',
  'name',
] as const) {}
export class ListStudentsResponseDto extends ApiPaginatedResponseDto(StudentItemResDto) {}
```
