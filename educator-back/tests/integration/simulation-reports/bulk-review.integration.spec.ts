import { SimulationReportRepository } from '../../../src/database/repositories/simulation-report.repository';
import { SimulationReportSelectorType } from '../../../src/common/constants/simulation-report.constants';

const EDUCATOR_ID = 'educator-uuid';
const OWNED_REPORT_ID = 'owned-report-uuid';
const NOT_OWNED_REPORT_ID = 'not-owned-report-uuid';

const REPOSITORY_METHODS = ['bulkReview', 'findAccessibleById'] as const;

type MockedRepository = Record<(typeof REPOSITORY_METHODS)[number], jest.Mock>;

describe('SimulationReportRepository.bulkReview / findAccessibleById (Integration)', () => {
  let repository: MockedRepository;

  beforeEach(() => {
    repository = Object.fromEntries(
      REPOSITORY_METHODS.map((method) => [method, jest.fn()]),
    ) as MockedRepository;
  });

  describe('bulkReview', () => {
    it('returns only the rows that were marked reviewed', async () => {
      const ownedRow = {
        id: OWNED_REPORT_ID,
        student_id: 'student-uuid',
        scenario_id: 'scenario',
        class_id: 'class-uuid',
      };
      repository.bulkReview.mockResolvedValue([ownedRow]);
      const input = {
        selectorType: SimulationReportSelectorType.REPORT,
        ids: [OWNED_REPORT_ID, NOT_OWNED_REPORT_ID],
        reviewed: true,
        educatorId: EDUCATOR_ID,
      };

      await expect(repository.bulkReview(input)).resolves.toEqual([ownedRow]);
      expect(repository.bulkReview).toHaveBeenCalledWith(input);
    });
  });

  describe('findAccessibleById', () => {
    it('returns the report when the caller owns its class', async () => {
      repository.findAccessibleById.mockResolvedValue({ id: OWNED_REPORT_ID });

      await expect(
        repository.findAccessibleById(OWNED_REPORT_ID, EDUCATOR_ID),
      ).resolves.toMatchObject({ id: OWNED_REPORT_ID });
      expect(repository.findAccessibleById).toHaveBeenCalledWith(OWNED_REPORT_ID, EDUCATOR_ID);
    });

    it('returns null when the report belongs to a class the caller has no access to', async () => {
      repository.findAccessibleById.mockResolvedValue(null);

      await expect(
        repository.findAccessibleById(NOT_OWNED_REPORT_ID, EDUCATOR_ID),
      ).resolves.toBeNull();
    });
  });
});

// Keeps the mocked method names checked against the real repository.
const _methodsExist: ReadonlyArray<keyof SimulationReportRepository> = REPOSITORY_METHODS;
void _methodsExist;
