import { DataSource } from 'typeorm';
import { ClassesService } from '../../../src/class/classes.service';
import { ClassDto } from '../../../src/class/dto/classes.dto';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { Class, Educator, LmsClassMapping, Student } from '../../../src/database/entities';
import { ClassRepository } from '../../../src/database/repositories/class.repository';
import { LmsClassMappingRepository } from '../../../src/database/repositories/lms-class-mapping.repository';
import { LmsStudentMappingRepository } from '../../../src/database/repositories/lms-student-mapping.repository';
import { StudentRepository } from '../../../src/database/repositories/students.repository';
import { CreateStudentDto } from '../../../src/students/dto/students.dto';

const CLASS_NAME = 'ZQB-LmsRoster-Test';
const CLASS_ID = '550e8400-e29b-41d4-a716-446655440201';
const SCHOOL_ID = '550e8400-e29b-41d4-a716-446655440202';
const EDUCATOR_ID = '550e8400-e29b-41d4-a716-446655440101';
const LMS_COURSE_ID = 'course-1';

type MappingRow = { lmsUserId: string; studentCode: string };

describe('ClassesService LMS roster mappings (Integration)', () => {
  let service: ClassesService;
  let educator: Educator;

  const classRepo = { create: jest.fn(), findOne: jest.fn() };
  const studentRepo = {
    findAllNonEmptyStudentCodes: jest.fn(),
    findExistingStudentCodes: jest.fn(),
    find: jest.fn(),
    saveMany: jest.fn(),
  };
  const lmsClassMappingRepo = { findOne: jest.fn(), create: jest.fn(), delete: jest.fn() };
  const lmsStudentMappingRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    insertManyIgnoreConflicts: jest.fn(),
  };
  // `releaseStaleLmsCourseLink` runs a fluent update through `manager.createQueryBuilder()`.
  const updateBuilder: Record<string, jest.Mock> = {};
  for (const method of ['update', 'set', 'where', 'andWhere']) {
    updateBuilder[method] = jest.fn().mockReturnValue(updateBuilder);
  }
  updateBuilder.execute = jest.fn().mockResolvedValue({ affected: 0 });
  const dataSource = {
    manager: { createQueryBuilder: jest.fn().mockReturnValue(updateBuilder) },
    query: jest.fn(),
    transaction: jest.fn(),
  };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

  const roster = (count: number, from = 0): CreateStudentDto[] =>
    Array.from({ length: count }, (_, i) => ({ student_id: String(1000 + from + i) })) as never;

  const dto = (): ClassDto =>
    ({
      class_name: CLASS_NAME,
      lmsCourseId: LMS_COURSE_ID,
      school_id: SCHOOL_ID,
      start_date: '2026-01-01',
      end_date: '2026-12-31',
    }) as ClassDto;

  const makeClass = (o: Partial<Class> = {}): Class =>
    ({
      id: CLASS_ID,
      class_name: CLASS_NAME,
      lms_class_id: 'ABCD1234',
      is_active: true,
      educator,
      school: { id: SCHOOL_ID },
      ...o,
    }) as Class;

  /** Rows handed to `insertManyIgnoreConflicts`, one array per call. */
  const insertedBatches = (): MappingRow[][] =>
    lmsStudentMappingRepo.insertManyIgnoreConflicts.mock.calls.map(
      ([rows]) => rows as MappingRow[],
    );

  beforeEach(() => {
    jest.clearAllMocks();
    educator = { id: EDUCATOR_ID, is_active: true, school: { id: SCHOOL_ID } } as Educator;

    // Fresh create path: no stale link, no existing mapping, class row is created then re-read.
    lmsClassMappingRepo.findOne.mockResolvedValue(null);
    classRepo.create.mockImplementation((data: Partial<Class>) =>
      Promise.resolve({ ...data, id: CLASS_ID }),
    );
    classRepo.findOne.mockResolvedValue(makeClass());
    studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue([]);
    studentRepo.findExistingStudentCodes.mockResolvedValue([]);
    studentRepo.find.mockResolvedValue([]);
    studentRepo.saveMany.mockImplementation((rows: Partial<Student>[]) => Promise.resolve(rows));
    lmsClassMappingRepo.create.mockResolvedValue({} as LmsClassMapping);
    lmsStudentMappingRepo.insertManyIgnoreConflicts.mockResolvedValue(undefined);

    const unused = {} as never;
    service = new ClassesService(
      unused, // classSimulationService
      classRepo as unknown as ClassRepository,
      unused, // classEducatorRepo
      studentRepo as unknown as StudentRepository,
      unused, // educatorRepo
      unused, // educatorSchoolRepo
      unused, // googleCourseMappingRepo
      unused, // googleStudentMappingRepo
      lmsClassMappingRepo as unknown as LmsClassMappingRepository,
      lmsStudentMappingRepo as unknown as LmsStudentMappingRepository,
      unused, // simulationReportRepo
      dataSource as unknown as DataSource,
      unused, // lmsProvisionService
      unused, // lmsConfigService
      unused, // lmsAssignmentService
      logger as never,
    );
  });

  describe('create — new class from an LMS roster', () => {
    it('writes one mapping per student in a single batched insert', async () => {
      const result = await service.create(dto(), educator, roster(5));

      expect(result.success).toBe(true);
      expect(lmsStudentMappingRepo.insertManyIgnoreConflicts).toHaveBeenCalledTimes(1);
      const [batch] = insertedBatches();
      expect(batch).toHaveLength(5);
      expect(batch.map((r) => r.lmsUserId)).toEqual(['1000', '1001', '1002', '1003', '1004']);
      expect(new Set(batch.map((r) => r.studentCode)).size).toBe(5);
    });

    it('does not look up or insert mappings one student at a time', async () => {
      await service.create(dto(), educator, roster(10));

      expect(lmsStudentMappingRepo.findOne).not.toHaveBeenCalled();
      expect(lmsStudentMappingRepo.create).not.toHaveBeenCalled();
    });

    it('issues the same number of repository calls for 10 and 50 LMS students', async () => {
      const callCount = (): number =>
        [lmsStudentMappingRepo, studentRepo, classRepo, lmsClassMappingRepo].reduce(
          (sum, repo) =>
            sum +
            Object.values(repo).reduce(
              (inner, fn) => inner + (jest.isMockFunction(fn) ? fn.mock.calls.length : 0),
              0,
            ),
          0,
        );

      await service.create(dto(), educator, roster(10));
      const small = callCount();

      jest.clearAllMocks();
      await service.create(dto(), educator, roster(50, 100));
      const large = callCount();

      expect(large).toBe(small);
    });

    it('skips mapping rows for ids that already look like a student code', async () => {
      await service.create(dto(), educator, [
        { student_id: '2001' },
        { student_id: 'ABCD1234-77' },
      ] as never);

      const [batch] = insertedBatches();
      expect(batch.map((r) => r.lmsUserId)).toEqual(['2001']);
    });
  });

  describe('create — re-sync of an already linked class', () => {
    const existingStudent = (studentId: string): Partial<Student> => ({
      student_id: studentId,
      is_active: true,
    });

    beforeEach(() => {
      lmsClassMappingRepo.findOne.mockResolvedValue({
        id: 'map-1',
        classId: CLASS_ID,
        lmsCourseId: LMS_COURSE_ID,
        schoolId: SCHOOL_ID,
      });
      classRepo.findOne.mockResolvedValue(makeClass());
      studentRepo.find.mockResolvedValue([existingStudent('ABCD1234-1000')]);
    });

    it('maps the full roster in one batched insert, leaving duplicates to the DB indexes', async () => {
      const result = await service.create(dto(), educator, roster(8));

      expect(result.success).toBe(true);
      expect(studentRepo.saveMany).toHaveBeenCalledTimes(1);
      // Only the 7 students not already on the class are new.
      expect((studentRepo.saveMany.mock.calls[0][0] as unknown[]).length).toBe(7);
      expect(lmsStudentMappingRepo.insertManyIgnoreConflicts).toHaveBeenCalledTimes(1);
      expect(insertedBatches()[0]).toHaveLength(8);
      expect(lmsStudentMappingRepo.findOne).not.toHaveBeenCalled();
      expect(lmsStudentMappingRepo.create).not.toHaveBeenCalled();
    });

    it('writes no mappings when the roster adds no new students', async () => {
      const result = await service.create(dto(), educator, roster(1));

      expect(result.success).toBe(true);
      expect(studentRepo.saveMany).not.toHaveBeenCalled();
      expect(lmsStudentMappingRepo.insertManyIgnoreConflicts).not.toHaveBeenCalled();
    });

    it('issues the same number of mapping calls for 10 and 50 new students', async () => {
      studentRepo.find.mockResolvedValue([]);
      await service.create(dto(), educator, roster(10));
      const small = lmsStudentMappingRepo.insertManyIgnoreConflicts.mock.calls.length;

      lmsStudentMappingRepo.insertManyIgnoreConflicts.mockClear();
      await service.create(dto(), educator, roster(50, 100));
      const large = lmsStudentMappingRepo.insertManyIgnoreConflicts.mock.calls.length;

      expect(small).toBe(1);
      expect(large).toBe(small);
    });

    it('marks new students active', async () => {
      studentRepo.find.mockResolvedValue([]);
      await service.create(dto(), educator, roster(2));

      const saved = studentRepo.saveMany.mock.calls[0][0] as Partial<Student>[];
      expect(saved.every((s) => s.status === CommonStatus.ACTIVE)).toBe(true);
    });
  });

  describe('re-running a sync against the same class', () => {
    // Stateful stand-ins for the student and lms_student_mapping tables; the mapping store
    // applies the same ON CONFLICT DO NOTHING rule as the two unique indexes.
    let studentRows: Partial<Student>[];
    let mappingRows: MappingRow[];

    beforeEach(() => {
      studentRows = [];
      mappingRows = [];
      lmsClassMappingRepo.findOne.mockResolvedValue({
        id: 'map-1',
        classId: CLASS_ID,
        lmsCourseId: LMS_COURSE_ID,
        schoolId: SCHOOL_ID,
      });
      classRepo.findOne.mockImplementation(() => Promise.resolve(makeClass()));
      studentRepo.find.mockImplementation(() => Promise.resolve([...studentRows]));
      studentRepo.findAllNonEmptyStudentCodes.mockImplementation(() =>
        Promise.resolve(studentRows.map((s) => s.student_id)),
      );
      studentRepo.saveMany.mockImplementation((rows: Partial<Student>[]) => {
        studentRows.push(...rows);
        return Promise.resolve(rows);
      });
      lmsStudentMappingRepo.insertManyIgnoreConflicts.mockImplementation((rows: MappingRow[]) => {
        for (const row of rows) {
          const clash = mappingRows.some(
            (m) => m.lmsUserId === row.lmsUserId || m.studentCode === row.studentCode,
          );
          if (!clash) mappingRows.push(row);
        }
        return Promise.resolve();
      });
    });

    it('creates no duplicate students or mappings and keeps total_no_of_students correct', async () => {
      await service.create(dto(), educator, roster(5));
      await service.create(dto(), educator, roster(5));

      expect(studentRows).toHaveLength(5);
      expect(new Set(studentRows.map((s) => s.student_id)).size).toBe(5);
      expect(mappingRows).toHaveLength(5);
      expect(new Set(mappingRows.map((m) => m.lmsUserId)).size).toBe(5);

      const lastSavedClass = classRepo.create.mock.calls.at(-1)![0] as Partial<Class>;
      expect(lastSavedClass.total_no_of_students).toBe(5);
    });

    it('adds only the new roster members on a later sync', async () => {
      await service.create(dto(), educator, roster(5));
      await service.create(dto(), educator, roster(8));

      expect(studentRows).toHaveLength(8);
      expect(mappingRows).toHaveLength(8);
      const lastSavedClass = classRepo.create.mock.calls.at(-1)![0] as Partial<Class>;
      expect(lastSavedClass.total_no_of_students).toBe(8);
    });
  });
});
