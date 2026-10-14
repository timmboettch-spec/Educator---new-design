import type { RoleSlug } from '@/features/auth/model/roles';

export type EducatorStepKey =
  'dashboard' | 'catalog' | 'classes' | 'library' | 'account';

export type AdminStepKey = 'lms' | 'schools' | 'educators' | 'account';

/** Any role's step key. Each role has its own BE row, so keys never mix. */
export type SetupStepKey = EducatorStepKey | AdminStepKey;

/**
 * FE-owned shape of the opaque `state` blob. The BE stores it verbatim and
 * replaces it wholesale on every PUT, so writers must always send the full
 * object.
 */
export interface GuidedPathState {
  visited?: Partial<Record<SetupStepKey, boolean>>;
}

/** BE `GuidedPathResDto`. */
export interface GuidedPathResDto {
  guidedPathId: string;
  userId: string;
  roleType: RoleSlug;
  /** Opaque on the wire; read it through `readVisited`. */
  state: Record<string, unknown>;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

/** BE `UpdateGuidedPathReqDto` — at least one field is required. */
export interface UpdateGuidedPathReqDto {
  /** Non-empty; fully replaces the stored state (no merge). */
  state?: Record<string, unknown>;
  completed?: boolean;
}

export interface GuidedPathResponseDto {
  message: string;
  data: GuidedPathResDto;
}
