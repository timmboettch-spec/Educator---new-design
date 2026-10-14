import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { ApiPaginatedResponseDto } from 'src/common/dtos/api-response.dto';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { UnitResponseDto } from 'src/database/response-dto';

export class ListUnitsReqDto extends PaginationDto {
  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('search') })
  @ApiPropertyOptional({ example: 'Cardiac' })
  search?: string;
}

export class UnitListItemResDto extends PickType(UnitResponseDto, ['unitId', 'id', 'name'] as const) {
  @ApiProperty({ example: 4 })
  scenarioCount!: number;
}

export class ListUnitsResponseDto extends ApiPaginatedResponseDto(UnitListItemResDto) { }
