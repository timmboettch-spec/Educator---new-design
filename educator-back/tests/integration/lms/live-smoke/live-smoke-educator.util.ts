import { DataSource } from 'typeorm';
import { Class, Educator, EducatorSchool, LmsClassMapping, Schools } from '../../../../src/database/entities';

const EDUCATOR_RELATIONS = ['school', 'schoolAssignments', 'schoolAssignments.school'] as const;

export interface SmokeEducatorSeedOptions {
  fullName: string;
  legacyFullNames?: string[];
  lmsCourseId: string;
}

export async function findOrCreateSmokeEducator(
  dataSource: DataSource,
  testSchool: Schools,
  options: SmokeEducatorSeedOptions,
): Promise<Educator> {
  const educatorRepo = dataSource.getRepository(Educator);

  // Prefer the educator already tied to this course mapping — keeps reruns idempotent.
  const existingMapping = await dataSource.getRepository(LmsClassMapping).findOne({
    where: { schoolId: testSchool.id, lmsCourseId: options.lmsCourseId },
  });
  if (existingMapping) {
    const classData = await dataSource.getRepository(Class).findOne({
      where: { id: existingMapping.classId },
    });
    if (classData?.educator_id) {
      const fromMapping = await educatorRepo.findOne({
        where: { id: classData.educator_id },
        relations: [...EDUCATOR_RELATIONS],
      });
      if (fromMapping) {
        return ensureSchoolAssignment(dataSource, fromMapping, testSchool);
      }
    }
  }

  const namesToTry = [options.fullName, ...(options.legacyFullNames ?? [])];
  for (const fullName of namesToTry) {
    const byName = await educatorRepo.findOne({
      where: { full_name: fullName },
      relations: [...EDUCATOR_RELATIONS],
    });
    if (byName) {
      return ensureSchoolAssignment(dataSource, byName, testSchool);
    }
  }

  const created = await educatorRepo.save(
    educatorRepo.create({
      full_name: options.fullName,
      school: testSchool,
      is_active: true,
      lms_enabled: true,
    }),
  );

  return ensureSchoolAssignment(
    dataSource,
    await educatorRepo.findOneOrFail({
      where: { id: created.id },
      relations: [...EDUCATOR_RELATIONS],
    }),
    testSchool,
  );
}

async function ensureSchoolAssignment(
  dataSource: DataSource,
  educator: Educator,
  testSchool: Schools,
): Promise<Educator> {
  const educatorRepo = dataSource.getRepository(Educator);
  const educatorSchoolRepo = dataSource.getRepository(EducatorSchool);

  const existingAssignment = await educatorSchoolRepo.findOne({
    where: {
      educator: { id: educator.id },
      school: { id: testSchool.id },
    },
  });
  if (!existingAssignment) {
    await educatorSchoolRepo.save(
      educatorSchoolRepo.create({
        educator,
        school: testSchool,
        is_primary: true,
      }),
    );
  }

  return educatorRepo.findOneOrFail({
    where: { id: educator.id },
    relations: [...EDUCATOR_RELATIONS],
  });
}
