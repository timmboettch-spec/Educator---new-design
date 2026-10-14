import { LmsGradeSyncLogRepository } from '../../../src/database/repositories/lms-grade-sync-log.repository';

describe('LmsGradeSyncLogRepository.findLastSuccessfulScore', () => {
  const findOne = jest.fn();
  const repo = {
    findOne,
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const service = new LmsGradeSyncLogRepository(repo as never);

  beforeEach(() => {
    findOne.mockReset();
  });

  it('returns null when no successful sync exists', async () => {
    findOne.mockResolvedValue(null);
    await expect(service.findLastSuccessfulScore('map-1', 'student-1')).resolves.toBeNull();
    expect(findOne).toHaveBeenCalledWith({
      where: { mappingId: 'map-1', studentId: 'student-1', status: 'sent' },
      order: { attemptedAt: 'DESC' },
    });
  });

  it('returns the numeric score from the newest successful sync', async () => {
    findOne.mockResolvedValue({ scoreGiven: '91.5' });
    await expect(service.findLastSuccessfulScore('map-1', 'student-1')).resolves.toBe(91.5);
  });

  it('returns null when stored score is not finite', async () => {
    findOne.mockResolvedValue({ scoreGiven: 'not-a-number' });
    await expect(service.findLastSuccessfulScore('map-1', 'student-1')).resolves.toBeNull();
  });
});
