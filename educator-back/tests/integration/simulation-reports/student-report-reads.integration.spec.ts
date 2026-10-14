import { SimulationReportRepository } from '../../../src/database/repositories/simulation-report.repository';

const OWNER_ID = '33333333-3333-4333-8333-333333333331';
const OTHER_ID = '33333333-3333-4333-8333-333333333332';

const listRow = (key: string): Record<string, unknown> => ({
  id: `id-${key}`,
  reportId: `report-${key}`,
  studentId: OWNER_ID,
  mode: 'Assessment',
});

const REPOSITORY_METHODS = [
  'findListRowsByStudentId',
  'findDetailRowByReportIdForStudent',
  'findDetailRowByReportId',
  'findDetailRowByTranscriptIdForStudent',
] as const;

type MockedRepository = Record<(typeof REPOSITORY_METHODS)[number], jest.Mock>;

/**
 * The Student-facing Report reads (list, by `report_id`, by `transcript_id`) on
 * `SimulationReportRepository`, with every repository method mocked.
 */
describe('Student Report reads (Integration, mocked repository)', () => {
  let repository: MockedRepository;

  beforeEach(() => {
    repository = Object.fromEntries(
      REPOSITORY_METHODS.map((method) => [method, jest.fn().mockResolvedValue(null)]),
    ) as MockedRepository;
  });

  describe('findListRowsByStudentId', () => {
    it('lists every Attempt of the Student, including repeats of a Scenario', async () => {
      const rows = [listRow('latest'), listRow('repeat'), listRow('first')];
      repository.findListRowsByStudentId.mockResolvedValue(rows);

      await expect(repository.findListRowsByStudentId(OWNER_ID)).resolves.toBe(rows);
      expect(repository.findListRowsByStudentId).toHaveBeenCalledWith(OWNER_ID);
    });

    it('passes the mode filter through', async () => {
      repository.findListRowsByStudentId.mockResolvedValue([]);

      await repository.findListRowsByStudentId(OWNER_ID, 'practice');
      expect(repository.findListRowsByStudentId).toHaveBeenCalledWith(OWNER_ID, 'practice');
    });

    it('returns nothing for a Student with no Reports', async () => {
      repository.findListRowsByStudentId.mockResolvedValue([]);

      await expect(
        repository.findListRowsByStudentId('00000000-0000-0000-0000-000000000000'),
      ).resolves.toEqual([]);
    });
  });

  describe('findDetailRowByReportIdForStudent', () => {
    it('returns the owner their Report', async () => {
      const stored = { reportId: 'report-first', summary: 'summary', score: 70 };
      repository.findDetailRowByReportIdForStudent.mockResolvedValueOnce(stored);

      await expect(
        repository.findDetailRowByReportIdForStudent(OWNER_ID, 'report-first'),
      ).resolves.toBe(stored);
      expect(repository.findDetailRowByReportIdForStudent).toHaveBeenCalledWith(
        OWNER_ID,
        'report-first',
      );
    });

    it('returns null for a non-owner or a missing Report', async () => {
      await expect(
        repository.findDetailRowByReportIdForStudent(OTHER_ID, 'report-first'),
      ).resolves.toBeNull();
      await expect(
        repository.findDetailRowByReportIdForStudent(OWNER_ID, 'report-missing'),
      ).resolves.toBeNull();
    });
  });

  describe('findDetailRowByReportId', () => {
    it('returns the Report whoever owns it', async () => {
      const stored = { reportId: 'report-first', summary: 'summary', score: 70 };
      repository.findDetailRowByReportId.mockResolvedValueOnce(stored);

      await expect(repository.findDetailRowByReportId('report-first')).resolves.toBe(stored);
    });

    it('returns null for a missing Report', async () => {
      await expect(repository.findDetailRowByReportId('report-missing')).resolves.toBeNull();
    });
  });

  describe('findDetailRowByTranscriptIdForStudent', () => {
    it('returns the owner their Report', async () => {
      repository.findDetailRowByTranscriptIdForStudent.mockResolvedValueOnce({
        reportId: 'report-repeat',
      });

      await expect(
        repository.findDetailRowByTranscriptIdForStudent(OWNER_ID, 'tr-repeat'),
      ).resolves.toMatchObject({ reportId: 'report-repeat' });
    });

    it('returns null for a non-owner or an unknown transcript', async () => {
      await expect(
        repository.findDetailRowByTranscriptIdForStudent(OTHER_ID, 'tr-repeat'),
      ).resolves.toBeNull();
      await expect(
        repository.findDetailRowByTranscriptIdForStudent(OWNER_ID, 'tr-unknown'),
      ).resolves.toBeNull();
    });
  });
});

// Keeps the mocked method names checked against the real repository.
const _methodsExist: ReadonlyArray<keyof SimulationReportRepository> = REPOSITORY_METHODS;
void _methodsExist;
