import { In } from 'typeorm';
import { EducatorRepository } from 'src/database/repositories/educator.repository';
import { EducatorSchoolRepository } from 'src/database/repositories/educator-school.repository';
import { SimulationV2Repository } from 'src/database/repositories/simulation-v2.repository';

describe('SimulationV2Repository.findByBusinessIds', () => {
  const repo = { find: jest.fn().mockResolvedValue([{ id: 'sim-1' }]) };
  const simulationRepo = new SimulationV2Repository(repo as never);

  afterEach(() => jest.clearAllMocks());

  it('loads every requested business id in one query', async () => {
    await expect(simulationRepo.findByBusinessIds(['sim-1', 'sim-2'])).resolves.toEqual([
      { id: 'sim-1' },
    ]);
    expect(repo.find).toHaveBeenCalledWith({ where: { id: In(['sim-1', 'sim-2']) } });
  });

  it('skips the query for an empty list', async () => {
    await expect(simulationRepo.findByBusinessIds([])).resolves.toEqual([]);
    expect(repo.find).not.toHaveBeenCalled();
  });
});

describe('EducatorRepository.findActiveTokenBalance', () => {
  const repo = { findOne: jest.fn() };
  const educatorRepo = new EducatorRepository(repo as never);

  afterEach(() => jest.clearAllMocks());

  it('returns the balance of an active educator', async () => {
    repo.findOne.mockResolvedValue({ id: 'edu-1', tokens: 42 });
    await expect(educatorRepo.findActiveTokenBalance('edu-1')).resolves.toBe(42);
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'edu-1', is_active: true },
      select: { id: true, tokens: true },
    });
  });

  it('treats a null balance as zero', async () => {
    repo.findOne.mockResolvedValue({ id: 'edu-1', tokens: null });
    await expect(educatorRepo.findActiveTokenBalance('edu-1')).resolves.toBe(0);
  });

  it('returns null when there is no active educator', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(educatorRepo.findActiveTokenBalance('edu-1')).resolves.toBeNull();
  });
});

describe('EducatorSchoolRepository.isEducatorAssignedToSchool', () => {
  it('checks the educator/school link', async () => {
    const repo = { exists: jest.fn().mockResolvedValue(true) };
    const educatorSchoolRepo = new EducatorSchoolRepository(repo as never);

    await expect(educatorSchoolRepo.isEducatorAssignedToSchool('edu-1', 'school-1')).resolves.toBe(
      true,
    );
    expect(repo.exists).toHaveBeenCalledWith({
      where: { educator: { id: 'edu-1' }, school: { id: 'school-1' } },
    });
  });
});
