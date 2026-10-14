import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { SimulationConstants, UnitConstants } from 'src/common/constants';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { collapseWhitespace } from 'src/common/utils/simulation.util';
import { PaginationDto } from './pagination.dto';

/**
 * Request of the filter dropdowns (Units, Target Audiences, Required Product Names): a page of
 * values and an optional search box. A larger page than the standard lists, because a dropdown
 * wants most of its values at once.
 */
export class FilterDropdownReqDto extends PaginationDto {
  // Redeclared on purpose: a dropdown allows a larger page than `PaginationDto`'s cap of 50, and
  // class-validator keeps only these validators once the subclass declares its own for `pageSize`.
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: VALIDATION_MSG.IS_INT('pageSize') })
  @Min(1, { message: VALIDATION_MSG.MIN_VALUE('pageSize', 1) })
  @Max(UnitConstants.DROPDOWN.MAX_PAGE_SIZE, {
    message: VALIDATION_MSG.MAX_VALUE('pageSize', UnitConstants.DROPDOWN.MAX_PAGE_SIZE),
  })
  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: UnitConstants.DROPDOWN.MAX_PAGE_SIZE,
    default: UnitConstants.DROPDOWN.DEFAULT_PAGE_SIZE,
    example: UnitConstants.DROPDOWN.DEFAULT_PAGE_SIZE,
  })
  override pageSize?: number = UnitConstants.DROPDOWN.DEFAULT_PAGE_SIZE;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    // A blank search is no search.
    return collapseWhitespace(value) || undefined;
  })
  @IsString({ message: VALIDATION_MSG.IS_STRING('search') })
  @MaxLength(SimulationConstants.LIBRARY_FILTER.SEARCH_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH(
      'search',
      SimulationConstants.LIBRARY_FILTER.SEARCH_MAX_LENGTH,
    ),
  })
  @ApiPropertyOptional({
    example: 'cardiac',
    maxLength: SimulationConstants.LIBRARY_FILTER.SEARCH_MAX_LENGTH,
    description:
      'Matches part of the value, ignoring case and extra spaces; `%` and `_` match literally. Blank means no search.',
  })
  search?: string;
}
