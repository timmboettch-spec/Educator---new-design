import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, FindOneOptions, Repository } from 'typeorm';
import { GoogleStudentMapping } from 'src/database/entities';

@Injectable()
export class GoogleStudentMappingRepository {
  constructor(
    @InjectRepository(GoogleStudentMapping)
    private readonly repo: Repository<GoogleStudentMapping>,
  ) {}

  async create(data: DeepPartial<GoogleStudentMapping>): Promise<GoogleStudentMapping> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async save(entity: GoogleStudentMapping): Promise<GoogleStudentMapping> {
    return this.repo.save(entity);
  }

  async findOne(
    options: FindOneOptions<GoogleStudentMapping>,
  ): Promise<GoogleStudentMapping | null> {
    return this.repo.findOne(options);
  }

  async findByClassId(classId: string): Promise<GoogleStudentMapping[]> {
    return this.repo.find({ where: { classId } });
  }

  async findByClassAndGoogleUserId(
    classId: string,
    googleUserId: string,
  ): Promise<GoogleStudentMapping | null> {
    return this.repo.findOne({ where: { classId, googleUserId } });
  }

  async findByClassAndStudentId(
    classId: string,
    studentId: string,
  ): Promise<GoogleStudentMapping | null> {
    return this.repo.findOne({ where: { classId, studentId } });
  }

  async findByClassAndStudentCode(
    classId: string,
    studentCode: string,
  ): Promise<GoogleStudentMapping | null> {
    const code = studentCode.trim();
    if (!code) return null;
    return this.repo.findOne({ where: { classId, studentCode: code } });
  }

  async findByClassAndGoogleEmail(
    classId: string,
    googleEmail: string,
  ): Promise<GoogleStudentMapping | null> {
    const email = googleEmail.trim().toLowerCase();
    if (!email) {
      return null;
    }
    return this.repo
      .createQueryBuilder('m')
      .where('m.class_id = :classId', { classId })
      .andWhere('LOWER(m.google_email) = :email', { email })
      .getOne();
  }

  async findByGoogleUserId(googleUserId: string): Promise<GoogleStudentMapping[]> {
    const trimmed = googleUserId.trim();
    if (!trimmed) return [];
    return this.repo.find({
      where: { googleUserId: trimmed },
      order: { updatedAt: 'DESC' },
    });
  }

  async findByGoogleUserIdAndCourse(
    googleUserId: string,
    googleCourseId: string,
  ): Promise<GoogleStudentMapping | null> {
    return this.repo.findOne({
      where: {
        googleUserId: googleUserId.trim(),
        googleCourseId: googleCourseId.trim(),
      },
    });
  }

  async findBySchoolAndGoogleCourseId(
    schoolId: string,
    googleCourseId: string,
  ): Promise<GoogleStudentMapping[]> {
    return this.repo.find({ where: { schoolId, googleCourseId } });
  }

  async deleteByClassId(classId: string): Promise<number> {
    const result = await this.repo.delete({ classId });
    return result.affected ?? 0;
  }
}
