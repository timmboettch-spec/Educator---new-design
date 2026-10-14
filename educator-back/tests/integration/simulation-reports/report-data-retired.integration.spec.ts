import { Repository, getMetadataArgsStorage } from 'typeorm';
import { SimulationReport } from '../../../src/database/entities';
import { SimulationReportRepository } from '../../../src/database/repositories/simulation-report.repository';
import { ReportModeType } from '../../../src/common/constants';

const STUDENT_ID = 'student-uuid';
const TAG = 'RD-RETIRED';

/**
 * `simulation_reports.report_data` is retired: the entity maps no such column (the database default
 * fills it), so inserts never supply it and reads never return it. The database is mocked.
 */
describe('Retired report_data (Integration)', () => {
  let qb: Record<string, jest.Mock>;
  let ormRepo: Record<string, jest.Mock>;
  let repository: SimulationReportRepository;

  beforeEach(() => {
    qb = {};
    for (const method of [
      'insert',
      'into',
      'values',
      'orIgnore',
      'returning',
      'select',
      'where',
      'andWhere',
      'orderBy',
      'addOrderBy',
    ]) {
      qb[method] = jest.fn().mockReturnValue(qb);
    }
    qb.execute = jest.fn();
    qb.getMany = jest.fn();
    qb.getOne = jest.fn();
    ormRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOneBy: jest.fn(),
      count: jest.fn(),
    };
    repository = new SimulationReportRepository(ormRepo as unknown as Repository<SimulationReport>);
  });

  it('gives a new Report report_data = {} from the database, without the code supplying it', async () => {
    const columns = getMetadataArgsStorage()
      .filterColumns(SimulationReport)
      .map((c) => ({ property: c.propertyName, name: c.options.name ?? c.propertyName }));
    expect(columns.length).toBeGreaterThan(0);
    expect(columns.map((c) => c.name)).not.toContain('report_data');
    expect(columns.map((c) => c.property)).not.toContain('reportData');

    qb.execute.mockResolvedValue({ raw: [{ id: 'inserted-id' }] });
    ormRepo.findOneBy.mockResolvedValue({ id: 'inserted-id' });
    const row = {
      studentId: STUDENT_ID,
      reportId: `${TAG}-report`,
      transcriptId: `${TAG}-transcript`,
      scenarioId: `${TAG}-scenario`,
      mode: ReportModeType.PRACTICE,
      score: 70,
    };

    const inserted = await repository.insertAttemptIfAbsent(row as never);

    expect(qb.into).toHaveBeenCalledWith(SimulationReport);
    expect(qb.values).toHaveBeenCalledWith(row);
    const values = qb.values.mock.calls[0][0] as Record<string, unknown>;
    expect(values).not.toHaveProperty('reportData');
    expect(values).not.toHaveProperty('report_data');
    expect(ormRepo.findOneBy).toHaveBeenCalledWith({ id: 'inserted-id' });
    expect(inserted).toEqual({ id: 'inserted-id' });
  });

  it('never returns a reportData key from reads', async () => {
    qb.getMany.mockResolvedValue([{ id: 'r1', reportId: `${TAG}-report` }]);
    qb.getOne.mockResolvedValue({ id: 'r1', reportId: `${TAG}-report` });

    const rows = await repository.findReportRowsByStudentIds([STUDENT_ID]);
    const detail = await repository.findDetailRowByReportId(`${TAG}-report`);

    const selected = qb.select.mock.calls.flatMap((call) => call[0] as string[]);
    expect(selected.length).toBeGreaterThan(0);
    for (const column of selected) {
      expect(column).not.toMatch(/report_?data/i);
    }
    expect(qb.andWhere).toHaveBeenCalledWith('sr.student_id = ANY(:studentIds::uuid[])', {
      studentIds: [STUDENT_ID],
    });
    expect(qb.where).toHaveBeenCalledWith('r.report_id = :reportId', {
      reportId: `${TAG}-report`,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('reportData');
    expect(detail).not.toHaveProperty('reportData');
  });

  it('reads the mode column of a row whose retained report_data says otherwise', async () => {
    ormRepo.count.mockResolvedValue(0);

    await expect(repository.countAssessmentAttempts(STUDENT_ID, `${TAG}-scenario`)).resolves.toBe(
      0,
    );

    expect(ormRepo.count).toHaveBeenCalledWith({
      where: {
        studentId: STUDENT_ID,
        scenarioId: `${TAG}-scenario`,
        mode: ReportModeType.ASSESSMENT,
      },
    });
    expect(JSON.stringify(ormRepo.count.mock.calls)).not.toMatch(/report_?data/i);
  });
});
