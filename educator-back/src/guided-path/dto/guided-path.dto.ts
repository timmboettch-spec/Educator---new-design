import { IsBoolean, IsNotEmptyObject, IsObject, ValidateIf } from 'class-validator';
import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';
import { GuidedPathResponseDto as GuidedPathDbResponseDto } from 'src/database/response-dto';

/**
 * PUT body — `state` and `completed` are independently optional at the DTO
 * level: absent is fine, but an explicit `null` is rejected (both columns are
 * NOT NULL). The "at least one of them must be present" rule is enforced in
 * `GuidedPathService.upsert` (no existing multi-field "at least one of"
 * class-validator in this repo to reuse, and the check needs a clear
 * `throwAppError`-shaped message either way).
 */
export class UpdateGuidedPathReqDto {
  @ValidateIf((dto: UpdateGuidedPathReqDto) => dto.state !== undefined)
  @IsObject({ message: VALIDATION_MSG.IS_OBJECT('state') })
  @IsNotEmptyObject(undefined, { message: VALIDATION_MSG.IS_OBJECT('state') })
  @ApiPropertyOptional({
    example: { step1: true, step2: false },
    description:
      'Opaque, frontend-owned guided-path progress. Fully replaces any previously stored state — this example shape is illustrative only, not a backend contract.',
  })
  state?: Record<string, unknown>;

  @ValidateIf((dto: UpdateGuidedPathReqDto) => dto.completed !== undefined)
  @IsBoolean({ message: VALIDATION_MSG.IS_BOOLEAN('completed') })
  @ApiPropertyOptional({ example: true })
  completed?: boolean;
}

export class GuidedPathResDto extends PickType(GuidedPathDbResponseDto, [
  'guidedPathId',
  'userId',
  'roleType',
  'state',
  'completed',
  'createdAt',
  'updatedAt',
] as const) {}

export class GuidedPathResponseDto extends ApiResponseDto(GuidedPathResDto) {}
