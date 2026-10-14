import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { ApiPaginatedResponseDto } from 'src/common/dtos/api-response.dto';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { toStringArray } from 'src/common/utils/query-array.util';
import { ReportListSortField, ReportReviewStatus } from 'src/common/constants';

const MAX_MULTI_SELECT_SIZE = 100;

export class ListReportsReqDto extends PaginationDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStringArray(value))
  @IsArray({ message: VALIDATION_MSG.INVALID('studentIds') })
  @ArrayMaxSize(MAX_MULTI_SELECT_SIZE)
  @IsUUID('4', { each: true, message: VALIDATION_MSG.IS_UUID('studentIds') })
  @ApiPropertyOptional({ type: [String], example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'] })
  studentIds?: string[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStringArray(value))
  @IsArray({ message: VALIDATION_MSG.INVALID('classIds') })
  @ArrayMaxSize(MAX_MULTI_SELECT_SIZE)
  @IsUUID('4', { each: true, message: VALIDATION_MSG.IS_UUID('classIds') })
  @ApiPropertyOptional({ type: [String], example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'] })
  classIds?: string[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStringArray(value))
  @IsArray({ message: VALIDATION_MSG.INVALID('schoolIds') })
  @ArrayMaxSize(MAX_MULTI_SELECT_SIZE)
  @IsUUID('4', { each: true, message: VALIDATION_MSG.IS_UUID('schoolIds') })
  @ApiPropertyOptional({ type: [String], example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'] })
  schoolIds?: string[];

  /** Catalog `Simulation.id` (varchar `scenario_id`), never `ClassSimulation`, per RE-38. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStringArray(value))
  @IsArray({ message: VALIDATION_MSG.INVALID('simulationIds') })
  @ArrayMaxSize(MAX_MULTI_SELECT_SIZE)
  @ApiPropertyOptional({ type: [String], example: ['cardiac-care-v2'] })
  simulationIds?: string[];

  @IsOptional()
  @IsEnum(ReportReviewStatus, { message: VALIDATION_MSG.IS_ENUM('reviewStatus') })
  @ApiPropertyOptional({ enum: ReportReviewStatus, example: ReportReviewStatus.UNREAD })
  reviewStatus?: ReportReviewStatus;

  @IsOptional()
  @IsEnum(ReportListSortField, { message: VALIDATION_MSG.IS_ENUM('sortBy') })
  @ApiPropertyOptional({ enum: ReportListSortField, example: ReportListSortField.COMPLETED_AT })
  sortBy?: ReportListSortField;

  @IsOptional()
  @IsEnum(['ASC', 'DESC'], { message: VALIDATION_MSG.IS_ENUM('sortDirection') })
  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], example: 'DESC' })
  sortDirection?: 'ASC' | 'DESC';
}

/**
 * Row shape for `GET /simulation-reports/list`. Every field declared net-new here rather than
 * `PickType`d from an entity-backed response DTO — `SimulationReport`'s own columns (`viewed_at`,
 * `id`, ...) are snake_case, mirroring the pre-existing entity, which would violate this repo's
 * DTO camelCase rule if picked directly.
 */
export class ListReportsResDto {
  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  reportId!: string;

  @ApiPropertyOptional({ example: 'REP-PH9N' })
  studentCode!: string;

  @ApiPropertyOptional({ example: 'Assessment' })
  mode!: string | null;

  @ApiPropertyOptional({ example: 'Cardiac Care' })
  simulationName!: string | null;

  @ApiPropertyOptional({ example: 82 })
  score!: number | null;

  @ApiPropertyOptional({ example: 'Exceptional' })
  performanceQuality!: string | null;

  @ApiPropertyOptional({ example: '00:12:34' })
  timeSpent!: string | null;

  @ApiPropertyOptional({ example: '2026-01-14T09:00:00.000Z' })
  completedAt!: string;

  @ApiPropertyOptional({ example: 'transcript-abc123' })
  transcriptId!: string | null;

  @ApiPropertyOptional({ example: '2026-01-15T10:30:00.000Z' })
  viewedAt!: string | null;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  viewedBy!: string | null;
}

export class ListReportsResponseDto extends ApiPaginatedResponseDto(
  ListReportsResDto,
  'Reports fetched successfully',
) {}
