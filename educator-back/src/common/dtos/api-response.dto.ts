import { Type, mixin } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from './pagination-response.dto';

/**
 * Swagger envelope matching what ResponseInterceptor actually puts on the
 * wire (`{ message, data, meta, error }`) for a non-paginated endpoint —
 * every such new-module endpoint's `@ApiOkResponse`/`@ApiCreatedResponse`
 * type must be one of these, built over that endpoint's own data DTO, so the
 * generated docs reflect the real response shape rather than just the bare
 * `data` payload. For a paginated list endpoint use `ApiPaginatedResponseDto`
 * instead — `meta` there carries real pagination info, not `null`.
 *
 * `exampleMessage` documents the endpoint's actual success message (e.g.
 * `SUCCESS_MSG.COMMON.FETCHED('Class statuses')` → "Class statuses fetched successfully") — it
 * defaults to "Unit fetched successfully" so existing callers that don't pass it keep their
 * current docs unchanged.
 */
export function ApiResponseDto<T>(
  DataType: Type<T>,
  exampleMessage: string = 'Unit fetched successfully',
) {
  class ApiResponseEnvelopeDto {
    @ApiProperty({ example: exampleMessage })
    message!: string;

    @ApiProperty({ type: DataType })
    data!: T;
  }

  return mixin(ApiResponseEnvelopeDto);
}

/**
 * Swagger envelope for a NON-paginated list endpoint — `data` is the plain
 * items array and there is no `meta`. Sits between `ApiResponseDto` (single
 * object) and `ApiPaginatedResponseDto` (array + pagination `meta`), for
 * endpoints that return every row at once.
 */
export function ApiListResponseDto<T>(ItemType: Type<T>) {
  class ApiListResponseEnvelopeDto {
    @ApiProperty({ example: 'Simulations fetched successfully' })
    message!: string;

    @ApiProperty({ type: [ItemType] })
    data!: T[];
  }

  return mixin(ApiListResponseEnvelopeDto);
}

/**
 * Swagger envelope for a paginated list endpoint — `data` is the plain items
 * array (not `{ docs, meta }`), and `meta` (`PaginationMetaDto`) is its own
 * sibling field on the envelope, matching `buildPaginationMeta()` +
 * `ResponseResult`'s `meta` (`src/common/utils/pagination.util.ts`).
 *
 * `exampleMessage` documents the endpoint's actual success message (e.g.
 * `SUCCESS_MSG.COMMON.FETCHED('Students')` → "Students fetched successfully") — it defaults
 * to the original "Units fetched successfully" so existing callers that don't pass it keep
 * their current docs unchanged.
 */
export function ApiPaginatedResponseDto<T>(
  ItemType: Type<T>,
  exampleMessage: string = 'Units fetched successfully',
) {
  class ApiPaginatedResponseEnvelopeDto {
    @ApiProperty({ example: exampleMessage })
    message!: string;

    @ApiProperty({ type: [ItemType] })
    data!: T[];

    @ApiProperty({ type: PaginationMetaDto })
    meta!: PaginationMetaDto;
  }

  return mixin(ApiPaginatedResponseEnvelopeDto);
}

/** Placeholder `data` type for endpoints with nothing to return (e.g. delete) — pair with `ApiResponseDto(EmptyDataDto)`. */
export class EmptyDataDto { }
