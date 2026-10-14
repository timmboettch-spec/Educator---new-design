import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transcript } from '../entities/transcript.entity';
import { SimulationV2 } from '../entities/simulation-v2.entity';
import { TranscriptMessage } from 'src/common/interfaces';
import { TranscriptScenarioType } from 'src/common/constants';

export class TranscriptResponseDto implements Transcript {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  transcriptId!: string;

  @ApiProperty({ example: '1780610624828-a350a6eor' })
  id!: string;

  @ApiProperty({ example: 'user-1' })
  userId!: string;

  @ApiPropertyOptional({ example: 'AIT_001' })
  scenarioId?: string;

  @ApiPropertyOptional({ type: () => SimulationV2 })
  simulation?: SimulationV2;

  @ApiPropertyOptional({ example: 'Ava Thompson' })
  studentName?: string;

  @ApiPropertyOptional({ example: 'ava.t' })
  studentKey?: string;

  @ApiPropertyOptional({ example: 'Period 3 Biology' })
  studentClass?: string;

  @ApiPropertyOptional({ example: 'login-session-123' })
  loginSessionId?: string;

  @ApiPropertyOptional({ example: TranscriptScenarioType.PRACTICE, enum: TranscriptScenarioType })
  scenarioType?: TranscriptScenarioType;

  @ApiPropertyOptional({ example: 'session-123' })
  sessionId?: string;

  @ApiPropertyOptional({ example: 'instance-123' })
  scenarioInstanceId?: string;

  @ApiPropertyOptional({
    example: [
      { id: 'm1', timestamp: '2026-01-01T00:00:00.000Z', text: 'Hello', speaker: 'student' },
    ],
  })
  messages?: TranscriptMessage[];

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  startedAt!: string;

  @ApiPropertyOptional({ example: '2026-01-01T00:10:00.000Z' })
  endedAt?: string | null;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  updatedAt!: Date;

  @ApiPropertyOptional({ example: null })
  deletedAt?: Date | null;
}
