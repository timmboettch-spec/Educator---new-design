import { Class, Educator, Student } from '../../../src/database/entities';
import { StudentRepository } from '../../../src/database/repositories/students.repository';
import { StudentsService } from '../../../src/students/students.service';
import { StudentConstants } from '../../../src/students/students.constants';
import { LoggerService } from '../../../src/common/services';

describe('StudentsService.importFromCsv (Integration)', () => {
  let service: StudentsService;
  let educator: Educator;
  let classData: Class;

  const studentRepo = {
    findActiveCodesInClass: jest.fn(),
    saveMany: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
  };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

  const buildCsv = (rows: number, prefix = 'CSV'): Buffer => {
    const lines = ['student_id,student_name,email'];
    for (let i = 0; i < rows; i++) {
      lines.push(`${prefix}${i},Student ${i},s${i}@example.com`);
    }
    return Buffer.from(lines.join('\n'), 'utf-8');
  };

  const importCsv = (
    buffer: Buffer,
  ): Promise<Awaited<ReturnType<StudentsService['importFromCsv']>>> =>
    service.importFromCsv(buffer, classData, educator);

  const savedRows = (): Partial<Student>[] =>
    studentRepo.saveMany.mock.calls.flatMap(([rows]) => rows as Partial<Student>[]);

  beforeEach(() => {
    jest.clearAllMocks();
    educator = { id: '550e8400-e29b-41d4-a716-446655440101', is_active: true } as Educator;
    classData = {
      id: '550e8400-e29b-41d4-a716-446655440201',
      class_name: 'ZQB-CsvImport-Test',
      is_active: true,
    } as Class;

    studentRepo.findActiveCodesInClass.mockResolvedValue([]);
    studentRepo.saveMany.mockImplementation((rows: Partial<Student>[]) => Promise.resolve(rows));

    const unused = {} as never;
    service = new StudentsService(
      studentRepo as unknown as StudentRepository,
      unused, // classRepo
      unused, // userRepo
      unused, // educatorRepo
      unused, // classSimulationRepo
      unused, // simulationReportRepo
      unused, // simulationV2Repository
      unused, // simulationProgressRepo
      unused, // mailerService
      unused, // automationAccess
      unused, // seat allocation
      unused, // tokenService
      logger as unknown as LoggerService,
    );
  });

  it('makes the same repository calls for 10 and 50 rows', async () => {
    const small = await importCsv(buildCsv(10, 'SMALL'));
    const smallCalls = [
      studentRepo.findActiveCodesInClass.mock.calls.length,
      studentRepo.saveMany.mock.calls.length,
    ];

    jest.clearAllMocks();
    const large = await importCsv(buildCsv(50, 'LARGE'));
    const largeCalls = [
      studentRepo.findActiveCodesInClass.mock.calls.length,
      studentRepo.saveMany.mock.calls.length,
    ];

    expect(small.data?.inserted).toBe(10);
    expect(large.data?.inserted).toBe(50);
    expect(largeCalls).toEqual(smallCalls);
  });

  it('imports 200 rows with one existence read, one save and no per-row calls', async () => {
    const result = await importCsv(buildCsv(200));

    expect(result.data).toMatchObject({ total: 200, inserted: 200, failedCount: 0, failed: [] });
    expect(studentRepo.findActiveCodesInClass).toHaveBeenCalledTimes(1);
    expect(studentRepo.saveMany).toHaveBeenCalledTimes(1);
    expect(savedRows()).toHaveLength(200);
    expect(studentRepo.findOne).not.toHaveBeenCalled();
    expect(studentRepo.create).not.toHaveBeenCalled();
  });

  it('reports valid, missing-data, in-file-duplicate and already-existing rows and persists only the valid ones', async () => {
    studentRepo.findActiveCodesInClass.mockResolvedValue(['EXISTING']);
    const csv = [
      'student_id,student_name,email',
      'GOOD1,Good One,g1@example.com',
      ',No Id,',
      'GOOD2,,',
      'GOOD1,Duplicate In File,',
      'EXISTING,Already Here Again,',
      'GOOD3,Good Three,',
    ].join('\n');

    const result = await importCsv(Buffer.from(csv, 'utf-8'));

    expect(result.success).toBe(true);
    expect(result.message).toBe('2 student(s) imported successfully');
    expect(result.data).toMatchObject({ total: 6, inserted: 2, failedCount: 4 });
    expect(result.data!.failed.map((f) => f.error)).toEqual([
      StudentConstants.VALIDATION.MISSING_DATA,
      StudentConstants.VALIDATION.MISSING_DATA,
      StudentConstants.VALIDATION.DUPLICATE_ID,
      StudentConstants.VALIDATION.STUDENT_EXISTS,
    ]);
    expect(savedRows().map((r) => r.student_id)).toEqual(['GOOD1', 'GOOD3']);
  });

  it('checks existence only for rows that passed validation', async () => {
    await importCsv(
      Buffer.from('student_id,student_name\nA1,One\n,Missing\nA1,Dup\nB2,Two', 'utf-8'),
    );

    expect(studentRepo.findActiveCodesInClass).toHaveBeenCalledWith(classData.id, ['A1', 'B2']);
  });

  it('does not write when every row fails validation', async () => {
    const result = await importCsv(Buffer.from('student_id,student_name\n,No Id\nX,', 'utf-8'));

    expect(result.data).toMatchObject({ inserted: 0, failedCount: 2 });
    expect(studentRepo.saveMany).not.toHaveBeenCalled();
  });

  it('fails the whole request instead of reporting per-row errors when the batched save throws', async () => {
    studentRepo.saveMany.mockRejectedValueOnce(new Error('connection reset'));

    const result = await importCsv(buildCsv(5));

    expect(result.success).toBe(false);
    expect(result.message).toBe('connection reset');
    expect(result.data).toBeUndefined();
    expect(studentRepo.saveMany).toHaveBeenCalledTimes(1);
  });
});
