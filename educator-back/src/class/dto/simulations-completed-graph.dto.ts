import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { toStringArray } from 'src/common/utils/query-array.util';
import { ApiResponseDto } from 'src/common/dtos/api-response.dto';
import { MutuallyExclusiveWith } from 'src/common/validators/mutually-exclusive-with.validator';
import { MaxItemsOfMappedField } from 'src/common/validators/max-items-of-mapped-field.validator';
import {
  ClassConstants,
  SimulationsCompletedGraphCompareLevel,
  SimulationsCompletedGraphConstants,
} from '../constants';

export class SimulationsCompletedGraphReqDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStringArray(value))
  @IsArray({ message: VALIDATION_MSG.INVALID('studentIds') })
  @ArrayMaxSize(SimulationsCompletedGraphConstants.MAX_FILTER_IDS, {
    message: VALIDATION_MSG.ARRAY_MAX_SIZE(
      'studentIds',
      SimulationsCompletedGraphConstants.MAX_FILTER_IDS,
    ),
  })
  @IsUUID('4', { each: true, message: VALIDATION_MSG.IS_UUID('studentIds') })
  @ApiPropertyOptional({
    type: [String],
    example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
    description: 'Only count reports for these students.',
  })
  studentIds?: string[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStringArray(value))
  @IsArray({ message: VALIDATION_MSG.INVALID('classIds') })
  @ArrayMaxSize(SimulationsCompletedGraphConstants.MAX_FILTER_IDS, {
    message: VALIDATION_MSG.ARRAY_MAX_SIZE(
      'classIds',
      SimulationsCompletedGraphConstants.MAX_FILTER_IDS,
    ),
  })
  @IsUUID('4', { each: true, message: VALIDATION_MSG.IS_UUID('classIds') })
  @ApiPropertyOptional({
    type: [String],
    example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
    description: 'Only count reports in these classes.',
  })
  classIds?: string[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStringArray(value))
  @IsArray({ message: VALIDATION_MSG.INVALID('schoolIds') })
  @ArrayMaxSize(SimulationsCompletedGraphConstants.MAX_FILTER_IDS, {
    message: VALIDATION_MSG.ARRAY_MAX_SIZE(
      'schoolIds',
      SimulationsCompletedGraphConstants.MAX_FILTER_IDS,
    ),
  })
  @IsUUID('4', { each: true, message: VALIDATION_MSG.IS_UUID('schoolIds') })
  @ApiPropertyOptional({
    type: [String],
    example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
    description: 'Only count reports in classes of these schools.',
  })
  schoolIds?: string[];

  @IsOptional()
  @IsUUID('4', { message: VALIDATION_MSG.IS_UUID('forSchool') })
  @MutuallyExclusiveWith(['forClass', 'schoolIds', 'classIds', 'studentIds', 'compareBy'], {
    message: VALIDATION_MSG.MUTUALLY_EXCLUSIVE(
      'forSchool',
      'forClass, schoolIds, classIds, studentIds, compareBy',
    ),
  })
  @ApiPropertyOptional({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description:
      "Drill-down selector (a schoolId): returns that school's completions grouped by class " +
      '(byClass), instead of the default bySchool array. Cannot be combined with forClass, compareBy or ' +
      'with schoolIds/classIds/studentIds.',
  })
  forSchool?: string;

  @IsOptional()
  @IsUUID('4', { message: VALIDATION_MSG.IS_UUID('forClass') })
  @MutuallyExclusiveWith(['forSchool', 'schoolIds', 'classIds', 'studentIds', 'compareBy'], {
    message: VALIDATION_MSG.MUTUALLY_EXCLUSIVE(
      'forClass',
      'forSchool, schoolIds, classIds, studentIds, compareBy',
    ),
  })
  @ApiPropertyOptional({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa7',
    description:
      "Drill-down selector (a classId): returns that class's completions grouped by student " +
      '(byStudent), instead of the default bySchool array. Cannot be combined with forSchool, compareBy or ' +
      'with schoolIds/classIds/studentIds.',
  })
  forClass?: string;

  @IsOptional()
  @IsEnum(SimulationsCompletedGraphCompareLevel, { message: VALIDATION_MSG.INVALID('compareBy') })
  @MutuallyExclusiveWith(['forSchool', 'forClass'], {
    message: VALIDATION_MSG.MUTUALLY_EXCLUSIVE('compareBy', 'forSchool, forClass'),
  })
  @MaxItemsOfMappedField(
    {
      [SimulationsCompletedGraphCompareLevel.SCHOOL]: 'schoolIds',
      [SimulationsCompletedGraphCompareLevel.CLASS]: 'classIds',
      [SimulationsCompletedGraphCompareLevel.STUDENT]: 'studentIds',
    },
    SimulationsCompletedGraphConstants.COMPARE_MAX_IDS,
  )
  @ApiPropertyOptional({
    enum: SimulationsCompletedGraphCompareLevel,
    example: SimulationsCompletedGraphCompareLevel.CLASS,
    description:
      'Compare mode: also returns byMonthSeries, the per-month counts of each selected school, ' +
      'class or student. Active only when the matching id list (schoolIds for school, classIds ' +
      'for class, studentIds for student) is non-empty (otherwise ignored, default response); ' +
      `that list may hold at most ${SimulationsCompletedGraphConstants.COMPARE_MAX_IDS} ids. ` +
      'Cannot be combined with forSchool or forClass.',
  })
  compareBy?: SimulationsCompletedGraphCompareLevel;

  @IsOptional()
  @Type(() => Number)
  @IsIn(ClassConstants.SIMULATIONS_COMPLETED_GRAPH_MONTH_PRESETS, {
    message: VALIDATION_MSG.INVALID('months'),
  })
  @ApiPropertyOptional({
    example: 6,
    enum: ClassConstants.SIMULATIONS_COMPLETED_GRAPH_MONTH_PRESETS,
    description: 'Trailing window in months (default 3); ignored when allTime is true.',
  })
  months?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean({ message: VALIDATION_MSG.IS_BOOLEAN('allTime') })
  @ApiPropertyOptional({ example: false, description: 'Count all reports, ignoring months.' })
  allTime?: boolean;
}

export class SimulationsCompletedGraphMonthResDto {
  @ApiProperty({ example: 2026 })
  year!: number;

  @ApiProperty({ example: 3 })
  month!: number;

  @ApiProperty({ example: 42 })
  count!: number;
}

export class SimulationsCompletedGraphSeriesResDto {
  @ApiProperty({
    type: String,
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    nullable: true,
    description:
      'School, class or student id; null only for a school series of a class with no school.',
  })
  seriesId!: string | null;

  @ApiProperty({
    type: String,
    example: 'Lincoln High',
    nullable: true,
    description: 'School name, class name or student code; null when the entity has none.',
  })
  seriesName!: string | null;

  @ApiProperty({ example: 2 })
  count!: number;
}

export class SimulationsCompletedGraphMonthSeriesResDto {
  @ApiProperty({ example: 2026 })
  year!: number;

  @ApiProperty({ example: 8 })
  month!: number;

  @ApiProperty({ example: 3, description: 'Equals the byMonth count for the same month.' })
  total!: number;

  @ApiProperty({
    type: [SimulationsCompletedGraphSeriesResDto],
    example: [
      { seriesId: '3fa85f64-5717-4562-b3fc-2c963f66afa6', seriesName: 'Lincoln High', count: 2 },
      {
        seriesId: '3fa85f64-5717-4562-b3fc-2c963f66afa7',
        seriesName: 'Riverside Academy',
        count: 1,
      },
    ],
    description: 'Ordered by count descending, then name, then id.',
  })
  series!: SimulationsCompletedGraphSeriesResDto[];
}

export class SimulationsCompletedGraphSchoolResDto {
  @ApiProperty({
    type: String,
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    nullable: true,
  })
  schoolId!: string | null;

  @ApiProperty({ example: 17 })
  count!: number;
}

export class SimulationsCompletedGraphClassResDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  classId!: string;

  @ApiProperty({ example: 'Period 3 Biology' })
  className!: string;

  @ApiProperty({ example: 9 })
  count!: number;
}

export class SimulationsCompletedGraphStudentResDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  studentId!: string;

  @ApiProperty({ type: String, example: 'ABC-1234', nullable: true })
  studentCode!: string | null;

  @ApiProperty({ example: 4 })
  count!: number;
}

export class SimulationsCompletedGraphResDto {
  @ApiProperty({ type: [SimulationsCompletedGraphMonthResDto] })
  byMonth!: SimulationsCompletedGraphMonthResDto[];

  @ApiPropertyOptional({
    type: [SimulationsCompletedGraphMonthSeriesResDto],
    example: [
      {
        year: 2026,
        month: 8,
        total: 3,
        series: [
          {
            seriesId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
            seriesName: 'Lincoln High',
            count: 2,
          },
          {
            seriesId: '3fa85f64-5717-4562-b3fc-2c963f66afa7',
            seriesName: 'Riverside Academy',
            count: 1,
          },
        ],
      },
    ],
    description:
      'Returned only when compareBy is active. One entry per month (same order as byMonth); ' +
      'only months and entities with completions are listed.',
  })
  byMonthSeries?: SimulationsCompletedGraphMonthSeriesResDto[];

  @ApiPropertyOptional({
    type: [SimulationsCompletedGraphSchoolResDto],
    description: 'Returned by default (no forSchool/forClass); omitted for drill-downs.',
  })
  bySchool?: SimulationsCompletedGraphSchoolResDto[];

  @ApiPropertyOptional({
    type: [SimulationsCompletedGraphClassResDto],
    description: 'Returned only when forSchool is set.',
  })
  byClass?: SimulationsCompletedGraphClassResDto[];

  @ApiPropertyOptional({
    type: [SimulationsCompletedGraphStudentResDto],
    description: 'Returned only when forClass is set.',
  })
  byStudent?: SimulationsCompletedGraphStudentResDto[];
}

export class SimulationsCompletedGraphResponseDto extends ApiResponseDto(
  SimulationsCompletedGraphResDto,
) {}
