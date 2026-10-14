import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationConstants } from '../constants/pagination.constants';
import { VALIDATION_MSG } from '../messages/validation.message';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: VALIDATION_MSG.IS_INT('page') })
  @Min(1, { message: VALIDATION_MSG.MIN_VALUE('page', 1) })
  @Max(PaginationConstants.MAX_PAGE, {
    message: VALIDATION_MSG.MAX_VALUE('page', PaginationConstants.MAX_PAGE),
  })
  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: PaginationConstants.MAX_PAGE,
    default: DEFAULT_PAGE,
    example: 1,
  })
  page?: number = DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: VALIDATION_MSG.IS_INT('pageSize') })
  @Min(1, { message: VALIDATION_MSG.MIN_VALUE('pageSize', 1) })
  @Max(MAX_PAGE_SIZE, { message: VALIDATION_MSG.MAX_VALUE('pageSize', MAX_PAGE_SIZE) })
  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
    example: 10,
  })
  pageSize?: number = DEFAULT_PAGE_SIZE;
}
