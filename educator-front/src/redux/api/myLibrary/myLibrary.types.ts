import type {
  PaginationDto,
  PaginationMetaDto,
} from '../classes/classes.types';

// ─── Enums ────────────────────────────────────────────────────────────────────

/** The BE buckets audience text into one of these; any other value is a 400. */
export enum LibraryLearnerLevel {
  SECONDARY = 'Secondary',
  POST_SECONDARY = 'Post-Secondary',
}

/** `Avatar` is an avatar simulation, `Workstation` is any other; any other value is a 400. */
export enum LibraryModality {
  AVATAR = 'Avatar',
  WORKSTATION = 'Workstation',
}

/** Exact, case-sensitive values; any other value is a 400. */
export enum LibraryDifficulty {
  EASY = 'Easy',
  MEDIUM = 'Medium',
  HARD = 'Hard',
}

// ─── GET /api/educator-simulations/my-library/list ───────────────────────────

/**
 * Every filter is optional and repeated for several values (any-of within a
 * filter, all-of across filters). Unknown params (including `ls`) are a 400.
 */
export interface ListMyLibraryReqDto extends PaginationDto {
  /** Part of the title, at most 100 characters. */
  search?: string;
  learnerLevel?: LibraryLearnerLevel[];
  targetAudience?: string[];
  modality?: LibraryModality[];
  productName?: string[];
  difficulty?: LibraryDifficulty[];
  unitId?: string[];
}

export interface MyLibraryUnitResDto {
  id: string;
  name: string;
  imageUrl: string | null;
}

export interface MyLibraryFullScenarioResDto {
  id: string;
  title: string;
  description: string | null;
  /** The raw audience text, not the Secondary/Post-Secondary bucket. */
  learnerLevel: string | null;
  difficulty: string | null;
  avatarEnabled: boolean;
  /** Free text; `null` when blank or unset. */
  estimatedDuration: string | null;
  /** The student briefing's time allotment, sent apart from the estimate. */
  timeAllotment: string | null;
  scenarioImage: string | null;
  productName: string | null;
  clinicalSetting: string | null;
  learningObjectives: string[];
}

export interface MyLibraryItemResDto {
  id: string;
  /** The simulation's current unit; `''` when it has none. */
  unitId: string;
  /** `null` when the simulation has no unit, or its unit no longer exists. */
  unit: MyLibraryUnitResDto | null;
  scenario: MyLibraryFullScenarioResDto;
}

export interface ListMyLibraryResponseDto {
  message: string;
  data: MyLibraryItemResDto[];
  meta: PaginationMetaDto;
}

// ─── GET .../my-library/dropdown (Unit, Target Audience, Required Product Name) ─

/** Paged and searched (contains, ignoring case); not narrowed by the other filters. */
export interface FilterDropdownReqDto extends PaginationDto {
  /** At most 100 characters; blank means no search. */
  search?: string;
}

/** A unit at least one simulation in the library currently belongs to. */
export interface UnitDropdownResDto {
  id: string;
  name: string;
}

export interface UnitDropdownResponseDto {
  message: string;
  data: UnitDropdownResDto[];
  meta: PaginationMetaDto;
}

/** Target audiences or product names, each sent back as-is to its filter. */
export interface TextDropdownResponseDto {
  message: string;
  data: string[];
  meta: PaginationMetaDto;
}
