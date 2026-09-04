export function extractLtiRoles(rolesClaimValue: unknown): string[] {
  return Array.isArray(rolesClaimValue)
    ? rolesClaimValue.map((r) => String(r).toLowerCase())
    : typeof rolesClaimValue === 'string'
      ? [String(rolesClaimValue).toLowerCase()]
      : [];
}

export function isInstructorRole(roles: string[]): boolean {
  return roles.some(
    (role) =>
      role.includes('instructor') ||
      role.includes('teacher') ||
      role.includes('administrator') ||
      role.includes('admin') ||
      role.includes('manager') ||
      role.endsWith('#instructor') ||
      role.endsWith('/instructor'),
  );
}

export function isLearnerOnlyRole(roles: string[]): boolean {
  const hasLearner = roles.some(
    (role) =>
      role.includes('learner') ||
      role.includes('student') ||
      role.endsWith('#learner') ||
      role.endsWith('/learner') ||
      role.endsWith('#student') ||
      role.endsWith('/student'),
  );

  return hasLearner && !isInstructorRole(roles);
}
