import { PickType } from '@nestjs/swagger';
import { ApiPaginatedResponseDto } from 'src/common/dtos/api-response.dto';
import { UnitResponseDto } from 'src/database/response-dto';

/**
 * Response of `GET units/my-library/dropdown` and `GET units/catalog/dropdown`. Their request is
 * `FilterDropdownReqDto` itself: an empty subclass would stack the base `PaginationDto`
 * `pageSize` limit of 50 on top of the dropdown's limit of 500.
 *
 * A Unit the Unit filter can send: `id` is the value of the `unitId` filter.
 */
export class UnitScopeDropdownItemResDto extends PickType(UnitResponseDto, [
  'id',
  'name',
] as const) {}

export class ListUnitsScopeDropdownResponseDto extends ApiPaginatedResponseDto(
  UnitScopeDropdownItemResDto,
) {}
