import { Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';

import { Schools, Educator, Class, Student, ClassSimulation } from 'src/database/entities';
import {
  CLASS_REPOSITORY,
  CLASS_SIMULATION_REPOSITORY,
  EDUCATOR_REPOSITORY,
  SCHOOLS_REPOSITORY,
  STUDENT_REPOSITORY,
} from 'src/database/tokens';
import {
  ClassRepository,
  ClassSimulationRepository,
  EducatorRepository,
  SchoolsRepository,
  StudentRepository,
} from 'src/database/repositories';

@Injectable()
export class DashboardService {
  constructor(
    @Inject(SCHOOLS_REPOSITORY) private readonly schoolRepo: SchoolsRepository,
    @Inject(EDUCATOR_REPOSITORY) private readonly educatorRepo: EducatorRepository,
    @Inject(CLASS_REPOSITORY) private readonly classRepo: ClassRepository,
    @Inject(STUDENT_REPOSITORY) private readonly studentRepo: StudentRepository,
    @Inject(CLASS_SIMULATION_REPOSITORY) private readonly classSimRepo: ClassSimulationRepository,
  ) { }

  async getOverview(adminId: string): Promise<{
    schools: { total: number; data: Schools[] };
    educators: { total: number; data: Educator[] };
    students: { total: number; data: Student[] };
    classes: { total: number; data: Class[] };
    classSimulations: { total: number; data: ClassSimulation[] };
  }> {
    const PREVIEW_LIMIT = 50;
    const [
      totalSchools,
      schools,
      totalEducators,
      educators,
      totalStudents,
      students,
      totalClasses,
      classes,
      classSimulations,
    ] = await Promise.all([
      this.schoolRepo.count({ where: { user_id: { id: adminId }, deleted_at: IsNull() } }),
      this.schoolRepo.find({
        where: { user_id: { id: adminId }, deleted_at: IsNull() },
        take: PREVIEW_LIMIT,
      }),
      this.educatorRepo.count({
        where: { admin: { userRole: { userId: adminId } }, deleted_at: IsNull() },
      }),
      this.educatorRepo.find({
        where: { admin: { userRole: { userId: adminId } }, deleted_at: IsNull() },
        take: PREVIEW_LIMIT,
      }),
      this.studentRepo.countActiveForAdmin(adminId),
      this.studentRepo.findActiveForAdmin(adminId, PREVIEW_LIMIT),
      this.classRepo.count({
        where: { educator: { admin: { userRole: { userId: adminId } } }, deleted_at: IsNull() },
      }),
      this.classRepo.find({
        where: { educator: { admin: { userRole: { userId: adminId } } }, deleted_at: IsNull() },
        take: PREVIEW_LIMIT,
      }),
      this.classSimRepo.findPreviewForAdmin(adminId, PREVIEW_LIMIT),
    ]);

    return {
      schools: { total: totalSchools, data: schools },
      educators: { total: totalEducators, data: educators },
      students: { total: totalStudents, data: students },
      classes: { total: totalClasses, data: classes },
      classSimulations: { total: classSimulations.length, data: classSimulations },
    };
  }
}
