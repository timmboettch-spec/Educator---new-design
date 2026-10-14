import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { ApiPaginatedResponseDto } from 'src/common/dtos/api-response.dto';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { ClassSimulationListingConstants, ClassSimulationSortField } from 'src/common/constants';

export class ListClassSimulationsReqDto extends PaginationDto {
  @IsUUID('4', { message: VALIDATION_MSG.IS_UUID('classId') })
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  classId!: string;

  @IsOptional()
  @IsEnum(ClassSimulationSortField, { message: VALIDATION_MSG.IS_ENUM('sortBy') })
  @ApiPropertyOptional({
    enum: ClassSimulationSortField,
    default: ClassSimulationListingConstants.DEFAULT_SORT.FIELD,
    example: ClassSimulationSortField.SIM_NAME,
  })
  sortBy?: ClassSimulationSortField;

  /** Applies to `sortBy`, or to the default `simName` sort when `sortBy` is omitted. */
  @IsOptional()
  @IsIn(ClassSimulationListingConstants.SORT_DIRECTIONS, {
    message: VALIDATION_MSG.IS_ENUM('sortDir'),
  })
  @ApiPropertyOptional({
    enum: ClassSimulationListingConstants.SORT_DIRECTIONS,
    default: 'asc',
    example: 'asc',
  })
  sortDir?: (typeof ClassSimulationListingConstants.SORT_DIRECTIONS)[number];
}

/**
 * Row shape for `GET /class-simulations?classId=`. Fields are declared here rather than
 * `PickType`d — `ClassSimulation`'s columns are snake_case and this row renames/derives them.
 * No assignment status: the frontend derives it from the start/due/close dates.
 */
export class ClassSimulationListItemResDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  classSimulationId!: string;

  @ApiProperty({ example: 'colostomy-care-and-education' })
  simId!: string;

  @ApiProperty({ example: 'Colostomy Care and Education', nullable: true, type: String })
  simName!: string | null;

  @ApiProperty({ example: false })
  isArchived!: boolean;

  @ApiProperty({ example: '2026-01-01', nullable: true, type: String })
  startDate!: string | null;

  @ApiProperty({ example: '2026-12-31', nullable: true, type: String })
  dueDate!: string | null;

  @ApiProperty({ example: '2026-12-31', nullable: true, type: String })
  closeDate!: string | null;

  @ApiProperty({ example: 12 })
  startedCount!: number;

  @ApiProperty({ example: 4 })
  completedCount!: number;

  @ApiProperty({ example: 78, nullable: true, type: Number })
  averageScore!: number | null;

  /** AI (avatar) simulation; `null` when the simulation no longer exists. */
  @ApiProperty({ example: true, nullable: true, type: Boolean })
  avatarEnabled!: boolean | null;

  @ApiProperty({ example: 'gastrointestinal-care', nullable: true, type: String })
  unitId!: string | null;

  @ApiProperty({ example: 'Gastrointestinal Care', nullable: true, type: String })
  unitName!: string | null;
}

export class ListClassSimulationsResponseDto extends ApiPaginatedResponseDto(
  ClassSimulationListItemResDto,
  'Class simulations fetched successfully',
) {}
