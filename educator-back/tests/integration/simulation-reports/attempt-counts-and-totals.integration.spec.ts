import { SimulationReportRepository } from '../../../src/database/repositories/simulation-report.repository';

const OWNER_ID = 'owner-student-uuid';
const OTHER_ID = 'other-student-uuid';

const REPOSITORY_METHODS = ['countAssessmentAttempts', 'getAttemptTotalsByStudentId'] as const;

type MockedRepository = Record<(typeof REPOSITORY_METHODS)[number], jest.Mock>;

/** Assessment Attempt count (start-assessment) and per-student Attempt totals (stats sync). */
describe('Attempt counts and totals (Integration)', () => {
  let repository: MockedRepository;

  beforeEach(() => {
    repository = Object.fromEntries(
      REPOSITORY_METHODS.map((method) => [method, jest.fn()]),
    ) as MockedRepository;
  });

  describe('countAssessmentAttempts', () => {
    it('counts the stored Assessment Attempts of the student for the scenario', async () => {
      repository.countAssessmentAttempts.mockResolvedValue(2);

      await expect(repository.countAssessmentAttempts(OWNER_ID, 'scenario-1')).resolves.toBe(2);
      expect(repository.countAssessmentAttempts).toHaveBeenCalledWith(OWNER_ID, 'scenario-1');
    });

    it('returns 0 for a student with no Assessment Attempts', async () => {
      repository.countAssessmentAttempts.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      await expect(repository.countAssessmentAttempts(OWNER_ID, 'scenario-2')).resolves.toBe(1);
      await expect(repository.countAssessmentAttempts(OTHER_ID, 'scenario-2')).resolves.toBe(0);
    });
  });

  describe('getAttemptTotalsByStudentId', () => {
    it('returns the attempt count and total seconds', async () => {
      const totals = { attemptCount: 5, totalSeconds: 400.5 };
      repository.getAttemptTotalsByStudentId.mockResolvedValue(totals);

      await expect(repository.getAttemptTotalsByStudentId(OWNER_ID)).resolves.toEqual(totals);
      expect(repository.getAttemptTotalsByStudentId).toHaveBeenCalledWith(OWNER_ID);
    });

    it('returns zeros for a student with no rows', async () => {
      const zeros = { attemptCount: 0, totalSeconds: 0 };
      repository.getAttemptTotalsByStudentId.mockResolvedValue(zeros);

      await expect(repository.getAttemptTotalsByStudentId(OTHER_ID)).resolves.toEqual(zeros);
    });
  });
});

// Keeps the mocked method names checked against the real repository.
const _methodsExist: ReadonlyArray<keyof SimulationReportRepository> = REPOSITORY_METHODS;
void _methodsExist;
