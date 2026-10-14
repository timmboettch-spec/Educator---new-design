import { LmsLookupService } from '../../../src/lms/services/lms-lookup.service';

describe('LmsLookupService.resolveStudentCodeForLaunch', () => {
  const SCHOOL_A = '11111111-1111-1111-1111-111111111111';
  const SCHOOL_B = '22222222-2222-2222-2222-222222222222';

  function buildService(overrides: Partial<LmsLookupService> = {}): LmsLookupService {
    return Object.assign(
      new LmsLookupService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      ),
      {
        findStudentCodeByLmsClassAndUserId: jest.fn(),
        ensureMappedStudentAccount: jest.fn(),
        findStudentByConstructedCode: jest.fn(),
        findStudentCodeByLmsUserIdInSchool: jest.fn(),
        findStudentCodeByLmsUserIdGlobally: jest.fn(),
        ...overrides,
      },
    );
  }

  it('returns course-scoped match from second school when first school has class but no student', async () => {
    const findStudentCodeByLmsClassAndUserId = jest
      .fn()
      .mockResolvedValueOnce({ studentCode: null, classFound: true })
      .mockResolvedValueOnce({ studentCode: 'CODE-B', classFound: true });

    const service = buildService({ findStudentCodeByLmsClassAndUserId });

    const result = await service.resolveStudentCodeForLaunch({
      lmsUserId: '42',
      launchCourseIds: ['12'],
      schoolIds: [SCHOOL_A, SCHOOL_B],
    });

    expect(result).toEqual({
      schoolId: SCHOOL_B,
      studentCode: 'CODE-B',
      courseScopedClassFound: true,
      classId: null,
    });
    expect(findStudentCodeByLmsClassAndUserId).toHaveBeenNthCalledWith(1, '42', '12', SCHOOL_A);
    expect(findStudentCodeByLmsClassAndUserId).toHaveBeenNthCalledWith(2, '42', '12', SCHOOL_B);
  });

  it('falls back to school-wide lookup when course context is missing', async () => {
    const ensureMappedStudentAccount = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('CODE-B');

    const service = buildService({ ensureMappedStudentAccount });

    const result = await service.resolveStudentCodeForLaunch({
      lmsUserId: '42',
      launchCourseIds: [],
      schoolIds: [SCHOOL_A, SCHOOL_B],
    });

    expect(result).toEqual({
      schoolId: SCHOOL_B,
      studentCode: 'CODE-B',
      courseScopedClassFound: false,
      classId: null,
    });
  });

  it('does not use global student lookup during multi-school resolution', async () => {
    const findStudentCodeByLmsUserIdGlobally = jest.fn();
    const findStudentCodeByLmsClassAndUserId = jest
      .fn()
      .mockResolvedValue({ studentCode: null, classFound: false });
    const ensureMappedStudentAccount = jest.fn().mockResolvedValue(null);
    const findStudentByConstructedCode = jest.fn().mockResolvedValue(null);
    const findStudentCodeByLmsUserIdInSchool = jest.fn().mockResolvedValue(null);

    const service = buildService({
      findStudentCodeByLmsClassAndUserId,
      ensureMappedStudentAccount,
      findStudentByConstructedCode,
      findStudentCodeByLmsUserIdInSchool,
      findStudentCodeByLmsUserIdGlobally,
    });

    const result = await service.resolveStudentCodeForLaunch({
      lmsUserId: '42',
      launchCourseIds: [],
      schoolIds: [SCHOOL_A, SCHOOL_B],
    });

    expect(result).toEqual({
      schoolId: null,
      studentCode: null,
      courseScopedClassFound: false,
      classId: null,
    });
    expect(findStudentCodeByLmsUserIdGlobally).not.toHaveBeenCalled();
  });
});
