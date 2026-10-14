import { SimulationReportRepository } from '../../../src/database/repositories/simulation-report.repository';

const STUDENT_ID = '33333333-3333-4333-8333-333333333331';
const OTHER_STUDENT_ID = '33333333-3333-4333-8333-333333333332';
const EMPTY_STUDENT_ID = '33333333-3333-4333-8333-333333333333';
const RETAKE_ID = '44444444-4444-4444-8444-444444444441';
const JSON_ONLY_ID = '44444444-4444-4444-8444-444444444442';
const FIRST_ID = '44444444-4444-4444-8444-444444444443';
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';
const SCENARIO_A = 'scenario-a';
const SCENARIO_B = 'scenario-b';

const OWNED_SCORE_SELECT = ['id', 'studentId', 'scenarioId', 'mode', 'score', 'scoreJson'];

type FindOptions = {
  select: string[];
  where: Record<string, unknown>;
  order?: Record<string, string>;
  withDeleted?: boolean;
};

/**
 * Grade-passback score reads and the student+Simulation detail read on
 * `SimulationReportRepository`, with the TypeORM `Repository` mocked: the tests assert the
 * `find`/`findOne` options each read sends and that the mocked rows are returned unchanged.
 */
describe('Report score and detail reads (Integration, mocked repository)', () => {
  let repo: { find: jest.Mock; findOne: jest.Mock };
  let repository: SimulationReportRepository;

  const findOneCalls = (): FindOptions[] =>
    repo.findOne.mock.calls.map(([options]) => options as FindOptions);

  beforeEach(() => {
    repo = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) };
    repository = new SimulationReportRepository(repo as never);
  });

  describe('findOwnedScoreRowByIdOrReportId', () => {
    it('finds a row by its uuid with only the owner, scenario, mode and score columns', async () => {
      const stored = {
        id: RETAKE_ID,
        studentId: STUDENT_ID,
        scenarioId: SCENARIO_A,
        mode: 'Assessment',
        score: 95,
        scoreJson: null,
      };
      repo.findOne.mockResolvedValueOnce(stored);

      const row = await repository.findOwnedScoreRowByIdOrReportId(RETAKE_ID);

      expect(row).toBe(stored);
      expect(findOneCalls()).toEqual([{ select: OWNED_SCORE_SELECT, where: { id: RETAKE_ID } }]);
      for (const column of ['reportData', 'summary', 'transcriptId']) {
        expect(findOneCalls()[0].select).not.toContain(column);
      }
    });

    it('falls back to the legacy report id when the value is not a uuid', async () => {
      repo.findOne.mockResolvedValueOnce({ id: FIRST_ID, score: 60 });

      const row = await repository.findOwnedScoreRowByIdOrReportId('report-first');

      expect(row?.id).toBe(FIRST_ID);
      expect(row?.score).toBe(60);
      expect(findOneCalls()).toEqual([
        { select: OWNED_SCORE_SELECT, where: { reportId: 'report-first' } },
      ]);
    });

    it('returns the score_json for rows with no score column value', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: JSON_ONLY_ID,
        score: null,
        scoreJson: { overallScore: 88 },
      });

      const row = await repository.findOwnedScoreRowByIdOrReportId(JSON_ONLY_ID);

      expect(row?.score).toBeNull();
      expect(row?.scoreJson).toEqual({ overallScore: 88 });
    });

    it('returns null for an unknown uuid or report id', async () => {
      await expect(repository.findOwnedScoreRowByIdOrReportId(UNKNOWN_UUID)).resolves.toBeNull();
      await expect(
        repository.findOwnedScoreRowByIdOrReportId('report-missing'),
      ).resolves.toBeNull();

      // An unknown uuid is also tried as a legacy report id before giving up.
      expect(findOneCalls().map((options) => options.where)).toEqual([
        { id: UNKNOWN_UUID },
        { reportId: UNKNOWN_UUID },
        { reportId: 'report-missing' },
      ]);
    });

    it('returns a soft-deleted row as missing', async () => {
      // TypeORM's `findOne` drops soft-deleted rows unless `withDeleted` is set; the read must not
      // set it. (That TypeORM honours `deleted_at` itself needs a real database.)
      await expect(repository.findOwnedScoreRowByIdOrReportId(RETAKE_ID)).resolves.toBeNull();

      for (const options of findOneCalls()) expect(options.withDeleted).toBeUndefined();
    });
  });

  describe('findScoreRowsByStudentAndScenario', () => {
    it("returns the mode and score of every Attempt at the student's scenario", async () => {
      const stored = [
        { mode: 'Assessment', score: 60, scoreJson: null },
        { mode: 'Assessment', score: 95, scoreJson: null },
        { mode: 'Practice', score: 100, scoreJson: null },
        { mode: 'Assessment', score: null, scoreJson: { overallScore: 88 } },
      ];
      repo.find.mockResolvedValueOnce(stored);

      const rows = await repository.findScoreRowsByStudentAndScenario(STUDENT_ID, SCENARIO_A);

      expect(rows).toBe(stored);
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { studentId: STUDENT_ID, scenarioId: SCENARIO_A } }),
      );
    });

    it('selects only mode, score and score_json', async () => {
      await repository.findScoreRowsByStudentAndScenario(STUDENT_ID, SCENARIO_B);

      const [options] = repo.find.mock.calls[0] as [FindOptions];
      expect([...options.select].sort()).toEqual(['mode', 'score', 'scoreJson']);
    });

    it("excludes other students' and other scenarios' Attempts", async () => {
      repo.find.mockResolvedValueOnce([{ mode: 'Assessment', score: 77, scoreJson: null }]);

      const rows = await repository.findScoreRowsByStudentAndScenario(OTHER_STUDENT_ID, SCENARIO_A);

      expect(rows).toHaveLength(1);
      expect(rows[0].score).toBe(77);
      const [options] = repo.find.mock.calls[0] as [FindOptions];
      expect(options.where).toEqual({ studentId: OTHER_STUDENT_ID, scenarioId: SCENARIO_A });
    });

    it('returns nothing for a student with no Attempts', async () => {
      await expect(
        repository.findScoreRowsByStudentAndScenario(EMPTY_STUDENT_ID, SCENARIO_A),
      ).resolves.toEqual([]);
    });
  });

  describe('findReportDetailRowByStudentAndScenario', () => {
    it('returns the Report (earliest Attempt), never a retake', async () => {
      const first = {
        id: FIRST_ID,
        studentId: STUDENT_ID,
        score: 60,
        scenarioTitle: 'title-first',
      };
      repo.findOne.mockResolvedValueOnce(first);

      const row = await repository.findReportDetailRowByStudentAndScenario(STUDENT_ID, SCENARIO_A);

      expect(row).toBe(first);
      const [options] = findOneCalls();
      expect(options.where).toEqual({ studentId: STUDENT_ID, scenarioId: SCENARIO_A });
      expect(options.order).toEqual({ createdAt: 'ASC', id: 'ASC' });
    });

    it('never selects report_data', async () => {
      await repository.findReportDetailRowByStudentAndScenario(STUDENT_ID, SCENARIO_B);

      const [options] = findOneCalls();
      expect(options.select).toEqual(
        expect.arrayContaining(['id', 'studentId', 'scenarioTitle', 'score', 'summary']),
      );
      expect(options.select).not.toContain('reportData');
    });

    it("does not return another student's Attempt", async () => {
      const row = await repository.findReportDetailRowByStudentAndScenario(
        OTHER_STUDENT_ID,
        SCENARIO_B,
      );

      expect(row).toBeNull();
      expect(findOneCalls()[0].where).toEqual({
        studentId: OTHER_STUDENT_ID,
        scenarioId: SCENARIO_B,
      });
    });

    it('returns null when the student has no Attempt at the scenario', async () => {
      await expect(
        repository.findReportDetailRowByStudentAndScenario(EMPTY_STUDENT_ID, SCENARIO_A),
      ).resolves.toBeNull();
    });
  });
});
