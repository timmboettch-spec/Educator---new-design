import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { UnitResponseDto } from 'src/database/response-dto';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';
import { UnitConstants } from 'src/common/constants';

export class CreateUnitReqDto {
  @IsString({ message: VALIDATION_MSG.IS_STRING('id') })
  @MaxLength(UnitConstants.VALIDATION.ID_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH('id', UnitConstants.VALIDATION.ID_MAX_LENGTH),
  })
  @Matches(UnitConstants.VALIDATION.ID_PATTERN, { message: VALIDATION_MSG.INVALID('id') })
  @ApiProperty({ example: 'cardiac-care' })
  id!: string;

  @IsString({ message: VALIDATION_MSG.IS_STRING('name') })
  @MaxLength(UnitConstants.VALIDATION.NAME_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH('name', UnitConstants.VALIDATION.NAME_MAX_LENGTH),
  })
  @Matches(UnitConstants.VALIDATION.NAME_PATTERN, { message: VALIDATION_MSG.INVALID('name') })
  @ApiProperty({ example: 'Cardiac Care' })
  name!: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('imageUrl') })
  @ApiPropertyOptional({ example: 'https://cdn.example.com/units/cardiac-care.png' })
  imageUrl?: string;

  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('description') })
  @ApiPropertyOptional({ example: 'Cardic unit' })
  description?: string;
}

export class CreateUnitResDto extends PickType(UnitResponseDto, [
  'unitId',
  'name',
  'imageUrl',
  'id',
  'description'
] as const) { }

export class CreateUnitResponseDto extends ApiResponseDto(CreateUnitResDto) {}
