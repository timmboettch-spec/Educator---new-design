import { findAccessibleClassForEducator } from 'src/common/utils/class-access.util';
import { Class } from 'src/database/entities';
import { ClassRepository } from 'src/database/repositories/class.repository';
import { EducatorSchoolRepository } from 'src/database/repositories/educator-school.repository';

describe('findAccessibleClassForEducator', () => {
  const classRepo = { findActiveByIdWithSchoolForEducator: jest.fn() };
  const educatorSchoolRepo = { findOne: jest.fn() };
  const run = (schoolId?: string): Promise<Class | null> =>
    findAccessibleClassForEducator(
      classRepo as unknown as ClassRepository,
      educatorSchoolRepo as unknown as EducatorSchoolRepository,
      'class-1',
      'edu-1',
      schoolId,
    );
  const schooled = (isActive = true): Class =>
    ({ id: 'class-1', school_id: 'school-1', school: { is_active: isActive } }) as Class;

  afterEach(() => jest.clearAllMocks());

  it('returns null when the class is not active/owned/co-instructed', async () => {
    classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(null);
    expect(await run()).toBeNull();
    expect(classRepo.findActiveByIdWithSchoolForEducator).toHaveBeenCalledWith('class-1', 'edu-1');
  });

  it('returns a class without a school without checking school assignment', async () => {
    const cls = { id: 'class-1' } as Class;
    classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(cls);
    expect(await run()).toBe(cls);
    expect(educatorSchoolRepo.findOne).not.toHaveBeenCalled();
  });

  it('returns null when the class school is inactive', async () => {
    classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(schooled(false));
    expect(await run()).toBeNull();
    expect(educatorSchoolRepo.findOne).not.toHaveBeenCalled();
  });

  it('returns null when a supplied schoolId does not match', async () => {
    classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(schooled());
    expect(await run('school-2')).toBeNull();
    expect(educatorSchoolRepo.findOne).not.toHaveBeenCalled();
  });

  it('returns null when the educator is no longer assigned to the school', async () => {
    classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(schooled());
    educatorSchoolRepo.findOne.mockResolvedValue(null);
    expect(await run()).toBeNull();
  });

  it('returns the class when the educator is assigned to its active school', async () => {
    const cls = schooled();
    classRepo.findActiveByIdWithSchoolForEducator.mockResolvedValue(cls);
    educatorSchoolRepo.findOne.mockResolvedValue({ id: 'es-1' });
    expect(await run('school-1')).toBe(cls);
    expect(educatorSchoolRepo.findOne).toHaveBeenCalledWith({
      where: { educator: { id: 'edu-1' }, school: { id: 'school-1' } },
    });
  });
});
