import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { SimulationV2ResponseDto } from 'src/database/response-dto';
import { ApiListResponseDto } from 'src/common/dtos/api-response.dto';

/**
 * One simulation from `GET /api/simulations/by-unit/:id`. `actionCategories` is
 * backfilled with `SimulationConstants.ACTION_CATEGORIES` when the stored row
 * has none.
 */
export class SimulationByUnitResDto extends PickType(SimulationV2ResponseDto, [
  'id',
  'unitId',
  'title',
  'description',
  'difficulty',
  'learnerLevel',
  'status',
  'scenarioImage',
  'estimatedDuration',
  'actionCategories',
] as const) {
  /** Overridden: the entity's own `learningObjective` (jsonb) can be a `string`
   * or `string[]`, unlike the response DTO's narrower `string | undefined`. This
   * endpoint returns the raw entity, so the wider type is what's actually sent. */
  @ApiPropertyOptional({ example: 'Recognise arrest rhythms; initiate CPR within 30 seconds' })
  learningObjective?: string | string[];
}

export class GetSimulationsByUnitResponseDto extends ApiListResponseDto(SimulationByUnitResDto) { }
