import { SimulationReportRepository } from '../../../src/database/repositories/simulation-report.repository';
import { activeClassScopeSql, liveClassScopeSql } from 'src/common/utils/class-scope.util';
import { ReportListSortField, ReportReviewStatus } from 'src/common/constants';
import { SimulationReportSelectorType } from 'src/common/constants/simulation-report.constants';

describe('SimulationReportRepository', () => {
  const makeQb = () => {
    const qb: Record<string, jest.Mock> = {};
    qb.innerJoin = jest.fn().mockReturnValue(qb);
    qb.leftJoin = jest.fn().mockReturnValue(qb);
    qb.select = jest.fn().mockReturnValue(qb);
    qb.addSelect = jest.fn().mockReturnValue(qb);
    qb.where = jest.fn().mockReturnValue(qb);
    qb.andWhere = jest.fn().mockReturnValue(qb);
    qb.groupBy = jest.fn().mockReturnValue(qb);
    qb.having = jest.fn().mockReturnValue(qb);
    qb.orderBy = jest.fn().mockReturnValue(qb);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    qb.getRawOne = jest.fn().mockResolvedValue(undefined);
    qb.clone = jest.fn().mockReturnValue(qb);
    qb.offset = jest.fn().mockReturnValue(qb);
    qb.limit = jest.fn().mockReturnValue(qb);
    qb.addOrderBy = jest.fn().mockReturnValue(qb);
    qb.getCount = jest.fn().mockResolvedValue(0);
    // bulkReview's subquery + UPDATE chain (built entirely through QueryBuilder, no raw SQL):
    qb.subQuery = jest.fn().mockReturnValue(qb);
    qb.from = jest.fn().mockReturnValue(qb);
    qb.getQuery = jest.fn().mockReturnValue('SUBQUERY_SQL');
    qb.update = jest.fn().mockReturnValue(qb);
    qb.set = jest.fn().mockReturnValue(qb);
    qb.setParameters = jest.fn().mockReturnValue(qb);
    qb.returning = jest.fn().mockReturnValue(qb);
    qb.execute = jest.fn().mockResolvedValue({ raw: [] });
    return qb;
  };

  let qb: ReturnType<typeof makeQb>;
  const repo = {
    createQueryBuilder: jest.fn(),
    query: jest.fn(),
    findOneBy: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
  };
  const repository = new SimulationReportRepository(repo as never);

  beforeEach(() => {
    qb = makeQb();
    repo.createQueryBuilder.mockReset().mockReturnValue(qb);
    repo.query.mockReset().mockResolvedValue([]);
    repo.findOneBy.mockReset();
  });

  describe('getAttentionCountsByEducator', () => {
    it('scopes to owner OR co-instructor classes, matching the class-list access scope', async () => {
      await repository.getAttentionCountsByEducator('edu-1');

      expect(qb.where).toHaveBeenCalledWith(
        expect.stringContaining('c.educator_id = :educatorId'),
        { educatorId: 'edu-1' },
      );
      const [whereSql] = qb.where.mock.calls[0] as [string];
      expect(whereSql).toContain('class_educators');
      expect(whereSql).toContain('ce.educator_id = :educatorId');
    });

    it('applies the live-class scope with status ACTIVE so unread counts match the tiles', async () => {
      await repository.getAttentionCountsByEducator('edu-1');

      expect(qb.andWhere).toHaveBeenCalledWith(activeClassScopeSql('c'));
    });

    it('only counts reports of active students', async () => {
      await repository.getAttentionCountsByEducator('edu-1');

      const joins = qb.innerJoin.mock.calls.map((call) => call.join(' '));
      expect(joins.some((j) => j.includes('s.is_active = TRUE'))).toBe(true);
    });

    it('adds the school filter only when a schoolId is given', async () => {
      await repository.getAttentionCountsByEducator('edu-1');
      expect(qb.andWhere).not.toHaveBeenCalledWith('c.school_id = :schoolId', expect.anything());

      await repository.getAttentionCountsByEducator('edu-1', 'school-1');
      expect(qb.andWhere).toHaveBeenCalledWith('c.school_id = :schoolId', {
        schoolId: 'school-1',
      });
    });
  });

  describe('getAttentionCountsByClass / getAttentionCountsByClassIds', () => {
    it('getAttentionCountsByClass counts only active students', async () => {
      await repository.getAttentionCountsByClass('class-1');

      expect(qb.andWhere).toHaveBeenCalledWith('s.is_active = :isActive', { isActive: true });
    });

    it('getAttentionCountsByClassIds counts only active students', async () => {
      await repository.getAttentionCountsByClassIds(['class-1', 'class-2']);

      expect(qb.andWhere).toHaveBeenCalledWith('s.is_active = :isActive', { isActive: true });
    });

    it('getAttentionCountsByClassIds skips the query for an empty id list', async () => {
      await expect(repository.getAttentionCountsByClassIds([])).resolves.toEqual([]);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  describe('findReportsForListing live scope', () => {
    const sort = { field: ReportListSortField.COMPLETED_AT, direction: 'DESC' as const };
    const pagination = { skip: 0, take: 10 };

    it('starts from the live-class scope (no status condition)', async () => {
      await repository.findReportsForListing('edu-1', {}, sort, pagination);

      expect(qb.where).toHaveBeenCalledWith(liveClassScopeSql('c'));
    });

    it('keeps the owner-or-co-instructor scope alongside the live scope', async () => {
      await repository.findReportsForListing('edu-1', {}, sort, pagination);

      expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('class_educators'), {
        educatorId: 'edu-1',
      });
    });

    it('does not rely on the class join condition for is_active any more', async () => {
      await repository.findReportsForListing('edu-1', {}, sort, pagination);

      const classJoin = qb.innerJoin.mock.calls.find(([table]) => table === 'classes');
      expect(String(classJoin?.[2])).not.toContain('is_active');
      const studentJoin = qb.innerJoin.mock.calls.find(([table]) => table === 'students');
      expect(String(studentJoin?.[2])).toContain('s.is_active = TRUE');
    });
  });

  describe('findReportsForListing columns and Report scope', () => {
    const sort = { field: ReportListSortField.SCORE, direction: 'DESC' as const };
    const pagination = { skip: 20, take: 10 };

    it('selects typed columns only and never report_data', async () => {
      await repository.findReportsForListing('edu-1', {}, sort, pagination);

      const selected = [
        ...qb.select.mock.calls.map(([expr]) => String(expr)),
        ...qb.addSelect.mock.calls.map(([expr]) => String(expr)),
      ];
      expect(selected).toEqual(
        expect.arrayContaining([
          'sr.mode',
          'sr.score',
          'sr.score_json',
          'sr.performance_label',
          'sr.total_time_seconds',
          'sr.transcript_id',
        ]),
      );
      expect(selected.join(' ')).not.toContain('report_data');
    });

    it('lists every Attempt, not only the earliest of each student and Simulation', async () => {
      await repository.findReportsForListing('edu-1', {}, sort, pagination);

      const clauses = qb.andWhere.mock.calls.map(([sql]) => String(sql));
      expect(clauses.join(' ')).not.toContain('earlier');
    });

    it('applies the filters, the column sort with the id tiebreaker and the page window in SQL', async () => {
      await repository.findReportsForListing(
        'edu-1',
        { studentIds: ['s-1'], reviewStatus: ReportReviewStatus.UNREAD },
        sort,
        pagination,
      );

      expect(qb.andWhere).toHaveBeenCalledWith('sr.student_id IN (:...studentIds)', {
        studentIds: ['s-1'],
      });
      expect(qb.andWhere).toHaveBeenCalledWith('sr.viewed_at IS NULL');
      expect(String(qb.orderBy.mock.calls[0][0])).toContain('sr.score');
      expect(String(qb.orderBy.mock.calls[0][0])).not.toContain('report_data');
      expect(qb.addOrderBy).toHaveBeenCalledWith('sr.id', 'ASC');
      expect(qb.offset).toHaveBeenCalledWith(20);
      expect(qb.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('bulkReview', () => {
    const baseParams = {
      ids: ['id-1', 'id-2'],
      reviewed: true,
      educatorId: 'edu-1',
    };

    it.each([
      [SimulationReportSelectorType.REPORT, 'sr.id'],
      [SimulationReportSelectorType.STUDENT, 'sr.student_id'],
      [SimulationReportSelectorType.SIMULATION, 'sr.scenario_id'],
      [SimulationReportSelectorType.CLASS, 's.class_id'],
    ])("filters on %s's selector column (%s)", async (selectorType, expectedColumn) => {
      await repository.bulkReview({ ...baseParams, selectorType });

      // Scope + selector predicate are applied inside the subquery, never as a separate query.
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('c.educator_id = :educatorId'),
        { educatorId: 'edu-1' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(`${expectedColumn}::text = ANY(:ids::text[])`, {
        ids: ['id-1', 'id-2'],
      });

      // The UPDATE is scoped to that subquery's result set, built via QueryBuilder (no raw SQL).
      expect(qb.update).toHaveBeenCalledWith(expect.anything());
      expect(qb.where).toHaveBeenCalledWith('id IN (SUBQUERY_SQL)');
      expect(qb.setParameters).toHaveBeenCalledWith({ educatorId: 'edu-1', ids: ['id-1', 'id-2'] });
      expect(qb.execute).toHaveBeenCalledTimes(1);
      expect(repo.query).not.toHaveBeenCalled();
    });

    it('sets viewed_at/viewed_by to NULL when reviewed is false', async () => {
      await repository.bulkReview({
        ...baseParams,
        reviewed: false,
        selectorType: SimulationReportSelectorType.REPORT,
      });

      expect(qb.set).toHaveBeenCalledWith({ viewedAt: null, viewedBy: null });
    });

    it('sets viewed_at to now and viewed_by to the caller when reviewed is true', async () => {
      await repository.bulkReview({
        ...baseParams,
        reviewed: true,
        selectorType: SimulationReportSelectorType.REPORT,
      });

      expect(qb.set).toHaveBeenCalledWith({ viewedAt: expect.any(Date), viewedBy: 'edu-1' });
    });

    it('returns exactly what the UPDATE ... RETURNING clause gives back', async () => {
      const rows = [{ id: 'id-1', student_id: 's-1', scenario_id: 'sim-1', class_id: 'c-1' }];
      qb.execute.mockResolvedValue({ raw: rows });

      const result = await repository.bulkReview({
        ...baseParams,
        selectorType: SimulationReportSelectorType.REPORT,
      });

      expect(result).toBe(rows);
    });

    it('scopes the subquery to the live class scope', async () => {
      await repository.bulkReview({
        ...baseParams,
        selectorType: SimulationReportSelectorType.CLASS,
      });

      expect(qb.andWhere).toHaveBeenCalledWith(liveClassScopeSql('c'));
      expect(qb.andWhere).not.toHaveBeenCalledWith('c.is_active = TRUE');
    });
  });

  describe('insertAttemptIfAbsent', () => {
    const row = { studentId: 'stu-uuid', transcriptId: 'tr-1' } as never;

    beforeEach(() => {
      qb.insert = jest.fn().mockReturnValue(qb);
      qb.into = jest.fn().mockReturnValue(qb);
      qb.values = jest.fn().mockReturnValue(qb);
      qb.orIgnore = jest.fn().mockReturnValue(qb);
    });

    it('inserts with ON CONFLICT DO NOTHING and returns the inserted row', async () => {
      const inserted = { id: 'row-1' };
      qb.execute.mockResolvedValue({ raw: [{ id: 'row-1' }] });
      repo.findOneBy.mockResolvedValue(inserted);

      await expect(repository.insertAttemptIfAbsent(row)).resolves.toBe(inserted);

      expect(qb.values).toHaveBeenCalledWith(row);
      expect(qb.orIgnore).toHaveBeenCalled();
      expect(qb.returning).toHaveBeenCalledWith('id');
      expect(repo.findOneBy).toHaveBeenCalledWith({ id: 'row-1' });
    });

    it('returns null when the transcript already exists (conflict, nothing inserted)', async () => {
      qb.execute.mockResolvedValue({ raw: [] });

      await expect(repository.insertAttemptIfAbsent(row)).resolves.toBeNull();

      expect(repo.findOneBy).not.toHaveBeenCalled();
    });
  });

  describe('findAssessmentAttemptsByStudentAndScenario', () => {
    it("filters to the student's Assessment-mode Attempts for the scenario", async () => {
      repo.find.mockResolvedValue([]);

      await repository.findAssessmentAttemptsByStudentAndScenario('stu-uuid', 'sc-1');

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { studentId: 'stu-uuid', scenarioId: 'sc-1', mode: 'Assessment' },
        }),
      );
    });

    it('orders newest first by created_at, then id', async () => {
      const rows = [{ id: 'b' }, { id: 'a' }];
      repo.find.mockResolvedValue(rows);

      await expect(
        repository.findAssessmentAttemptsByStudentAndScenario('stu-uuid', 'sc-1'),
      ).resolves.toBe(rows);

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ order: { createdAt: 'DESC', id: 'DESC' } }),
      );
    });
  });

  describe('countAssessmentAttempts', () => {
    it("counts the student's Assessment-mode Attempts for the scenario from the typed mode column", async () => {
      repo.count.mockResolvedValue(2);

      await expect(repository.countAssessmentAttempts('stu-uuid', 'sc-1')).resolves.toBe(2);

      expect(repo.count).toHaveBeenCalledWith({
        where: { studentId: 'stu-uuid', scenarioId: 'sc-1', mode: 'Assessment' },
      });
    });
  });

  describe('getAttemptTotalsByStudentId', () => {
    it('sums total_time_seconds and counts every stored Attempt of the student', async () => {
      qb.getRawOne.mockResolvedValue({ attemptCount: '3', totalSeconds: '640.5' });

      await expect(repository.getAttemptTotalsByStudentId('stu-uuid')).resolves.toEqual({
        attemptCount: 3,
        totalSeconds: 640.5,
      });

      expect(qb.where).toHaveBeenCalledWith('sr.student_id = :studentId', {
        studentId: 'stu-uuid',
      });
    });

    it('returns zeros for a student with no Attempts', async () => {
      qb.getRawOne.mockResolvedValue({ attemptCount: '0', totalSeconds: '0' });

      await expect(repository.getAttemptTotalsByStudentId('stu-uuid')).resolves.toEqual({
        attemptCount: 0,
        totalSeconds: 0,
      });
    });
  });
});
