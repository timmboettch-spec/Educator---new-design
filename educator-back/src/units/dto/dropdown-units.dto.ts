import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { ApiPaginatedResponseDto } from 'src/common/dtos/api-response.dto';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { UnitConstants } from 'src/common/constants';
import { UnitResponseDto } from 'src/database/response-dto';

export class DropdownUnitsReqDto extends PaginationDto {
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
  pageSize?: number = UnitConstants.DROPDOWN.DEFAULT_PAGE_SIZE;

  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('search') })
  @ApiPropertyOptional({ example: 'Cardiac' })
  search?: string;
}

export class UnitDropdownItemResDto extends PickType(UnitResponseDto, [
  'unitId',
  'id',
  'name',
] as const) { }

export class ListUnitsDropdownResponseDto extends ApiPaginatedResponseDto(UnitDropdownItemResDto) { }
