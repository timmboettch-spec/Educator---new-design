import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConnectClassDto } from '../dto/lms.dto';
import { LmsClassMapping } from '../entity/lms-class-mapping.entity';
import { LmsStudentMapping } from '../entity/lms-student-mapping.entity';
import { LmsConfigService } from './lms-config.service';
import { LmsRosterService } from './lms-roster.service';
import { Class } from 'src/class/entity/class.entity';
import { Educator } from 'src/educators/entity/educator.entity';
import { Student } from 'src/students/entity/students.entity';
import { CommonStatus } from 'src/common/enums/status.enum';
import { Messages } from 'src/common/utils/messages';

function generateStudentCode(prefix: string, lmsUserId: string): string {
  const trimmed = String(lmsUserId ?? '').trim();
  const normalized = /^\d+$/.test(trimmed) ? String(Number(trimmed)) : trimmed;
  return `${prefix}-${normalized}`;
}

function normalizeProvidedStudentCode(code: string, lmsUserId: string): string {
  const trimmed = code.trim();
  const normalizedUserId = /^\d+$/.test(String(lmsUserId).trim())
    ? String(Number(String(lmsUserId).trim()))
    : String(lmsUserId).trim();

  const legacyMatch = /^([A-Z0-9]{8})-M0*(\d+)$/i.exec(trimmed);
  if (legacyMatch) {
    return `${legacyMatch[1].toUpperCase()}-${String(Number(legacyMatch[2]))}`;
  }

  const genericMatch = /^([A-Z0-9]{8})-(.+)$/i.exec(trimmed);
  if (genericMatch) {
    return `${genericMatch[1].toUpperCase()}-${normalizedUserId}`;
  }

  return trimmed;
}

function randomClassCode(length = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

@Injectable()
export class LmsConnectService {
  constructor(
    @InjectRepository(LmsClassMapping)
    private readonly classMappingRepo: Repository<LmsClassMapping>,
    @InjectRepository(LmsStudentMapping)
    private readonly studentMappingRepo: Repository<LmsStudentMapping>,
    private readonly configService: LmsConfigService,
    private readonly rosterService: LmsRosterService,
    private readonly dataSource: DataSource,
  ) {}

  async previewRoster(
    schoolId: string,
    nrpsUrl: string,
  ): Promise<{
    members: Array<{
      lmsUserId: string;
      name: string | null;
      email: string | null;
      roles: string[];
    }>;
    note: string;
  }> {
    const config = await this.configService.getBySchoolId(schoolId);
    let roster: import('../interfaces/lms.interfaces').LmsRosterResponse;
    try {
      roster = await this.rosterService.fetchRoster(config, nrpsUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'LMS roster request failed';
      if (message.includes('LMS token request failed')) {
        throw new BadGatewayException(message);
      }
      throw error;
    }

    return {
      members: roster.members.map((member) => ({
        lmsUserId: member.userId,
        name: member.name,
        email: member.email,
        roles: member.roles,
      })),
      note: 'Roster is returned in memory only and is not persisted.',
    };
  }

  async connectClass(dto: ConnectClassDto): Promise<{
    classMapping: LmsClassMapping;
    mappings: Array<{ lmsUserId: string; studentCode: string }>;
    studentsCreated: number;
    storedPii: boolean;
  }> {
    const config = await this.configService.getBySchoolId(dto.schoolId);
    const sharePii = config.sharePii ?? false;
    const roster = await this.rosterService.fetchRoster(config, dto.nrpsUrl);
    const learnerMembers = roster.members.filter((member) => this.isLearner(member.roles));

    if (!learnerMembers.length) {
      throw new BadRequestException('LMS roster returned no student/learner members.');
    }

    const classData = await this.dataSource.manager.findOne(Class, {
      where: { id: dto.classId, is_active: true },
      relations: ['educator'],
    });
    if (!classData) {
      throw new NotFoundException(Messages.CLASS_NOT_FOUND);
    }

    const educator = classData.educator;
    if (!educator) {
      throw new NotFoundException(Messages.USER_NOT_FOUND);
    }

    if (
      educator.tokens === null ||
      educator.tokens === undefined ||
      educator.tokens < learnerMembers.length
    ) {
      throw new BadRequestException(Messages.INSUFFICIENT_TOKENS);
    }

    return this.dataSource.transaction(async (manager) => {
      let classMapping = await manager.findOne(LmsClassMapping, {
        where: { classId: dto.classId },
      });

      if (classMapping) {
        classMapping.schoolId = dto.schoolId;
        classMapping.lmsCourseId = dto.lmsCourseId;
        classMapping.lmsContextId = dto.lmsContextId ?? null;
        classMapping.nrpsUrl = dto.nrpsUrl;
      } else {
        classMapping = manager.create(LmsClassMapping, {
          schoolId: dto.schoolId,
          classId: dto.classId,
          lmsCourseId: dto.lmsCourseId,
          lmsContextId: dto.lmsContextId ?? null,
          nrpsUrl: dto.nrpsUrl,
        });
      }

      classMapping = await manager.save(classMapping);

      await manager.delete(LmsStudentMapping, { classId: dto.classId });

      const codePrefix = classData.lms_class_id ?? randomClassCode();
      if (!classData.lms_class_id) {
        classData.lms_class_id = codePrefix;
        await manager.save(Class, classData);
      }
      const mappings: LmsStudentMapping[] = [];
      const createdStudents: Student[] = [];

      for (const member of learnerMembers) {
        const provided = dto.mappings?.find((m) => m.lmsUserId === member.userId);
        const studentCode = provided?.studentCode
          ? normalizeProvidedStudentCode(provided.studentCode, member.userId)
          : generateStudentCode(codePrefix, member.userId);

        mappings.push(
          manager.create(LmsStudentMapping, {
            schoolId: dto.schoolId,
            classId: dto.classId,
            lmsUserId: member.userId,
            studentCode,
          }),
        );

        const existingStudent = await manager.findOne(Student, {
          where: {
            student_id: studentCode,
            class: { id: dto.classId },
            is_active: true,
          },
        });

        if (!existingStudent) {
          const student = manager.create(Student, {
            student_id: studentCode,
            student_name: sharePii ? (member.name ?? undefined) : undefined,
            email: sharePii ? (member.email ?? undefined) : undefined,
            status: CommonStatus.ACTIVE,
            class: classData,
            educator,
          });
          createdStudents.push(await manager.save(student));
        }
      }

      const savedMappings = await manager.save(mappings);

      const tokenBalance = educator.tokens ?? 0;
      educator.tokens = tokenBalance - learnerMembers.length;
      educator.allocated_tokens =
        educator.allocated_tokens === null
          ? learnerMembers.length
          : educator.allocated_tokens + learnerMembers.length;
      await manager.save(Educator, educator);

      classData.total_no_of_students =
        (classData.total_no_of_students ?? 0) + createdStudents.length;
      await manager.save(Class, classData);

      return {
        classMapping,
        mappings: savedMappings.map((mapping) => ({
          lmsUserId: mapping.lmsUserId,
          studentCode: mapping.studentCode,
        })),
        studentsCreated: createdStudents.length,
        storedPii: sharePii,
      };
    });
  }

  private isLearner(roles: string[]): boolean {
    const normalizedRoles = roles.map((role) => String(role).toLowerCase());

    const hasLearnerOrStudent = normalizedRoles.some(
      (role) =>
        role.includes('learner') ||
        role.includes('student') ||
        role.endsWith('#student') ||
        role.endsWith('/student') ||
        role === 'student',
    );

    const hasInstructorOrAdmin = normalizedRoles.some(
      (role) =>
        role.includes('instructor') || role.includes('administrator') || role.includes('admin'),
    );

    return hasLearnerOrStudent && !hasInstructorOrAdmin;
  }

  async getClassMapping(classId: string): Promise<LmsClassMapping> {
    const mapping = await this.classMappingRepo.findOne({ where: { classId } });
    if (!mapping) {
      throw new NotFoundException(`No LMS mapping found for class ${classId}`);
    }
    return mapping;
  }
}
