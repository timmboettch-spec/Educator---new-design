export interface NrpsMemberLike {
  id?: string | number;
  userId?: string | number;
  user_id?: string | number;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  roles?: string[];
}

export interface BulkCreateStudentPayload {
  student_id: string | null;
  student_name: string | null;
  email?: string;
  score: number | null;
}

function getNrpsUserId(member: NrpsMemberLike): string {
  return String(member.userId ?? member.user_id ?? member.id ?? '').trim();
}

function getDisplayName(member: NrpsMemberLike): string {
  return (member.name ?? `${member.given_name ?? ''} ${member.family_name ?? ''}`.trim()).trim();
}

/**
 * Moodle NRPS often includes the site Guest account (default userId 1, root@localhost).
 * It must never be sent to POST /api/classes/bulk.
 */
export function isNrpsGuestUser(member: NrpsMemberLike): boolean {
  const userId = getNrpsUserId(member);
  if (userId === '1') {
    return true;
  }

  const email = typeof member.email === 'string' ? member.email.trim().toLowerCase() : '';
  if (email === 'root@localhost') {
    return true;
  }

  const name = getDisplayName(member).toLowerCase();
  if (name === 'guest user' || name === 'guest' || /\bguest\b/.test(name)) {
    return true;
  }

  if (Array.isArray(member.roles)) {
    const roles = member.roles.map((role) => String(role ?? '').toLowerCase());
    if (roles.some((role) => role.includes('guest'))) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a member has teaching/administrative roles that should exclude them from student import.
 * Returns true if member should NOT be imported as a student.
 */
export function hasInstructorOrAdminRole(member: NrpsMemberLike): boolean {
  if (!Array.isArray(member.roles) || member.roles.length === 0) {
    return false;
  }

  const normalized = member.roles.map((role) => String(role ?? '').toLowerCase());

  return normalized.some((role) =>
    role.includes('instructor') ||
    role.includes('teacher') ||
    role.includes('administrator') ||
    role.includes('admin') ||
    role.includes('manager') ||
    role.includes('contentdeveloper') ||
    role.includes('mentor') ||
    role === 'teaching assistant' ||
    role.includes('teachingassistant') ||
    // LTI 1.3 standard role URNs
    role.endsWith('/instructor') ||
    role.endsWith('/teachingassistant') ||
    role.endsWith('/contentdeveloper') ||
    role.endsWith('/administrator') ||
    role.endsWith('/mentor')
  );
}

/**
 * Checks if member has explicit learner/student role AND is not also an instructor.
 * Only returns true for actual students.
 */
export function hasLearnerOnlyRole(member: NrpsMemberLike): boolean {
  if (!Array.isArray(member.roles) || member.roles.length === 0) {
    return false;
  }

  // If they have any instructor/admin role, they're not a student
  if (hasInstructorOrAdminRole(member)) {
    return false;
  }

  const normalized = member.roles.map((role) => String(role ?? '').toLowerCase());

  return normalized.some((role) =>
    role.includes('learner') ||
    role.includes('student') ||
    role.endsWith('#student') ||
    role.endsWith('/student') ||
    role.endsWith('/learner') ||
    role === 'student' ||
    role === 'learner'
  );
}

export function normalizeImportableEmail(email: unknown): string | undefined {
  if (typeof email !== 'string') {
    return undefined;
  }
  const trimmed = email.trim();
  if (!trimmed || trimmed.toLowerCase() === 'root@localhost') {
    return undefined;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

export function toBulkCreateStudent(member: NrpsMemberLike): BulkCreateStudentPayload | null {
  if (isNrpsGuestUser(member)) {
    return null;
  }

  // Skip instructors, teachers, admins - they should not become students
  if (hasInstructorOrAdminRole(member)) {
    return null;
  }

  const student: BulkCreateStudentPayload = {
    student_id: getNrpsUserId(member) || null,
    student_name: getDisplayName(member) || null,
    score: null,
  };

  const email = normalizeImportableEmail(member.email);
  if (email) {
    student.email = email;
  }

  return student;
}

export function extractImportableNrpsStudents<T extends NrpsMemberLike>(
  members: T[],
  isLearner: (member: T) => boolean,
): BulkCreateStudentPayload[] {
  return members
    .filter((member) => {
      // Double-check: only process if isLearner AND member has learner-only role
      return isLearner(member) && hasLearnerOnlyRole(member);
    })
    .map((member) => toBulkCreateStudent(member))
    .filter((student): student is BulkCreateStudentPayload => student !== null);
}
