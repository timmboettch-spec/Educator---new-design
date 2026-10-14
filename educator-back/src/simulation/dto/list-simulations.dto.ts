import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiListResponseDto } from 'src/common/dtos/api-response.dto';

/**
 * One formatted catalog item from `GET /api/simulations`.
 *
 * Several fields are `snake_case` rather than the camelCase `dto-rules.md`
 * mandates: these are the names already on the wire, consumed by the educator
 * portal, so renaming them would be a breaking payload change rather than a
 * DTO-naming fix. They are documented as-is deliberately.
 */
export class SimulationListItemResDto {
  @ApiProperty({ example: 101 })
  id!: number;

  @ApiProperty({ example: 'sim-cardiac-arrest-01', nullable: true })
  scenario_id!: string | null;

  @ApiProperty({ example: 'sim-cardiac-arrest-01', nullable: true })
  scenarioId!: string | null;

  @ApiProperty({ example: 'Cardiac Arrest Response' })
  title!: string;

  @ApiProperty({ example: 'Emergency' })
  unit!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', nullable: true })
  unit_id!: string | null;

  @ApiProperty({ example: 'https://cdn.example.com/units/emergency.png', nullable: true })
  unit_image!: string | null;

  @ApiProperty({ example: 4 })
  scenario_count!: number;

  @ApiProperty({ example: 'Cardiology' })
  category!: string;

  @ApiProperty({ example: 'High School Health Science' })
  target_audience!: string;

  @ApiPropertyOptional({ example: 'Advanced' })
  difficulty_level?: string;

  @ApiPropertyOptional({ example: '30–60 minutes' })
  estimated_duration?: string;

  @ApiProperty({ example: 'English' })
  language!: string;

  @ApiPropertyOptional({ example: 'Practise recognising and responding to cardiac arrest.' })
  purpose?: string;

  @ApiPropertyOptional({ example: 'A high-fidelity cardiac arrest simulation.' })
  description?: string;

  @ApiProperty({ example: ['Recognise arrest rhythms', 'Initiate CPR within 30 seconds'] })
  learning_objectives!: string[];

  @ApiProperty({ example: 4.5 })
  rating!: number;

  @ApiProperty({ example: 128 })
  total_ratings!: number;

  @ApiPropertyOptional({ example: '1.2k plays' })
  usage?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/scenarios/cardiac-arrest.png' })
  scenarioImage?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/scenarios/cardiac-arrest.png' })
  image_url?: string;

  @ApiProperty({ example: ['https://cdn.example.com/scenarios/cardiac-arrest.png'] })
  images!: string[];

  @ApiProperty({ example: [{ stars: 5, count: 96 }] })
  rating_breakdown!: Array<{ stars: number; count: number }>;

  @ApiProperty({
    example: [
      {
        reviewer: 'J. Alvarez',
        rating: 5,
        title: 'Excellent realism',
        comment: 'Students stayed engaged throughout.',
        date: '2026-04-12',
      },
    ],
  })
  reviews!: Array<{
    reviewer: string;
    rating: number;
    title: string;
    comment: string;
    date: string;
  }>;

  @ApiPropertyOptional({
    example: { version: '2.5.0', timeAgo: '3 weeks ago', notes: 'Added debrief prompts.' },
  })
  whats_new?: { version: string; timeAgo: string; notes: string };

  @ApiPropertyOptional({ example: 'Handles learner data as described in the privacy policy.' })
  simulation_privacy?: string;

  @ApiPropertyOptional({ example: 'SimulMed Labs' })
  developer?: string;

  @ApiPropertyOptional({ example: 'Realityworks' })
  institution?: string;

  @ApiPropertyOptional({ example: 'published' })
  status?: string;

  @ApiPropertyOptional({ example: '2026-04-12' })
  last_update?: string;

  @ApiProperty({ example: '2026-01-15T09:30:00.000Z' })
  created_at!: Date;

  @ApiProperty({ example: '2026-04-12T14:05:00.000Z' })
  updated_at!: Date;
}

export class ListSimulationsResponseDto extends ApiListResponseDto(SimulationListItemResDto) { }
