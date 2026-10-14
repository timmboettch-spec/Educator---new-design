import { SimulationReportsService } from 'src/simulation-reports/simulation-reports.service';
import { SimulationReportSelectorType } from 'src/common/constants/simulation-report.constants';
import { SimulationReportConstants } from 'src/simulation-reports/simulation-reports.constant';
import type { ICurrentUser } from 'src/common/interfaces';

describe('SimulationReportsService.bulkReview', () => {
  const reportRepo = { bulkReview: jest.fn() };
  const currentUser: ICurrentUser = { userId: 'edu-1', educatorId: 'edu-1' };

  const service = new SimulationReportsService(
    reportRepo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    reportRepo.bulkReview.mockReset();
  });

  it('passes the selector type, ids, reviewed flag, and caller id straight through to the repository', async () => {
    reportRepo.bulkReview.mockResolvedValue([]);

    await service.bulkReview(currentUser, {
      type: SimulationReportSelectorType.REPORT,
      ids: ['r-1'],
      reviewed: true,
    });

    expect(reportRepo.bulkReview).toHaveBeenCalledWith({
      selectorType: SimulationReportSelectorType.REPORT,
      ids: ['r-1'],
      reviewed: true,
      educatorId: 'edu-1',
    });
  });

  it('reports report ids directly updated/not-accessible for the REPORT selector', async () => {
    reportRepo.bulkReview.mockResolvedValue([
      { id: 'r-1', student_id: 's-1', scenario_id: 'sim-1', class_id: 'c-1' },
    ]);

    const result = await service.bulkReview(currentUser, {
      type: SimulationReportSelectorType.REPORT,
      ids: ['r-1', 'r-2'],
      reviewed: true,
    });

    expect(result.data).toEqual({ updatedIds: ['r-1'], notAccessibleIds: ['r-2'] });
    expect(result.message).toBe(SimulationReportConstants.MESSAGES.BULK_REVIEW_COMPLETED);
  });

  it('computes not-accessible ids against student_id for the STUDENT selector', async () => {
    reportRepo.bulkReview.mockResolvedValue([
      { id: 'r-1', student_id: 's-1', scenario_id: 'sim-1', class_id: 'c-1' },
      { id: 'r-2', student_id: 's-1', scenario_id: 'sim-2', class_id: 'c-1' },
    ]);

    const result = await service.bulkReview(currentUser, {
      type: SimulationReportSelectorType.STUDENT,
      ids: ['s-1', 's-2'],
      reviewed: true,
    });

    expect(result.data).toEqual({ updatedIds: ['r-1', 'r-2'], notAccessibleIds: ['s-2'] });
  });

  it('computes not-accessible ids against scenario_id for the SIMULATION selector', async () => {
    reportRepo.bulkReview.mockResolvedValue([
      { id: 'r-1', student_id: 's-1', scenario_id: 'sim-1', class_id: 'c-1' },
    ]);

    const result = await service.bulkReview(currentUser, {
      type: SimulationReportSelectorType.SIMULATION,
      ids: ['sim-1', 'sim-2'],
      reviewed: true,
    });

    expect(result.data).toEqual({ updatedIds: ['r-1'], notAccessibleIds: ['sim-2'] });
  });

  it('computes not-accessible ids against class_id for the CLASS selector', async () => {
    reportRepo.bulkReview.mockResolvedValue([
      { id: 'r-1', student_id: 's-1', scenario_id: 'sim-1', class_id: 'c-1' },
    ]);

    const result = await service.bulkReview(currentUser, {
      type: SimulationReportSelectorType.CLASS,
      ids: ['c-1', 'c-2'],
      reviewed: false,
    });

    expect(result.data).toEqual({ updatedIds: ['r-1'], notAccessibleIds: ['c-2'] });
  });

  it('dedupes notAccessibleIds when the same requested id repeats', async () => {
    reportRepo.bulkReview.mockResolvedValue([
      { id: 'r-1', student_id: 's-1', scenario_id: 'sim-1', class_id: 'c-1' },
    ]);

    const result = await service.bulkReview(currentUser, {
      type: SimulationReportSelectorType.REPORT,
      ids: ['r-1', 'r-2', 'r-2'],
      reviewed: true,
    });

    expect(result.data).toEqual({ updatedIds: ['r-1'], notAccessibleIds: ['r-2'] });
  });

  it('wraps a repository error via handleError rather than swallowing/re-shaping it', async () => {
    reportRepo.bulkReview.mockRejectedValue(new Error('db down'));

    await expect(
      service.bulkReview(currentUser, {
        type: SimulationReportSelectorType.REPORT,
        ids: ['r-1'],
        reviewed: true,
      }),
    ).rejects.toThrow();
  });
});
