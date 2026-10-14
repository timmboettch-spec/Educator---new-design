import { ApiProperty, ApiPropertyOptional, IntersectionType, PickType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  LibraryDifficulty,
  LibraryLearnerLevel,
  LibraryModality,
  SimulationConstants,
} from 'src/common/constants';
import { LibraryFilterValues } from 'src/common/decorators/library-filter-values.decorator';
import { VALIDATION_MSG } from 'src/common/messages/validation.message';
import { collapseWhitespace } from 'src/common/utils/simulation.util';
import { toRepeatedStringArray } from 'src/common/utils/query-array.util';
import { LiteQueryDto } from 'src/common/dtos/lite-query.dto';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { ApiPaginatedResponseDto } from 'src/common/dtos/api-response.dto';
import { SimulationV2ResponseDto, UnitResponseDto } from 'src/database/response-dto';

/** The filters and search of the My Library list (RE-242). Every one is optional. */
export class MyLibraryFiltersReqDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    // A blank search is no search.
    return collapseWhitespace(value) || undefined;
  })
  @IsString({ message: VALIDATION_MSG.IS_STRING('search') })
  @MaxLength(SimulationConstants.LIBRARY_FILTER.SEARCH_MAX_LENGTH, {
    message: VALIDATION_MSG.MAX_LENGTH(
      'search',
      SimulationConstants.LIBRARY_FILTER.SEARCH_MAX_LENGTH,
    ),
  })
  @ApiPropertyOptional({
    example: 'cardiac',
    maxLength: SimulationConstants.LIBRARY_FILTER.SEARCH_MAX_LENGTH,
    description:
      'Matches part of the simulation title, ignoring case and extra spaces; `%` and `_` match literally. Blank means no search.',
  })
  search?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toRepeatedStringArray(value))
  @IsArray({ message: VALIDATION_MSG.IS_ARRAY('learnerLevel') })
  @IsEnum(LibraryLearnerLevel, { each: true, message: VALIDATION_MSG.IS_ENUM('learnerLevel') })
  @ApiPropertyOptional({
    enum: LibraryLearnerLevel,
    isArray: true,
    example: [LibraryLearnerLevel.SECONDARY],
    description:
      'Repeat the parameter for several values. Audience text mentioning post-secondary is Post-Secondary; text mentioning secondary or high school is Secondary; any other text (for example BSN) is Post-Secondary; no text matches neither.',
  })
  learnerLevel?: LibraryLearnerLevel[];

  @LibraryFilterValues('targetAudience')
  @ApiPropertyOptional({
    type: [String],
    example: ['High School Allied Health'],
    description:
      'Repeat the parameter for several values. The whole audience text must match; case and extra spaces are ignored.',
  })
  targetAudience?: string[];

  @LibraryFilterValues('productName')
  @ApiPropertyOptional({
    type: [String],
    example: ['Knee Set'],
    description:
      'Repeat the parameter for several values (a comma stays part of the name). The whole product name must match; case and extra spaces are ignored. A simulation without a product name never matches.',
  })
  productName?: string[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toRepeatedStringArray(value))
  @IsArray({ message: VALIDATION_MSG.IS_ARRAY('modality') })
  @IsEnum(LibraryModality, { each: true, message: VALIDATION_MSG.IS_ENUM('modality') })
  @ApiPropertyOptional({
    enum: LibraryModality,
    isArray: true,
    example: [LibraryModality.AVATAR],
    description:
      'Repeat the parameter for several values; a simulation matching any of them is returned. Workstation means no avatar.',
  })
  modality?: LibraryModality[];

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toRepeatedStringArray(value))
  @IsArray({ message: VALIDATION_MSG.IS_ARRAY('difficulty') })
  @IsEnum(LibraryDifficulty, { each: true, message: VALIDATION_MSG.IS_ENUM('difficulty') })
  @ApiPropertyOptional({
    enum: LibraryDifficulty,
    isArray: true,
    example: [LibraryDifficulty.EASY, LibraryDifficulty.MEDIUM],
    description:
      'Repeat the parameter for several values. The request must be exactly Easy, Medium or Hard; the stored difficulty is compared ignoring case and extra spaces.',
  })
  difficulty?: LibraryDifficulty[];

  @LibraryFilterValues('unitId')
  @ApiPropertyOptional({
    type: [String],
    example: ['adult-health'],
    description:
      "Repeat the parameter for several Unit ids; matches the Simulation's current Unit.",
  })
  unitId?: string[];
}

export class ListMyLibraryReqDto extends IntersectionType(
  PaginationDto,
  LiteQueryDto,
  MyLibraryFiltersReqDto,
) {}

/**
 * The simulation behind a saved library entry — only what a library card needs.
 * `description`, `learnerLevel`, `difficulty` and `avatarEnabled` are declared here rather than
 * picked: `SimulationV2ResponseDto` types them as optional (`string | undefined`), but this
 * response always sends the key, using `null` for a missing text and `false` for a missing flag.
 */
export class MyLibraryScenarioResDto extends PickType(SimulationV2ResponseDto, [
  'id',
  'title',
] as const) {
  @ApiProperty({
    example: 'Practise recognising and responding to cardiac arrest.',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({ example: 'High School Health Science', nullable: true })
  learnerLevel!: string | null;

  @ApiProperty({ example: 'Beginner', nullable: true })
  difficulty!: string | null;

  @ApiProperty({
    example: true,
    description: 'true for an avatar simulation, false for workstation',
  })
  avatarEnabled!: boolean;
}

/**
 * The simulation behind a saved entry, widened for the full item. `estimatedDuration`,
 * `timeAllotment`, `scenarioImage`, `productName`, `clinicalSetting` and `learningObjectives` are
 * declared here rather than picked: they are derived (a blank-to-null text, a value inside
 * `studentBriefing` or `productSetup`, `department`, a cleaned list) or typed `string | undefined` on the entity DTO, while this
 * response always sends the key.
 */
export class MyLibraryFullScenarioResDto extends MyLibraryScenarioResDto {
  @ApiProperty({
    example: '45 minutes',
    nullable: true,
    description: "The simulation's estimated duration; null when none is set (see `timeAllotment`)",
  })
  estimatedDuration!: string | null;

  @ApiProperty({
    example: '30 minutes',
    nullable: true,
    description:
      "The time allotment from the simulation's student briefing; null when none is set. Sent as its own field, not as a fallback for `estimatedDuration`",
  })
  timeAllotment!: string | null;

  @ApiProperty({ example: 'https://cdn.example.com/cardiac.png', nullable: true })
  scenarioImage!: string | null;

  @ApiProperty({
    example: 'Sim Mannequin Pro',
    nullable: true,
    description:
      'Required product name: the simulation product setup title, shown whenever one is set, even if the simulation no longer requires a product setup',
  })
  productName!: string | null;

  @ApiProperty({
    example: 'Medical-Surgical Unit',
    nullable: true,
    description: 'Where the simulation is set (the simulation `department`)',
  })
  clinicalSetting!: string | null;

  @ApiProperty({
    type: [String],
    example: ['Recognise cardiac arrest', 'Start CPR within one minute'],
    description: 'The simulation learning objectives, one per entry; empty when it has none',
  })
  learningObjectives!: string[];
}

/** The unit a saved entry is filed under. */
export class MyLibraryUnitResDto extends PickType(UnitResponseDto, ['id', 'name'] as const) {
  @ApiProperty({ example: 'https://cdn.example.com/unit.png', nullable: true })
  imageUrl!: string | null;
}

/**
 * The lite item (`?lite=true`): only what a library card renders. A base class rather than a
 * `PickType` of the full item, so the full item growing cannot make this one heavier.
 */
export class MyLibraryLiteItemResDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'The saved library entry id',
  })
  id!: string;

  @ApiProperty({ type: MyLibraryScenarioResDto })
  scenario!: MyLibraryScenarioResDto;
}

/**
 * One item of `GET /api/educator-simulations/my-library/list` (full variant, the default).
 * `scenario` keeps the singular key of the existing `my-library` response so the frontend can
 * swap routes without remapping.
 */
export class MyLibraryItemResDto extends MyLibraryLiteItemResDto {
  @ApiProperty({
    example: 'adult-health',
    description: "The Simulation's current unit; empty when it has none",
  })
  unitId!: string;

  @ApiProperty({
    type: MyLibraryUnitResDto,
    nullable: true,
    description: 'null when the unit no longer exists',
  })
  unit!: MyLibraryUnitResDto | null;

  @ApiProperty({ type: MyLibraryFullScenarioResDto })
  declare scenario: MyLibraryFullScenarioResDto;
}

export class ListMyLibraryResponseDto extends ApiPaginatedResponseDto(
  MyLibraryItemResDto,
  'Simulations fetched successfully',
) {}
