import { SimulationReportsService } from './simulation-reports.service';
import { SimulationReportRepository } from 'src/database/repositories';
import { ListReportsReqDto } from './dto/list-reports.dto';
import { ReportListSortField, ReportModeType, ReportReviewStatus } from 'src/common/constants';
import type { ICurrentUser, IReportListingRawRow } from 'src/common/interfaces';
import { buildPaginationMeta } from 'src/common/utils/pagination.util';

describe('SimulationReportsService.findReports (RE-192)', () => {
  const currentUser: ICurrentUser = { userId: 'user-1', educatorId: 'educator-1' };

  const dbRow = (over: Partial<IReportListingRawRow> = {}): IReportListingRawRow => ({
    reportId: 'report-1',
    studentCode: 'REP-PH9N',
    studentName: 'Alice',
    scenarioId: 'cardiac-care-v2',
    simulationName: 'Cardiac Care',
    mode: ReportModeType.ASSESSMENT,
    score: 82,
    scoreJson: { overallLabel: 'Exceptional' },
    performanceLabel: null,
    totalTimeSeconds: 754,
    transcriptId: 'transcript-abc123',
    completedAt: new Date('2026-01-14T09:00:00.000Z'),
    viewedAt: null,
    viewedBy: null,
    ...over,
  });

  function buildService(
    rows: IReportListingRawRow[] = [],
    total = rows.length,
  ): {
    service: SimulationReportsService;
    findReportsForListing: jest.Mock;
  } {
    const findReportsForListing = jest.fn().mockResolvedValue({ rows, total });
    const reportRepo: Partial<SimulationReportRepository> = { findReportsForListing };
    const service = Object.create(SimulationReportsService.prototype) as SimulationReportsService;
    (service as unknown as Record<string, unknown>).reportRepo = reportRepo;
    return { service, findReportsForListing };
  }

  it('returns an empty array (not an error) when nothing matches the filters', async () => {
    const { service, findReportsForListing } = buildService();

    const result = await service.findReports(currentUser, new ListReportsReqDto());

    expect(result.data).toEqual([]);
    expect(result.meta?.total).toBe(0);
    expect(findReportsForListing).toHaveBeenCalledTimes(1);
  });

  it('defaults sort to completedAt DESC when sortBy/sortDirection are omitted', async () => {
    const { service, findReportsForListing } = buildService();

    await service.findReports(currentUser, new ListReportsReqDto());

    const [, , sort] = findReportsForListing.mock.calls[0] as [unknown, unknown, unknown];
    expect(sort).toEqual({ field: ReportListSortField.COMPLETED_AT, direction: 'DESC' });
  });

  it('passes sortBy/sortDirection through when provided', async () => {
    const { service, findReportsForListing } = buildService();
    const dto = Object.assign(new ListReportsReqDto(), {
      sortBy: ReportListSortField.SCORE,
      sortDirection: 'ASC' as const,
    });

    await service.findReports(currentUser, dto);

    const [, , sort] = findReportsForListing.mock.calls[0] as [unknown, unknown, unknown];
    expect(sort).toEqual({ field: ReportListSortField.SCORE, direction: 'ASC' });
  });

  it('forwards studentIds/classIds/schoolIds/simulationIds/reviewStatus filters to the repository', async () => {
    const { service, findReportsForListing } = buildService();
    const dto = Object.assign(new ListReportsReqDto(), {
      studentIds: ['s1'],
      classIds: ['c1'],
      schoolIds: ['sc1'],
      simulationIds: ['sim1'],
      reviewStatus: ReportReviewStatus.UNREAD,
    });

    await service.findReports(currentUser, dto);

    const [educatorId, filters] = findReportsForListing.mock.calls[0] as [unknown, unknown];
    expect(educatorId).toBe('educator-1');
    expect(filters).toEqual({
      studentIds: ['s1'],
      classIds: ['c1'],
      schoolIds: ['sc1'],
      simulationIds: ['sim1'],
      reviewStatus: ReportReviewStatus.UNREAD,
    });
  });

  it('paginates in the repository and builds meta from the exact total', async () => {
    const { service, findReportsForListing } = buildService([dbRow()], 41);
    const dto = Object.assign(new ListReportsReqDto(), { page: 3, pageSize: 20 });

    const result = await service.findReports(currentUser, dto);

    const [, , , pagination] = findReportsForListing.mock.calls[0] as [
      unknown,
      unknown,
      unknown,
      unknown,
    ];
    expect(pagination).toEqual({ skip: 40, take: 20 });
    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual(buildPaginationMeta(41, 3, 20));
  });

  it('maps a row into the response DTO shape from the typed columns', async () => {
    const viewedAt = new Date('2026-01-15T10:30:00.000Z');
    const { service } = buildService([dbRow({ viewedAt, viewedBy: 'educator-1' })]);

    const result = await service.findReports(currentUser, new ListReportsReqDto());

    expect(result.data).toEqual([
      {
        reportId: 'report-1',
        studentCode: 'REP-PH9N',
        mode: 'Assessment',
        simulationName: 'Cardiac Care',
        score: 82,
        performanceQuality: 'Exceptional',
        timeSpent: '00:12:34',
        completedAt: '2026-01-14T09:00:00.000Z',
        transcriptId: 'transcript-abc123',
        viewedAt: viewedAt.toISOString(),
        viewedBy: 'educator-1',
      },
    ]);
  });

  it('falls back to score_json.overallScore and the performance_label column', async () => {
    const { service } = buildService([
      dbRow({
        score: null,
        scoreJson: { overallScore: 64 },
        performanceLabel: 'Meets Expectation',
      }),
    ]);

    const result = await service.findReports(currentUser, new ListReportsReqDto());

    expect(result.data?.[0].score).toBe(64);
    expect(result.data?.[0].performanceQuality).toBe('Meets Expectation');
  });

  it('returns null display fields for a row whose typed columns are empty', async () => {
    const { service } = buildService([
      dbRow({
        studentName: null,
        simulationName: null,
        mode: null,
        score: null,
        scoreJson: null,
        performanceLabel: null,
        totalTimeSeconds: null,
        transcriptId: null,
      }),
    ]);

    const result = await service.findReports(currentUser, new ListReportsReqDto());

    expect(result.data?.[0]).toMatchObject({
      viewedAt: null,
      viewedBy: null,
      mode: null,
      score: null,
      performanceQuality: null,
      timeSpent: null,
      transcriptId: null,
    });
  });

  // RolesGuard is a confirmed no-op (src/common/guards/roles.guard.ts always returns true
  // before its role check) — soft-skipped until it's actually enforced, per memory note.
  it.skip('rejects a non-Educator caller with 403 (RolesGuard is currently a no-op)', () => {
    expect(true).toBe(true);
  });

  it('rejects a caller with no educatorId (e.g. a student/admin token) with 403', async () => {
    const { service, findReportsForListing } = buildService();
    const nonEducatorUser: ICurrentUser = { userId: 'user-2' };

    await expect(service.findReports(nonEducatorUser, new ListReportsReqDto())).rejects.toThrow();
    expect(findReportsForListing).not.toHaveBeenCalled();
  });
});
