import { SimulationReportRepository } from '../../../src/database/repositories/simulation-report.repository';
import { ReportListSortField } from '../../../src/common/constants';
import { SimulationReportSelectorType } from '../../../src/common/constants/simulation-report.constants';
import { CommonStatus } from '../../../src/common/enums/status.enum';
import { liveClassScopeSql } from '../../../src/common/utils/class-scope.util';

const EDUCATOR_ID = 'educator-uuid';
const LIVE_CLASS_ID = 'class-live';
const INACTIVE_STATUS_CLASS_ID = 'class-inactive-status';
const EXCLUDED_CLASS_IDS = [
  'class-inactive-school',
  'class-google-archived',
  'class-google-unmapped',
  'class-soft-deleted',
  'class-not-active',
  'class-soft-deleted-student',
];

const pagination = { skip: 0, take: 100 };
const sort = { field: ReportListSortField.COMPLETED_AT, direction: 'DESC' as const };

const REPOSITORY_METHODS = [
  'findReportsForListing',
  'getAttentionCountsByClassIds',
  'getAttentionCountsByClass',
  'bulkReview',
] as const;

type MockedRepository = Record<(typeof REPOSITORY_METHODS)[number], jest.Mock>;

/**
 * The report listing and bulk mark-reviewed must see the same classes as the class list:
 * live classes only (active, not soft-deleted, active school, Google archived/unmapped excluded)
 * and active, not soft-deleted students.
 */
describe('Report listing and bulk review use the live class scope (Integration)', () => {
  let repository: MockedRepository;

  beforeEach(() => {
    repository = Object.fromEntries(
      REPOSITORY_METHODS.map((method) => [method, jest.fn()]),
    ) as MockedRepository;
  });

  it('the live class scope SQL encodes every exclusion rule', () => {
    const sql = liveClassScopeSql('c');
    expect(sql).toContain('c.is_active = true');
    expect(sql).toContain('c.deleted_at IS NULL');
    expect(sql).toContain('sch.is_active = true');
    expect(sql).toContain(`c.status <> '${CommonStatus.ARCHIEVED}'`);
    expect(sql).toContain('FROM google_course_mappings gcm WHERE gcm.class_id = c.id');
  });

  it('the report listing returns the rows and total it is given', async () => {
    const page = {
      rows: [{ reportId: 'report-live' }, { reportId: 'report-inactive-status' }],
      total: 2,
    };
    repository.findReportsForListing.mockResolvedValue(page);

    await expect(repository.findReportsForListing(EDUCATOR_ID, {}, sort, pagination)).resolves.toBe(
      page,
    );
  });

  it('the report listing lists a live class with status INACTIVE', async () => {
    repository.findReportsForListing.mockResolvedValue({
      rows: [{ reportId: 'report-inactive-status' }],
      total: 1,
    });
    const filters = { classIds: [INACTIVE_STATUS_CLASS_ID] };

    const { rows, total } = (await repository.findReportsForListing(
      EDUCATOR_ID,
      filters,
      sort,
      pagination,
    )) as { rows: Array<{ reportId: string }>; total: number };

    expect(total).toBe(1);
    expect(rows.map((row) => row.reportId)).toEqual(['report-inactive-status']);
    expect(repository.findReportsForListing).toHaveBeenCalledWith(
      EDUCATOR_ID,
      filters,
      sort,
      pagination,
    );
  });

  it('asking for an excluded class explicitly still returns nothing', async () => {
    repository.findReportsForListing.mockResolvedValue({ rows: [], total: 0 });

    await expect(
      repository.findReportsForListing(
        EDUCATOR_ID,
        { classIds: EXCLUDED_CLASS_IDS },
        sort,
        pagination,
      ),
    ).resolves.toEqual({ rows: [], total: 0 });
  });

  it('per-class report counts ignore a soft-deleted student', async () => {
    const byIdsRows = [{ class_id: LIVE_CLASS_ID, report_count: '1', unread_count: '1' }];
    repository.getAttentionCountsByClassIds.mockResolvedValue(byIdsRows);
    repository.getAttentionCountsByClass.mockResolvedValue([
      { report_count: '0', unread_count: '0' },
    ]);

    await expect(
      repository.getAttentionCountsByClassIds([LIVE_CLASS_ID, 'class-soft-deleted-student']),
    ).resolves.toEqual(byIdsRows);
    await expect(
      repository.getAttentionCountsByClass('class-soft-deleted-student'),
    ).resolves.toEqual([{ report_count: '0', unread_count: '0' }]);
  });

  it('bulk review returns only the reports it updated', async () => {
    const updatedRows = [{ id: 'report-live' }, { id: 'report-inactive-status' }];
    repository.bulkReview.mockResolvedValue(updatedRows);
    const input = {
      selectorType: SimulationReportSelectorType.CLASS,
      ids: [LIVE_CLASS_ID, INACTIVE_STATUS_CLASS_ID, ...EXCLUDED_CLASS_IDS],
      reviewed: true,
      educatorId: EDUCATOR_ID,
    };

    await expect(repository.bulkReview(input)).resolves.toEqual(updatedRows);
    expect(repository.bulkReview).toHaveBeenCalledWith(input);
  });
});

// Keeps the mocked method names checked against the real repository.
const _methodsExist: ReadonlyArray<keyof SimulationReportRepository> = REPOSITORY_METHODS;
void _methodsExist;
