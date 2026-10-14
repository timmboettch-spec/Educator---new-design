import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { SimulationV2ResponseDto } from 'src/database/response-dto';
import { ApiListResponseDto } from 'src/common/dtos/api-response.dto';

/**
 * One scenario from `GET /api/simulations/educators`, annotated for the calling
 * educator. `unit_image` and `in_library` are net-new fields (not on the entity)
 * and keep their `snake_case` wire names — the educator portal already reads
 * them, so renaming to camelCase per `dto-rules.md` would break it.
 */
export class EducatorSimulationResDto extends PickType(SimulationV2ResponseDto, [
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

  @ApiProperty({ example: 'https://cdn.example.com/units/emergency.png', nullable: true })
  unit_image!: string | null;

  @ApiProperty({ example: true })
  in_library!: boolean;
}

export class GetEducatorSimulationsResponseDto extends ApiListResponseDto(
  EducatorSimulationResDto,
) { }
