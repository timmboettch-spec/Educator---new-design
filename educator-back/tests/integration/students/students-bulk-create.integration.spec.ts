import { Class, Educator, Student } from '../../../src/database/entities';
import { StudentRepository } from '../../../src/database/repositories/students.repository';
import { StudentsService } from '../../../src/students/students.service';
import { LoggerService } from '../../../src/common/services';
import { ErrorTypes } from '../../../src/common/utils/messages';

const CLASS_NAME = 'ZQB-BulkCreate-Test';
const CODE_FORMAT = /^ZQB-[A-Z0-9]{4}$/;

describe('StudentsService.bulkCreate (Integration)', () => {
  let service: StudentsService;
  let educator: Educator;
  let classData: Class;

  const studentRepo = { findAllNonEmptyStudentCodes: jest.fn(), saveMany: jest.fn() };
  const allocateSeatsForNewStudents = jest.fn();
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

  const bulkCreate = (count: number): Promise<Awaited<ReturnType<StudentsService['bulkCreate']>>> =>
    service.bulkCreate({ class_id: classData.id!, count }, classData, educator);

  beforeEach(() => {
    jest.clearAllMocks();
    educator = { id: '550e8400-e29b-41d4-a716-446655440101', is_active: true } as Educator;
    classData = {
      id: '550e8400-e29b-41d4-a716-446655440201',
      class_name: CLASS_NAME,
      is_active: true,
    } as Class;

    studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue([]);
    studentRepo.saveMany.mockImplementation((rows: Partial<Student>[]) => Promise.resolve(rows));
    allocateSeatsForNewStudents.mockResolvedValue({ success: true, data: { seatsAllocated: 0 } });

    // Only the collaborators bulkCreate touches are stubbed; the rest are never called.
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
      { allocateSeatsForNewStudents } as never,
      unused, // tokenService
      logger as unknown as LoggerService,
    );
  });

  it('reads existing codes once and saves in one call for both 10 and 50 students', async () => {
    const small = await bulkCreate(10);
    const smallCalls = {
      reads: studentRepo.findAllNonEmptyStudentCodes.mock.calls.length,
      saves: studentRepo.saveMany.mock.calls.length,
    };

    jest.clearAllMocks();
    const large = await bulkCreate(50);

    expect(small.success).toBe(true);
    expect(large.success).toBe(true);
    expect(smallCalls).toEqual({ reads: 1, saves: 1 });
    expect(studentRepo.findAllNonEmptyStudentCodes).toHaveBeenCalledTimes(1);
    expect(studentRepo.saveMany).toHaveBeenCalledTimes(1);
  });

  it('creates 50 distinct, well-formed codes carrying the class prefix', async () => {
    const { data } = await bulkCreate(50);

    const codes = data!.map((s) => s.student_id!);
    expect(codes).toHaveLength(50);
    expect(new Set(codes).size).toBe(50);
    codes.forEach((code) => expect(code).toMatch(CODE_FORMAT));
    expect(studentRepo.saveMany.mock.calls[0][0]).toHaveLength(50);
  });

  it('does not reuse a code that already exists globally', async () => {
    const taken = Array.from(
      { length: 20 },
      (_, i) => `ZQB-${i.toString(36).toUpperCase().padStart(4, '0')}`,
    );
    studentRepo.findAllNonEmptyStudentCodes.mockResolvedValue(taken);

    const { data } = await bulkCreate(30);

    const codes = data!.map((s) => s.student_id!);
    expect(codes.filter((c) => taken.includes(c))).toEqual([]);
  });

  it('blocks a bulk create that exceeds the available seats and inserts nothing', async () => {
    allocateSeatsForNewStudents.mockResolvedValue({
      success: false,
      message: 'Not enough AI seats',
      type: ErrorTypes.BAD_REQUEST,
    });

    const result = await bulkCreate(5);

    expect(result.success).toBe(false);
    expect(result.message).toBe('Not enough AI seats');
    expect(studentRepo.saveMany).not.toHaveBeenCalled();
  });

  it('returns a failure when the batched save throws', async () => {
    studentRepo.saveMany.mockRejectedValue(new Error('db down'));

    const result = await bulkCreate(3);

    expect(result).toMatchObject({ success: false, message: 'db down' });
  });
});
