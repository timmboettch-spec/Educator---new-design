import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { SimulationV2ResponseDto } from 'src/database/response-dto';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';

/** Query for `GET /api/simulations/:scenarioId/public`. */
export class GetPublicSimulationReqDto {
  @IsOptional()
  @IsString({ message: VALIDATION_MSG.IS_STRING('title') })
  @ApiPropertyOptional({ example: 'Cardiac Arrest Response' })
  title?: string;
}

export class PublicSimulationResDto extends PickType(SimulationV2ResponseDto, [
  'id',
  'unitId',
  'title',
  'description',
  'learningObjective',
  'difficulty',
  'learnerLevel',
  'status',
  'estimatedDuration',
] as const) {
  /** Overridden: this endpoint's data is blob-shaped (`BlobScenario`), whose
   * `scenarioImage` can be `null`, unlike the entity DTO's `string | undefined`. */
  @ApiPropertyOptional({ example: 'https://cdn.example.com/scenarios/cardiac-arrest.png', nullable: true })
  scenarioImage?: string | null;

  /** Overridden: blob-shaped data carries untyped action-category JSON, not
   * the entity's typed `ActionCategory[]`. */
  @ApiPropertyOptional({ example: [{ id: 'cat_actions', name: 'ACTIONS' }] })
  actionCategories?: unknown[];
}

export class GetPublicSimulationResponseDto extends ApiResponseDto(PublicSimulationResDto) { }
