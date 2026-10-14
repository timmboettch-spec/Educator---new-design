import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SimulationProgressStatus } from 'src/common/constants';
import { StudentSimulationProgress } from '../entities/student-simulation-progress.entity';

export class StudentSimulationProgressResponseDto implements StudentSimulationProgress {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  studentId!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  simulationId!: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  classSimulationId!: string;

  @ApiProperty({ example: 4 })
  practiceAttemptsCount!: number;

  @ApiProperty({ example: 2 })
  assessmentAttemptsCount!: number;

  @ApiProperty({ enum: SimulationProgressStatus, example: SimulationProgressStatus.IN_PROGRESS })
  status!: SimulationProgressStatus;

  @ApiPropertyOptional({ example: '2026-08-19T08:58:14.637Z', nullable: true })
  forfeitedAt?: Date | null;

  @ApiProperty({ example: '2026-08-19T08:47:49.913Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-08-19T08:58:14.637Z' })
  updatedAt!: Date;

  @ApiPropertyOptional({ example: null, nullable: true })
  deletedAt?: Date | null;
}
