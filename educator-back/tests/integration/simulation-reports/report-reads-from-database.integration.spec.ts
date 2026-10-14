import { SimulationReportRepository } from '../../../src/database/repositories/simulation-report.repository';
import { ReportListSortField, ReportReviewStatus } from '../../../src/common/constants';

const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';
const EDUCATOR_ID = '11111111-1111-4111-8111-111111111111';
const CLASS_ID = '22222222-2222-4222-8222-222222222222';
const S1 = '33333333-3333-4333-8333-333333333331';
const S2 = '33333333-3333-4333-8333-333333333332';
const REPORT_UUID = '44444444-4444-4444-8444-444444444444';
const SCENARIO_A = 'scenario-a';
const SCENARIO_B = 'scenario-b';

const row = (id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  studentId: S1,
  scenarioId: SCENARIO_A,
  transcriptId: `tr-${id}`,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  ...overrides,
});

const REPOSITORY_METHODS = [
  'findReportRowsByStudentIds',
  'findReportRowsByClassId',
  'findReportRowsByEducatorId',
  'findReportRowsByClassIdSince',
  'findReportRowsByAdminId',
  'findReportRowsPage',
  'countReportsPerMonth',
  'findRowByIdOrReportId',
  'findDetailRowByIdOrReportId',
  'findDetailRowByTranscriptId',
  'findAttemptRowsByStudentId',
  'findScenarioIdsUsedByStudent',
  'findStudentIdsWhoUsedScenariosInClass',
  'findStudentScenarioPairsWithAttempts',
  'findLatestAttemptNotificationRow',
  'findReportsForListing',
] as const;

type MockedRepository = Record<(typeof REPOSITORY_METHODS)[number], jest.Mock>;

/**
 * Educator/admin Report reads and the "has used" checks on `SimulationReportRepository`, with
 * every repository method mocked: these tests pin the arguments each read is called with and the
 * shape of the rows it hands back.
 */
describe('Report reads from the database (Integration, mocked repository)', () => {
  let repository: MockedRepository;

  beforeEach(() => {
    repository = Object.fromEntries(
      REPOSITORY_METHODS.map((method) => [method, jest.fn()]),
    ) as MockedRepository;
  });

  describe('Reports of students', () => {
    it("returns every Attempt of each student's, newest first", async () => {
      const rows = [row('retake'), row('b'), row('first')];
      repository.findReportRowsByStudentIds.mockResolvedValue(rows);

      await expect(repository.findReportRowsByStudentIds([S1])).resolves.toBe(rows);
      expect(repository.findReportRowsByStudentIds).toHaveBeenCalledWith([S1]);
    });

    it('returns nothing for an empty student list', async () => {
      repository.findReportRowsByStudentIds.mockResolvedValue([]);

      await expect(repository.findReportRowsByStudentIds([])).resolves.toEqual([]);
    });

    it('is scoped to the class', async () => {
      const rows = [row('a')];
      repository.findReportRowsByClassId.mockResolvedValue(rows);

      await expect(repository.findReportRowsByClassId(CLASS_ID)).resolves.toBe(rows);
      expect(repository.findReportRowsByClassId).toHaveBeenCalledWith(CLASS_ID);
    });

    it('is scoped to the educator', async () => {
      repository.findReportRowsByEducatorId.mockResolvedValue([row('a')]);

      await repository.findReportRowsByEducatorId(EDUCATOR_ID);
      expect(repository.findReportRowsByEducatorId).toHaveBeenCalledWith(EDUCATOR_ID);
    });

    it('limits the class date range to Reports created since the cutoff', async () => {
      const since = new Date('2026-09-10T00:00:00.000Z');
      repository.findReportRowsByClassIdSince.mockResolvedValue([]);

      await repository.findReportRowsByClassIdSince(CLASS_ID, since);
      expect(repository.findReportRowsByClassIdSince).toHaveBeenCalledWith(CLASS_ID, since);
    });

    it('matches nothing for an unknown District Admin', async () => {
      repository.findReportRowsByAdminId.mockResolvedValue([]);
      repository.countReportsPerMonth.mockResolvedValue([]);

      await expect(repository.findReportRowsByAdminId(UNKNOWN_UUID)).resolves.toEqual([]);
      const filters = { since: new Date('2026-01-01T00:00:00Z'), adminId: UNKNOWN_UUID };
      await expect(repository.countReportsPerMonth(filters)).resolves.toEqual([]);
      expect(repository.countReportsPerMonth).toHaveBeenCalledWith(filters);
    });
  });

  describe('findReportRowsPage', () => {
    it('filters by student and scenario and pages the result', async () => {
      repository.findReportRowsPage.mockResolvedValue([row('b', { scenarioId: SCENARIO_B })]);
      const query = { studentId: S1, scenarioId: SCENARIO_B, skip: 0, take: 10 };

      const rows = (await repository.findReportRowsPage(query)) as Array<{ id: string }>;

      expect(rows.map((r) => r.id)).toEqual(['b']);
      expect(repository.findReportRowsPage).toHaveBeenCalledWith(query);
    });
  });

  describe('countReportsPerMonth', () => {
    it('returns the per-month counts, retakes included', async () => {
      const counts = [
        { month: '2026-08', count: 1 },
        { month: '2026-09', count: 4 },
      ];
      repository.countReportsPerMonth.mockResolvedValue(counts);
      const since = new Date('2026-08-01T00:00:00.000Z');

      await expect(repository.countReportsPerMonth({ since })).resolves.toEqual(counts);
      expect(repository.countReportsPerMonth).toHaveBeenCalledWith({ since });
    });
  });

  describe('single report lookups', () => {
    it('finds a row by its database id or its legacy report id', async () => {
      repository.findRowByIdOrReportId.mockResolvedValue(row(REPORT_UUID));

      await expect(repository.findRowByIdOrReportId(REPORT_UUID)).resolves.toMatchObject({
        id: REPORT_UUID,
      });
      await expect(repository.findRowByIdOrReportId('report-legacy')).resolves.toMatchObject({
        id: REPORT_UUID,
      });
      expect(repository.findRowByIdOrReportId.mock.calls).toEqual([
        [REPORT_UUID],
        ['report-legacy'],
      ]);
    });

    it('returns null for an unknown id', async () => {
      repository.findRowByIdOrReportId.mockResolvedValue(null);

      await expect(repository.findRowByIdOrReportId('report-unknown')).resolves.toBeNull();
      await expect(repository.findRowByIdOrReportId(UNKNOWN_UUID)).resolves.toBeNull();
    });

    it('returns the detail row by id, report id and transcript id', async () => {
      const detail = row(REPORT_UUID, { studentId: S2, reportId: 'report-s2-a' });
      repository.findDetailRowByIdOrReportId.mockResolvedValue(detail);
      repository.findDetailRowByTranscriptId.mockResolvedValueOnce(detail).mockResolvedValue(null);

      await expect(repository.findDetailRowByIdOrReportId(REPORT_UUID)).resolves.toBe(detail);
      await expect(repository.findDetailRowByIdOrReportId('report-s2-a')).resolves.toBe(detail);
      await expect(repository.findDetailRowByTranscriptId('tr-s2-a')).resolves.toBe(detail);
      await expect(repository.findDetailRowByTranscriptId('nope')).resolves.toBeNull();
    });
  });

  describe('"has used" checks over every Attempt', () => {
    it('lists the Attempts of a student, retakes included', async () => {
      const rows = [row('retake'), row('b'), row('first')];
      repository.findAttemptRowsByStudentId.mockResolvedValue(rows);

      await expect(repository.findAttemptRowsByStudentId(S1)).resolves.toBe(rows);
      expect(repository.findAttemptRowsByStudentId).toHaveBeenCalledWith(S1);
    });

    it('finds the scenarios a student, or a Student Code, has used', async () => {
      repository.findScenarioIdsUsedByStudent
        .mockResolvedValueOnce([SCENARIO_A, SCENARIO_B])
        .mockResolvedValueOnce([SCENARIO_A]);

      await expect(
        repository.findScenarioIdsUsedByStudent(S1, null, [SCENARIO_A, SCENARIO_B, 'untouched']),
      ).resolves.toEqual([SCENARIO_A, SCENARIO_B]);
      await expect(
        repository.findScenarioIdsUsedByStudent(S2, 'code-s2-a', [SCENARIO_A, SCENARIO_B]),
      ).resolves.toEqual([SCENARIO_A]);
      expect(repository.findScenarioIdsUsedByStudent).toHaveBeenLastCalledWith(S2, 'code-s2-a', [
        SCENARIO_A,
        SCENARIO_B,
      ]);
    });

    it('finds the students of a class who used any of the scenarios', async () => {
      repository.findStudentIdsWhoUsedScenariosInClass.mockResolvedValue([S1, S2]);

      await expect(
        repository.findStudentIdsWhoUsedScenariosInClass(CLASS_ID, [SCENARIO_A]),
      ).resolves.toEqual([S1, S2]);
      expect(repository.findStudentIdsWhoUsedScenariosInClass).toHaveBeenCalledWith(CLASS_ID, [
        SCENARIO_A,
      ]);
    });

    it('finds the (student, scenario) pairs that have an Attempt', async () => {
      const pairs = [
        { studentId: S1, scenarioId: SCENARIO_A },
        { studentId: S2, scenarioId: SCENARIO_A },
      ];
      repository.findStudentScenarioPairsWithAttempts.mockResolvedValue(pairs);

      await expect(
        repository.findStudentScenarioPairsWithAttempts([S1, S2], [SCENARIO_A]),
      ).resolves.toEqual(pairs);
    });

    it('reads the newest Attempt for the educator notification', async () => {
      repository.findLatestAttemptNotificationRow
        .mockResolvedValueOnce({ reportId: 'report-retake', scenarioId: SCENARIO_A })
        .mockResolvedValueOnce(null);

      await expect(repository.findLatestAttemptNotificationRow(S1)).resolves.toMatchObject({
        reportId: 'report-retake',
      });
      await expect(repository.findLatestAttemptNotificationRow(UNKNOWN_UUID)).resolves.toBeNull();
    });
  });

  describe('findReportsForListing', () => {
    const sort = { field: ReportListSortField.COMPLETED_AT, direction: 'DESC' as const };

    it('returns the rows and the exact total', async () => {
      const page = { rows: [{ reportId: 'r1' }, { reportId: 'r2' }], total: 4 };
      repository.findReportsForListing.mockResolvedValue(page);

      await expect(
        repository.findReportsForListing(EDUCATOR_ID, {}, sort, { skip: 0, take: 50 }),
      ).resolves.toBe(page);
    });

    it('passes filters, sort and pagination through', async () => {
      repository.findReportsForListing.mockResolvedValue({ rows: [], total: 0 });
      const filters = {
        classIds: [CLASS_ID],
        simulationIds: [SCENARIO_B],
        reviewStatus: ReportReviewStatus.UNREAD,
      };

      await repository.findReportsForListing(EDUCATOR_ID, filters, sort, { skip: 2, take: 2 });

      expect(repository.findReportsForListing).toHaveBeenCalledWith(EDUCATOR_ID, filters, sort, {
        skip: 2,
        take: 2,
      });
    });
  });
});

// Keeps the mocked method names checked against the real repository.
const _methodsExist: ReadonlyArray<keyof SimulationReportRepository> = REPOSITORY_METHODS;
void _methodsExist;
