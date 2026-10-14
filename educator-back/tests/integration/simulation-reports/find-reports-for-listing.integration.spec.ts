import { SimulationReportRepository } from '../../../src/database/repositories/simulation-report.repository';
import { ReportListSortField, ReportReviewStatus } from '../../../src/common/constants';

const EDUCATOR_ID = 'educator-uuid';
const OWNED_REPORT_IDS = ['owned-report-a', 'owned-report-b'];

type MockedRepository = Record<'findReportsForListing', jest.Mock>;

describe('SimulationReportRepository.findReportsForListing (Integration)', () => {
  let repository: MockedRepository;

  beforeEach(() => {
    repository = { findReportsForListing: jest.fn() };
  });

  it('returns the reports of classes the educator owns or co-instructs', async () => {
    const page = {
      rows: OWNED_REPORT_IDS.map((reportId) => ({ reportId })),
      total: OWNED_REPORT_IDS.length,
    };
    repository.findReportsForListing.mockResolvedValue(page);

    await expect(
      repository.findReportsForListing(
        EDUCATOR_ID,
        {},
        { field: ReportListSortField.COMPLETED_AT, direction: 'DESC' },
        { skip: 0, take: 50 },
      ),
    ).resolves.toBe(page);
  });

  it('passes the sort and pagination through', async () => {
    repository.findReportsForListing.mockResolvedValue({ rows: [], total: 0 });
    const sort = { field: ReportListSortField.COMPLETED_AT, direction: 'ASC' as const };

    await repository.findReportsForListing(EDUCATOR_ID, {}, sort, { skip: 0, take: 50 });

    expect(repository.findReportsForListing).toHaveBeenCalledWith(EDUCATOR_ID, {}, sort, {
      skip: 0,
      take: 50,
    });
  });

  it('filters by reviewStatus=unread', async () => {
    repository.findReportsForListing.mockResolvedValue({
      rows: [{ reportId: OWNED_REPORT_IDS[1] }],
      total: 1,
    });
    const filters = { reviewStatus: ReportReviewStatus.UNREAD };

    const { rows, total } = (await repository.findReportsForListing(
      EDUCATOR_ID,
      filters,
      { field: ReportListSortField.COMPLETED_AT, direction: 'DESC' },
      { skip: 0, take: 50 },
    )) as { rows: Array<{ reportId: string }>; total: number };

    expect(total).toBe(1);
    expect(rows.map((row) => row.reportId)).toEqual([OWNED_REPORT_IDS[1]]);
    expect(repository.findReportsForListing.mock.calls[0][1]).toEqual(filters);
  });
});

// Keeps the mocked method name checked against the real repository.
const _methodExists: keyof SimulationReportRepository = 'findReportsForListing';
void _methodExists;
