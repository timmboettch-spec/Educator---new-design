import { DataSource } from 'typeorm';
import { databseConfig } from '../../../src/database/data-source';
import { Educator, EducatorSimulationPreview } from '../../../src/database/entities';
import { EducatorSimulationPreviewRepository } from '../../../src/database/repositories/educator-simulation-preview.repository';
import { PreviewConstants } from '../../../src/common/constants';
import { CommonStatus } from '../../../src/common/enums/status.enum';

const hasDbConfig = Boolean(process.env.DB_HOST && process.env.DB_USERNAME && process.env.DB_NAME);

const describeWithDb = hasDbConfig ? describe : describe.skip;

const MAX = PreviewConstants.MAX_ALLOWANCE;
const SCENARIO_PREFIX = 'PREVIEW-TEST-';

describeWithDb('EducatorSimulationPreviewRepository.consumeIfAvailable (Integration)', () => {
  let dataSource: DataSource;
  let repo: EducatorSimulationPreviewRepository;
  let educatorId: string;
  let otherEducatorId: string;

  beforeAll(async () => {
    dataSource = new DataSource({ ...databseConfig, synchronize: false, logging: false });
    await dataSource.initialize();
    repo = new EducatorSimulationPreviewRepository(
      dataSource.getRepository(EducatorSimulationPreview),
    );

    const educatorRepo = dataSource.getRepository(Educator);
    const educator = await educatorRepo.save({
      email: 'preview-test-educator@example.com',
      full_name: 'Preview Test Educator',
      status: CommonStatus.ACTIVE,
      is_active: true,
    });
    const otherEducator = await educatorRepo.save({
      email: 'preview-test-other-educator@example.com',
      full_name: 'Preview Test Other Educator',
      status: CommonStatus.ACTIVE,
      is_active: true,
    });
    educatorId = educator.id;
    otherEducatorId = otherEducator.id;
  });

  afterEach(async () => {
    await dataSource.query(`DELETE FROM educator_simulation_previews WHERE scenario_id LIKE $1`, [
      `${SCENARIO_PREFIX}%`,
    ]);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(`DELETE FROM educator_simulation_previews WHERE scenario_id LIKE $1`, [
        `${SCENARIO_PREFIX}%`,
      ]);
      await dataSource.query(`DELETE FROM educators WHERE email LIKE 'preview-test-%@example.com'`);
      await dataSource.destroy();
    }
  });

  it('counts up to the max, then refuses without changing the stored count', async () => {
    const scenarioId = `${SCENARIO_PREFIX}sequential`;
    const results: Array<number | null> = [];
    for (let i = 0; i < MAX + 1; i++) {
      results.push(await repo.consumeIfAvailable(educatorId, scenarioId, MAX));
    }

    expect(results).toEqual([...Array.from({ length: MAX }, (_, i) => i + 1), null]);
    const row = await repo.findByEducatorAndScenario(educatorId, scenarioId);
    expect(row?.usedCount).toBe(MAX);
  });

  it('never goes past the max under concurrent calls', async () => {
    const scenarioId = `${SCENARIO_PREFIX}concurrent`;
    const results = await Promise.all(
      Array.from({ length: MAX * 2 }, () => repo.consumeIfAvailable(educatorId, scenarioId, MAX)),
    );

    const granted = results.filter((r): r is number => r !== null).sort((a, b) => a - b);
    expect(granted).toEqual(Array.from({ length: MAX }, (_, i) => i + 1));
    const row = await repo.findByEducatorAndScenario(educatorId, scenarioId);
    expect(row?.usedCount).toBe(MAX);
  });

  it('keeps a separate allowance per educator and per simulation', async () => {
    const scenarioA = `${SCENARIO_PREFIX}scoped-a`;
    const scenarioB = `${SCENARIO_PREFIX}scoped-b`;
    for (let i = 0; i < MAX; i++) {
      await repo.consumeIfAvailable(educatorId, scenarioA, MAX);
    }

    await expect(repo.consumeIfAvailable(educatorId, scenarioA, MAX)).resolves.toBeNull();
    await expect(repo.consumeIfAvailable(educatorId, scenarioB, MAX)).resolves.toBe(1);
    await expect(repo.consumeIfAvailable(otherEducatorId, scenarioA, MAX)).resolves.toBe(1);
  });

  it('ignores a soft-deleted row, so soft-deleting resets the allowance', async () => {
    const scenarioId = `${SCENARIO_PREFIX}soft-deleted`;
    for (let i = 0; i < MAX; i++) {
      await repo.consumeIfAvailable(educatorId, scenarioId, MAX);
    }
    await dataSource
      .getRepository(EducatorSimulationPreview)
      .softDelete({ educatorId, scenarioId });

    await expect(repo.consumeIfAvailable(educatorId, scenarioId, MAX)).resolves.toBe(1);
    const row = await repo.findByEducatorAndScenario(educatorId, scenarioId);
    expect(row?.usedCount).toBe(1);
  });

  it('refuses immediately when the max is below 1', async () => {
    const scenarioId = `${SCENARIO_PREFIX}zero-max`;

    await expect(repo.consumeIfAvailable(educatorId, scenarioId, 0)).resolves.toBeNull();
    await expect(repo.findByEducatorAndScenario(educatorId, scenarioId)).resolves.toBeNull();
  });
});
