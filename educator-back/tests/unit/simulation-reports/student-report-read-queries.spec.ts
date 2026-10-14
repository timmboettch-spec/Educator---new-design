import { SimulationReportRepository } from 'src/database/repositories/simulation-report.repository';

const LARGE_JSONB_PROPERTIES = [
  'r.reportData',
  'r.summaryEntries',
  'r.summaryByCategory',
  'r.commonActionTracker',
  'r.communicationAssessment',
  'r.actionScores',
  'r.actionSummary',
  'r.mandatoryActions',
  'r.optionalActions',
  'r.distractorActions',
];

/** A chainable query builder stub that records what the repository asked for. */
function createQueryBuilderSpy() {
  const calls = { select: [] as string[], where: [] as string[] };
  const qb = {
    select: jest.fn((columns: string[]) => {
      calls.select = columns;
      return qb;
    }),
    where: jest.fn((sql: string) => {
      calls.where.push(sql);
      return qb;
    }),
    andWhere: jest.fn((sql: string) => {
      calls.where.push(sql);
      return qb;
    }),
    orderBy: jest.fn(() => qb),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
  };
  const repo = { createQueryBuilder: jest.fn(() => qb) };
  return {
    calls,
    repository: new SimulationReportRepository(
      repo as never as ConstructorParameters<typeof SimulationReportRepository>[0],
    ),
  };
}

describe('Student Report read queries', () => {
  it('the list query selects none of the large jsonb columns', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const repository = new SimulationReportRepository({
      find,
    } as never as ConstructorParameters<typeof SimulationReportRepository>[0]);

    await repository.findListRowsByStudentId('student-1');

    const { select } = find.mock.calls[0][0] as { select: string[] };
    expect(select.length).toBeGreaterThan(0);
    for (const column of LARGE_JSONB_PROPERTIES) {
      expect(select).not.toContain(column.slice(2));
    }
  });

  it('the list query excludes stubs', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const repository = new SimulationReportRepository({
      find,
    } as never as ConstructorParameters<typeof SimulationReportRepository>[0]);

    await repository.findListRowsByStudentId('student-1');

    const { where } = find.mock.calls[0][0] as { where: { reportId: unknown } };
    expect(where.reportId).toBeDefined();
  });

  it('the detail query by report id never selects report_data', async () => {
    const { calls, repository } = createQueryBuilderSpy();

    await repository.findDetailRowByReportIdForStudent('s', 'x');

    expect(calls.select).not.toContain('r.reportData');
    expect(calls.select).toContain('r.summaryEntries');
  });

  it('the detail query by transcript id never selects report_data and excludes stubs', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const repository = new SimulationReportRepository({
      findOne,
    } as never as ConstructorParameters<typeof SimulationReportRepository>[0]);

    await repository.findDetailRowByTranscriptIdForStudent('s', 'x');

    const options = findOne.mock.calls[0][0] as {
      select: string[];
      where: { transcriptId: string; studentId: string; reportId: unknown };
    };
    expect(options.select).not.toContain('reportData');
    expect(options.select).toContain('summaryEntries');
    expect(options.where).toMatchObject({ transcriptId: 'x', studentId: 's' });
    expect(options.where.reportId).toBeDefined();
  });
});
