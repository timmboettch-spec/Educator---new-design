import { ApiProperty } from '@nestjs/swagger';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';
import type { SimulationDashboard } from 'src/common/interfaces';
import { SimulationListItemResDto } from './list-simulations.dto';
import { EducatorSimulationResDto } from './get-educator-simulations.dto';

/**
 * Payload of `GET /api/simulations/combined` — dashboard, catalog and scenarios
 * in one round trip.
 *
 * The `catalog` key name is load-bearing: the educator portal reads
 * `payload.catalog` to build its favourites map, so it keeps its name even
 * though the surrounding types were renamed off "catalog".
 */
export class CombinedSimulationsResDto {
  @ApiProperty({
    example: {
      banner: { title: 'Simulation Catalog', subtitle: 'Browse all scenarios', image: null },
      filters: { fields: [{ key: 'category', label: 'Category', options: ['Cardiology'] }] },
      browseBy: { filters: [], items: [] },
      sections: [],
    },
  })
  dashboard!: SimulationDashboard;

  @ApiProperty({ type: [SimulationListItemResDto] })
  catalog!: SimulationListItemResDto[];

  @ApiProperty({ type: [EducatorSimulationResDto] })
  scenarios!: EducatorSimulationResDto[];
}

export class GetCombinedSimulationsResponseDto extends ApiResponseDto(CombinedSimulationsResDto) { }
