import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';
import {
  ClassSimulationAssignmentConstants,
  ClassSimulationAssignmentFailureReason,
  ClassSimulationAssignmentStatus,
} from 'src/common/constants';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { IsAssignmentDate } from 'src/common/validators/is-assignment-date.validator';
import { trimEach } from 'src/common/utils/query-array.util';
import { toCanonicalUuid, toCanonicalUuids } from 'src/common/utils/uuid.util';

const { MAX_CLASSES, MAX_SIMULATIONS } = ClassSimulationAssignmentConstants.BULK;

/**
 * `POST /class-simulations/bulk` — every simulation in `simulationIds` assigned to every class in
 * `classIds`, all with the same window. All-or-nothing: one failing pair and nothing is saved.
 * Seats are computed server-side, so there is no `reduceToken`. `schoolId` and `classIds` are
 * lowercased first, so `ABC…` / `abc…` are one class (and a duplicate) and every JS-side id
 * comparison matches the lowercase ids Postgres returns.
 */
export class BulkAssignClassSimulationsReqDto {
  @Transform(({ value }: { value: unknown }) => toCanonicalUuid(value))
  @IsNotEmpty({ message: VALIDATION_MSG.IS_NOT_EMPTY('schoolId') })
  @IsUUID('4', { message: VALIDATION_MSG.IS_UUID('schoolId') })
  @ApiProperty({ example: '43637818-250a-4579-ad73-de15e51a92f8' })
  schoolId!: string;

  @Transform(({ value }: { value: unknown }) => toCanonicalUuids(value))
  @IsArray({ message: VALIDATION_MSG.IS_ARRAY('classIds') })
  @ArrayNotEmpty({ message: VALIDATION_MSG.ARRAY_NOT_EMPTY('classIds') })
  @ArrayMaxSize(MAX_CLASSES, { message: VALIDATION_MSG.ARRAY_MAX_SIZE('classIds', MAX_CLASSES) })
  @ArrayUnique({ message: VALIDATION_MSG.ARRAY_UNIQUE('classIds') })
  @IsUUID('4', { each: true, message: VALIDATION_MSG.IS_UUID('classIds') })
  @ApiProperty({
    type: [String],
    maxItems: MAX_CLASSES,
    example: ['4bfcf191-c608-4552-af95-a479209b5e72', '9c1d2e3f-4a5b-4c6d-8e7f-a1b2c3d4e5f6'],
  })
  classIds!: string[];

  @Transform(({ value }: { value: unknown }) => trimEach(value))
  @IsArray({ message: VALIDATION_MSG.IS_ARRAY('simulationIds') })
  @ArrayNotEmpty({ message: VALIDATION_MSG.ARRAY_NOT_EMPTY('simulationIds') })
  @ArrayMaxSize(MAX_SIMULATIONS, {
    message: VALIDATION_MSG.ARRAY_MAX_SIZE('simulationIds', MAX_SIMULATIONS),
  })
  @ArrayUnique({ message: VALIDATION_MSG.ARRAY_UNIQUE('simulationIds') })
  @IsString({ each: true, message: VALIDATION_MSG.IS_STRING('simulationIds') })
  @IsNotEmpty({ each: true, message: VALIDATION_MSG.IS_NOT_EMPTY('simulationIds') })
  @ApiProperty({
    type: [String],
    maxItems: MAX_SIMULATIONS,
    description: 'Simulation business ids (case-sensitive).',
    example: ['colostomy-care-and-education', 'stroke-evaluation'],
  })
  simulationIds!: string[];

  @IsNotEmpty({ message: VALIDATION_MSG.IS_NOT_EMPTY('startDate') })
  @IsAssignmentDate()
  @ApiProperty({ description: 'MM-DD-YYYY or YYYY-MM-DD', example: '09-01-2026' })
  startDate!: string;

  @IsNotEmpty({ message: VALIDATION_MSG.IS_NOT_EMPTY('dueDate') })
  @IsAssignmentDate()
  @ApiProperty({ description: 'MM-DD-YYYY or YYYY-MM-DD', example: '10-16-2026' })
  dueDate!: string;

  @IsNotEmpty({ message: VALIDATION_MSG.IS_NOT_EMPTY('endDate') })
  @IsAssignmentDate()
  @ApiProperty({ description: 'MM-DD-YYYY or YYYY-MM-DD', example: '12-15-2026' })
  endDate!: string;
}

/**
 * One created assignment. Fields are declared, not `PickType`d — there is no
 * `ClassSimulation` response DTO and the entity's columns are snake_case (same as the listing DTO).
 */
export class BulkAssignPairResultResDto {
  @ApiProperty({ example: '4bfcf191-c608-4552-af95-a479209b5e72' })
  classId!: string;

  @ApiProperty({ example: 'colostomy-care-and-education' })
  simulationId!: string;

  @ApiProperty({
    enum: ClassSimulationAssignmentStatus,
    example: ClassSimulationAssignmentStatus.CREATED,
  })
  status!: ClassSimulationAssignmentStatus;

  @ApiProperty({ example: '5fbbb022-dd40-4789-81bf-095473532982' })
  classSimulationId!: string;

  @ApiProperty({ description: 'AI (avatar) simulation that consumes seats', example: true })
  isAi!: boolean;

  @ApiProperty({ example: 24 })
  seatsCharged!: number;

  @ApiProperty({ example: '2026-09-01' })
  startDate!: string;

  @ApiProperty({ example: '2026-10-16' })
  dueDate!: string;

  @ApiProperty({ example: '2026-12-15' })
  endDate!: string;
}

/** Per-pair entry of a 422's `error.results` (Swagger only — the filter builds the body). */
export class BulkAssignPairFailureResDto {
  @ApiProperty({ example: '4bfcf191-c608-4552-af95-a479209b5e72' })
  classId!: string;

  @ApiProperty({ example: 'colostomy-care-and-education' })
  simulationId!: string;

  @ApiProperty({
    enum: [ClassSimulationAssignmentStatus.VALID, ClassSimulationAssignmentStatus.FAILED],
    example: ClassSimulationAssignmentStatus.FAILED,
  })
  status!: ClassSimulationAssignmentStatus;

  @ApiPropertyOptional({
    enum: ClassSimulationAssignmentFailureReason,
    example: ClassSimulationAssignmentFailureReason.ALREADY_ASSIGNED_OVERLAP,
  })
  reason?: ClassSimulationAssignmentFailureReason;

  @ApiPropertyOptional({
    example: 'This simulation is already assigned to this class for an overlapping date range.',
  })
  message?: string;
}

export class BulkAssignClassSimulationsResDto {
  @ApiProperty({ example: 4 })
  total!: number;

  @ApiProperty({ example: 4 })
  created!: number;

  @ApiProperty({ example: 48 })
  seatsCharged!: number;

  @ApiProperty({ example: 52 })
  remainingSeats!: number;

  @ApiProperty({ type: [BulkAssignPairResultResDto] })
  results!: BulkAssignPairResultResDto[];
}

export class BulkAssignClassSimulationsResponseDto extends ApiResponseDto(
  BulkAssignClassSimulationsResDto,
  '4 simulation assignment(s) created successfully.',
) {}
