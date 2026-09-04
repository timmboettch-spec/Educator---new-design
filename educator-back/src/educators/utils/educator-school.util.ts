import { Educator } from '../entity/educator.entity';

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
