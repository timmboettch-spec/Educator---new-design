import { Repository } from 'typeorm';
import { LmsStudentMapping } from '../../../src/database/entities';
import { LmsStudentMappingRepository } from '../../../src/database/repositories/lms-student-mapping.repository';

describe('LmsStudentMappingRepository.insertManyIgnoreConflicts (Integration)', () => {
  const schoolId = '550e8400-e29b-41d4-a716-446655440202';
  const classId = '550e8400-e29b-41d4-a716-446655440201';

  const queryBuilder = {
    insert: jest.fn(),
    into: jest.fn(),
    values: jest.fn(),
    orIgnore: jest.fn(),
    execute: jest.fn(),
  };
  const typeormRepo = { createQueryBuilder: jest.fn() };
  let repo: LmsStudentMappingRepository;

  const row = (lmsUserId: string, studentCode: string): Partial<LmsStudentMapping> => ({
    schoolId,
    classId,
    lmsUserId,
    studentCode,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    queryBuilder.insert.mockReturnValue(queryBuilder);
    queryBuilder.into.mockReturnValue(queryBuilder);
    queryBuilder.values.mockReturnValue(queryBuilder);
    queryBuilder.orIgnore.mockReturnValue(queryBuilder);
    queryBuilder.execute.mockResolvedValue({ identifiers: [], generatedMaps: [], raw: [] });
    typeormRepo.createQueryBuilder.mockReturnValue(queryBuilder);

    repo = new LmsStudentMappingRepository(
      typeormRepo as unknown as Repository<LmsStudentMapping>,
    );
  });

  it('is a no-op for an empty array', async () => {
    await expect(repo.insertManyIgnoreConflicts([])).resolves.toBeUndefined();

    expect(typeormRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(queryBuilder.execute).not.toHaveBeenCalled();
  });

  it('inserts all rows in one call', async () => {
    const rows = [row('u1', 'S1'), row('u2', 'S2'), row('u3', 'S3')];

    await repo.insertManyIgnoreConflicts(rows);

    expect(typeormRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(queryBuilder.into).toHaveBeenCalledWith(LmsStudentMapping);
    expect(queryBuilder.values).toHaveBeenCalledWith(rows);
    expect(queryBuilder.execute).toHaveBeenCalledTimes(1);
  });

  it('ignores conflicts (ON CONFLICT DO NOTHING) instead of throwing on duplicate rows', async () => {
    await repo.insertManyIgnoreConflicts([row('u1', 'S9'), row('u9', 'S1')]);

    expect(queryBuilder.orIgnore).toHaveBeenCalledTimes(1);
    // orIgnore must be applied before the statement is executed.
    expect(queryBuilder.orIgnore.mock.invocationCallOrder[0]).toBeLessThan(
      queryBuilder.execute.mock.invocationCallOrder[0],
    );
  });

  it('propagates database errors from execute', async () => {
    queryBuilder.execute.mockRejectedValue(new Error('connection lost'));

    await expect(repo.insertManyIgnoreConflicts([row('u1', 'S1')])).rejects.toThrow(
      'connection lost',
    );
  });
});
