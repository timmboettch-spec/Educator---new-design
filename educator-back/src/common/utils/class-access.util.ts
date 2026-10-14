import { Class } from 'src/database/entities';
import { ClassRepository } from 'src/database/repositories/class.repository';
import { EducatorSchoolRepository } from 'src/database/repositories/educator-school.repository';

/**
 * Resolves a class the educator may access, or `null`: active, owned or co-instructed, its
 * school (if any) active, and the educator still assigned to that school. Takes repositories
 * rather than living on `ClassesService` so modules `ClassesModule` depends on (e.g.
 * `ClassSimulationsModule`) can run the same check without a module cycle.
 */
export async function findAccessibleClassForEducator(
  classRepo: ClassRepository,
  educatorSchoolRepo: EducatorSchoolRepository,
  classId: string,
  educatorId: string,
  schoolId?: string,
): Promise<Class | null> {
  // Check if educator is either primary owner OR co-instructor
  const cls = await classRepo.findActiveByIdWithSchoolForEducator(classId, educatorId);

  if (!cls) return null;

  // Classes without a school_id are always accessible (legacy data).
  if (!cls.school_id) return cls;

  // Hide class if its school is currently inactive.
  if (cls.school && !cls.school.is_active) return null;

  // If a specific schoolId was supplied, it must match.
  if (schoolId && cls.school_id !== schoolId) return null;

  // Verify the educator is still assigned to this class's school.
  const assignment = await educatorSchoolRepo.findOne({
    where: { educator: { id: educatorId }, school: { id: cls.school_id } },
  });
  return assignment ? cls : null;
}
