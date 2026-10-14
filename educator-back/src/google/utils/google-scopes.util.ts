import { GOOGLE_CLASSROOM_DEFAULT_SCOPES } from '../google.constants';

/** Split a Google token `scope` string into a normalized set. */
export function parseGoogleGrantedScopes(scope: string | null | undefined): Set<string> {
  if (!scope?.trim()) {
    return new Set();
  }
  return new Set(
    scope
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Required Classroom Connect scopes missing from a granted scope string.
 * Defaults to {@link GOOGLE_CLASSROOM_DEFAULT_SCOPES}.
 */
export function findMissingGoogleClassroomScopes(
  grantedScope: string | null | undefined,
  required: readonly string[] = GOOGLE_CLASSROOM_DEFAULT_SCOPES,
): string[] {
  const granted = parseGoogleGrantedScopes(grantedScope);
  return required.filter((scope) => !granted.has(scope));
}

export function hasAllRequiredGoogleClassroomScopes(
  grantedScope: string | null | undefined,
  required: readonly string[] = GOOGLE_CLASSROOM_DEFAULT_SCOPES,
): boolean {
  return findMissingGoogleClassroomScopes(grantedScope, required).length === 0;
}
