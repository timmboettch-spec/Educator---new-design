import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Schools } from '../schools/entity/schools.entity';
import { Educator } from '../educators/entity/educator.entity';
import { Class } from '../class/entity/class.entity';
import { Student } from '../students/entity/students.entity';
import { ClassSimulation } from '../class-simulations/entity/class-simulation.entity';
import { CommonStatus } from '../common/enums/status.enum';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Schools) private readonly schoolRepo: Repository<Schools>,
    @InjectRepository(Educator) private readonly educatorRepo: Repository<Educator>,
    @InjectRepository(Class) private readonly classRepo: Repository<Class>,
    @InjectRepository(Student) private readonly studentRepo: Repository<Student>,
    @InjectRepository(ClassSimulation) private readonly classSimRepo: Repository<ClassSimulation>,
  ) {}

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
      this.educatorRepo.count({ where: { admin: { id: adminId }, deleted_at: IsNull() } }),
      this.educatorRepo.find({
        where: { admin: { id: adminId }, deleted_at: IsNull() },
        take: PREVIEW_LIMIT,
      }),
      this.studentRepo
        .createQueryBuilder('s')
        .innerJoin('s.educator', 'e')
        .innerJoin('e.admin', 'a')
        .innerJoin('s.class', 'c')
        .where('a.id = :adminId', { adminId })
        .andWhere('s.status = :status', { status: CommonStatus.ACTIVE })
        .andWhere('c.status = :classStatus', { classStatus: CommonStatus.ACTIVE })
        .andWhere('s.deleted_at IS NULL')
        .getCount(),
      this.studentRepo
        .createQueryBuilder('s')
        .innerJoin('s.educator', 'e')
        .innerJoin('e.admin', 'a')
        .innerJoin('s.class', 'c')
        .where('a.id = :adminId', { adminId })
        .andWhere('s.status = :status', { status: CommonStatus.ACTIVE })
        .andWhere('c.status = :classStatus', { classStatus: CommonStatus.ACTIVE })
        .andWhere('s.deleted_at IS NULL')
        .take(PREVIEW_LIMIT)
        .getMany(),
      this.classRepo.count({
        where: { educator: { admin: { id: adminId } }, deleted_at: IsNull() },
      }),
      this.classRepo.find({
        where: { educator: { admin: { id: adminId } }, deleted_at: IsNull() },
        take: PREVIEW_LIMIT,
      }),
      this.classSimRepo
        .createQueryBuilder('cs')
        .innerJoin('cs.class', 'c')
        .innerJoin('c.educator', 'e')
        .innerJoin('e.admin', 'a')
        .where('a.id = :adminId', { adminId })
        .take(PREVIEW_LIMIT)
        .getMany(),
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
