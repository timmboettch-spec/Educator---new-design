import { Educator, Schools } from 'src/database/entities';

/** School fields exposed on educator auth / LTI login payloads. */
export type EducatorSchoolAuthDto = {
  id: string;
  school_name: string;
  lms_enabled: boolean;
  google_classroom_enabled: boolean;
};

export function educatorBelongsToSchool(educator: Educator, schoolId: string): boolean {
  if (educator.school?.id === schoolId) {
    return true;
  }
  return (
    educator.schoolAssignments?.some((assignment) => assignment.school?.id === schoolId) ?? false
  );
}

export function getEducatorSchoolIds(educator: Educator): string[] {
  const ids = new Set<string>();
  if (educator.school?.id) {
    ids.add(educator.school.id);
  }
  for (const assignment of educator.schoolAssignments ?? []) {
    if (assignment.school?.id) {
      ids.add(assignment.school.id);
    }
  }
  return Array.from(ids);
}

export function mapSchoolToAuthDto(
  school: Pick<Schools, 'id' | 'school_name' | 'lms_enabled' | 'google_classroom_enabled'> & {
    id?: string;
    school_name?: string;
  },
): EducatorSchoolAuthDto {
  return {
    id: String(school.id),
    school_name: school.school_name ?? '',
    lms_enabled: school.lms_enabled ?? false,
    google_classroom_enabled: school.google_classroom_enabled === true,
  };
}

function collectActiveSchoolsForAuth(educator: Educator): Schools[] {
  if (educator.schoolAssignments?.length) {
    return educator.schoolAssignments
      .map((assignment) => assignment.school)
      .filter(
        (school): school is Schools =>
          Boolean(school?.id && school.is_active !== false),
      );
  }

  const legacySchool = educator.school;
  if (legacySchool?.id && legacySchool.is_active !== false) {
    return [legacySchool];
  }

  return [];
}

function sortPrimarySchoolFirst(
  schools: EducatorSchoolAuthDto[],
  primarySchoolId: string | undefined,
): EducatorSchoolAuthDto[] {
  if (!primarySchoolId || schools.length <= 1) {
    return schools;
  }

  return [...schools].sort((left, right) => {
    if (left.id === primarySchoolId) return -1;
    if (right.id === primarySchoolId) return 1;
    return 0;
  });
}

/**
 * Builds the `schools[]` list for educator login / LTI payloads.
 * Primary school is listed first; inactive schools are omitted.
 */
export function mapEducatorSchoolsForAuth(educator: Educator): EducatorSchoolAuthDto[] {
  const primarySchoolId = educator.primarySchool?.id ?? educator.school?.id;
  const schools = collectActiveSchoolsForAuth(educator).map(mapSchoolToAuthDto);
  return sortPrimarySchoolFirst(schools, primarySchoolId);
}

/** True when any assigned school has Google Classroom enabled. */
export function isGoogleClassroomEnabledForEducator(educator: Educator): boolean {
  return mapEducatorSchoolsForAuth(educator).some(
    (school) => school.google_classroom_enabled,
  );
}
