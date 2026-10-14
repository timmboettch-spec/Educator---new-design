import { PickType } from '@nestjs/swagger';
import { UnitResponseDto } from 'src/database/response-dto';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';

export class GetUnitResDto extends PickType(UnitResponseDto, [
  'unitId',
  'name',
  'imageUrl',
  'id'
] as const) { }

export class GetUnitResponseDto extends ApiResponseDto(GetUnitResDto) {}
