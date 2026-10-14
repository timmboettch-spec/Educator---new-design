import { ClassRepository } from '../../../src/database/repositories/class.repository';
import { ClassAttentionMeasure, ClassSortField } from '../../../src/class/constants';
import { CommonStatus } from 'src/common/enums/status.enum';

import { activeClassScopeSql, liveClassScopeSql } from 'src/common/utils/class-scope.util';

describe('ClassRepository', () => {
  describe('applyEducatorAccessFilter (via findAllActiveForEducator)', () => {
    const makeQb = () => {
      const qb: Record<string, jest.Mock> = {};
      qb.leftJoin = jest.fn().mockReturnValue(qb);
      qb.addSelect = jest.fn().mockReturnValue(qb);
      qb.leftJoinAndSelect = jest.fn().mockReturnValue(qb);
      qb.where = jest.fn().mockReturnValue(qb);
      qb.andWhere = jest.fn().mockReturnValue(qb);
      qb.orderBy = jest.fn().mockReturnValue(qb);
      qb.getMany = jest.fn().mockResolvedValue([]);
      return qb;
    };

    let qb: ReturnType<typeof makeQb>;
    const repo = { createQueryBuilder: jest.fn() };
    const classRepository = new ClassRepository(repo as never);

    beforeEach(() => {
      qb = makeQb();
      repo.createQueryBuilder.mockReset().mockReturnValue(qb);
    });

    it('filters to classes accessible to the educator (owner or co-instructor)', async () => {
      await classRepository.findAllActiveForEducator('edu-1');

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('c.educator_id = :educatorId'),
        { educatorId: 'edu-1' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('class_educators'), {
        educatorId: 'edu-1',
      });
    });

    it('adds a school_id filter when provided', async () => {
      await classRepository.findAllActiveForEducator('edu-1', 'school-1');

      expect(qb.andWhere).toHaveBeenCalledWith('c.school_id = :schoolId', {
        schoolId: 'school-1',
      });
    });
  });

  describe('getActivityOverviewCounts', () => {
    const repo = { query: jest.fn() };
    const classRepository = new ClassRepository(repo as never);

    beforeEach(() => {
      repo.query.mockReset().mockResolvedValue([
        { metric: 'activeClasses', value: '5' },
        { metric: 'classesClosingSoon', value: '2' },
        { metric: 'studentsInActiveClasses', value: '42' },
        { metric: 'classesWithStudentsNearAvatarLimit', value: '1' },
        { metric: 'classesWithUnreadReports', value: '3' },
        { metric: 'totalUnreadReports', value: '7' },
      ]);
    });

    it('pivots the UNION ALL rows into a typed counts object', async () => {
      const result = await classRepository.getActivityOverviewCounts(
        'edu-1',
        '2026-01-01',
        '2026-01-15',
        2400,
      );

      expect(result).toEqual({
        activeClasses: 5,
        classesClosingSoon: 2,
        studentsInActiveClasses: 42,
        classesWithStudentsNearAvatarLimit: 1,
        classesWithUnreadReports: 3,
        totalUnreadReports: 7,
      });
    });

    it('defaults any missing metric to zero', async () => {
      repo.query.mockResolvedValueOnce([]);
      const result = await classRepository.getActivityOverviewCounts(
        'edu-1',
        '2026-01-01',
        '2026-01-15',
        2400,
      );

      expect(result).toEqual({
        activeClasses: 0,
        classesClosingSoon: 0,
        studentsInActiveClasses: 0,
        classesWithStudentsNearAvatarLimit: 0,
        classesWithUnreadReports: 0,
        totalUnreadReports: 0,
      });
    });

    it('passes educatorId, date bounds, and threshold as positional params, with null for a missing school_id', async () => {
      await classRepository.getActivityOverviewCounts('edu-1', '2026-01-01', '2026-01-15', 2400);

      expect(repo.query).toHaveBeenCalledWith(expect.any(String), [
        'edu-1',
        null,
        '2026-01-01',
        '2026-01-15',
        2400,
      ]);
    });

    it('passes the school_id through when provided', async () => {
      await classRepository.getActivityOverviewCounts(
        'edu-1',
        '2026-01-01',
        '2026-01-15',
        2400,
        'school-1',
      );

      expect(repo.query).toHaveBeenCalledWith(expect.any(String), [
        'edu-1',
        'school-1',
        '2026-01-01',
        '2026-01-15',
        2400,
      ]);
    });

    it('includes the co-instructor access predicate', async () => {
      await classRepository.getActivityOverviewCounts('edu-1', '2026-01-01', '2026-01-15', 2400);
      const [sql] = repo.query.mock.calls[0] as [string];
      expect(sql).toContain('class_educators');
    });

    it('scopes to live classes with status ACTIVE (is_active, active school, Google rule, status)', async () => {
      await classRepository.getActivityOverviewCounts('edu-1', '2026-01-01', '2026-01-15', 2400);
      const [sql] = repo.query.mock.calls[0] as [string];
      expect(sql).toContain(activeClassScopeSql('c'));
      expect(sql).toContain("c.status = 'ACTIVE'");
    });

    it('excludes soft-deleted classes and never uses a status allow-list or bound status parameter', async () => {
      await classRepository.getActivityOverviewCounts('edu-1', '2026-01-01', '2026-01-15', 2400);
      const [sql] = repo.query.mock.calls[0] as [string];
      expect(sql).toContain('c.deleted_at IS NULL');
      expect(sql).not.toContain('c.status IN');
      expect(sql).not.toContain('c.status = $');
    });

    it('requires an active avatar-enabled simulation for the near-limit count', async () => {
      await classRepository.getActivityOverviewCounts('edu-1', '2026-01-01', '2026-01-15', 2400);
      const [sql] = repo.query.mock.calls[0] as [string];
      expect(sql).toContain('csim.is_ai = TRUE');
      expect(sql).toContain('csim.is_active = TRUE AND csim.deleted_at IS NULL');
    });

    it('matches the HH:MM:SS time_remaining format, not a bare integer', async () => {
      await classRepository.getActivityOverviewCounts('edu-1', '2026-01-01', '2026-01-15', 2400);
      const [sql] = repo.query.mock.calls[0] as [string];
      expect(sql).toContain("s.time_remaining ~ '^[0-9]+:[0-9]{2}:[0-9]{2}$'");
    });

    it('bounds the closing-soon window with the caller-supplied date strings', async () => {
      await classRepository.getActivityOverviewCounts('edu-1', '2026-01-01', '2026-01-15', 2400);
      const [sql] = repo.query.mock.calls[0] as [string];
      expect(sql).toContain('end_date BETWEEN $3 AND $4');
    });

    it('every class-based metric reads the single accessible_classes CTE', async () => {
      await classRepository.getActivityOverviewCounts('edu-1', '2026-01-01', '2026-01-15', 2400);
      const [sql] = repo.query.mock.calls[0] as [string];
      expect(sql).toContain('accessible_classes AS (');
      expect(sql).toMatch(/SELECT 'activeClasses'.*\n\s*FROM accessible_classes/);
      expect(sql).toMatch(/SELECT 'classesClosingSoon'.*\n\s*FROM accessible_classes/);
      expect(sql).toMatch(
        /SELECT 'studentsInActiveClasses'.*\n(?:.*\n)*?.*IN \(SELECT id FROM accessible_classes\)/,
      );
      expect(sql).toMatch(
        /SELECT 'classesWithStudentsNearAvatarLimit'.*\n\s*FROM accessible_classes/,
      );
      expect(sql).toContain('WHERE s.class_id IN (SELECT id FROM accessible_classes)');
      expect(sql).toContain(
        "SELECT 'classesWithUnreadReports', COUNT(*)::text FROM unread_reports",
      );
      expect(sql).toContain(
        "SELECT 'totalUnreadReports', COALESCE(SUM(unread_count), 0)::text FROM unread_reports",
      );
    });
  });

  describe('findClasses (lite sort-column safety)', () => {
    const makeQb = () => {
      const qb: Record<string, jest.Mock> = {};
      qb.select = jest.fn().mockReturnValue(qb);
      qb.addSelect = jest.fn().mockReturnValue(qb);
      qb.where = jest.fn().mockReturnValue(qb);
      qb.andWhere = jest.fn().mockReturnValue(qb);
      qb.orderBy = jest.fn().mockReturnValue(qb);
      qb.addOrderBy = jest.fn().mockReturnValue(qb);
      qb.skip = jest.fn().mockReturnValue(qb);
      qb.take = jest.fn().mockReturnValue(qb);
      qb.getCount = jest.fn().mockResolvedValue(0);
      qb.getRawMany = jest.fn().mockResolvedValue([]);
      return qb;
    };

    let qb: ReturnType<typeof makeQb>;
    const repo = { createQueryBuilder: jest.fn() };
    const classRepository = new ClassRepository(repo as never);

    beforeEach(() => {
      qb = makeQb();
      repo.createQueryBuilder.mockReset().mockReturnValue(qb);
    });

    it.each([ClassSortField.STUDENTS, ClassSortField.SIMS, ClassSortField.REPORTS])(
      'lite=true with sortBy=%s falls back to c.created_at instead of the full-only aggregate alias',
      async (field) => {
        await classRepository.findClasses(
          'edu-1',
          { lite: true },
          { field, dir: 'ASC' },
          { skip: 0, take: 10 },
        );

        expect(qb.orderBy).toHaveBeenCalledWith('c.created_at', 'ASC');
      },
    );

    it('lite=false with sortBy=students still orders by the aggregate alias', async () => {
      await classRepository.findClasses(
        'edu-1',
        { lite: false },
        { field: ClassSortField.STUDENTS, dir: 'ASC' },
        { skip: 0, take: 10 },
      );

      expect(qb.orderBy).toHaveBeenCalledWith('students_count', 'ASC');
    });

    it('lite=true with sortBy=className still orders by the real column', async () => {
      await classRepository.findClasses(
        'edu-1',
        { lite: true },
        { field: ClassSortField.CLASS_NAME, dir: 'DESC' },
        { skip: 0, take: 10 },
      );

      expect(qb.orderBy).toHaveBeenCalledWith('c.class_name', 'DESC');
    });

    it('lite=true maps id, name, dates and status without any count fields', async () => {
      qb.getRawMany.mockResolvedValue([
        {
          id: 'c-1',
          class_name: 'Oncology',
          start_date: '2026-01-01',
          end_date: '2026-12-31',
          status: 'INACTIVE',
        },
      ]);

      const { rows } = await classRepository.findClasses(
        'edu-1',
        { lite: true },
        {},
        { skip: 0, take: 10 },
      );

      expect(rows).toEqual([
        {
          id: 'c-1',
          className: 'Oncology',
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          status: 'INACTIVE',
        },
      ]);
    });

    it('lite=false selects the unread-reports subquery and maps it to unreadReportsCount', async () => {
      qb.getRawMany.mockResolvedValue([
        {
          id: 'c-1',
          class_name: 'Oncology',
          start_date: '2026-01-01',
          end_date: '2026-12-31',
          status: 'ACTIVE',
          students_count: '3',
          sims_count: '2',
          reports_count: '5',
          unread_reports_count: '2',
        },
      ]);

      const { rows } = await classRepository.findClasses(
        'edu-1',
        { lite: false },
        {},
        { skip: 0, take: 10 },
      );

      const unreadSelect = qb.addSelect.mock.calls.find(
        ([, alias]) => alias === 'unread_reports_count',
      );
      expect(unreadSelect?.[0]).toContain('sr.viewed_at IS NULL');
      expect(unreadSelect?.[0]).toContain('s.is_active = TRUE');
      expect(rows[0].unreadReportsCount).toBe(2);
    });

    it.each([false, true])(
      'lite=%s applies the live class scope even without a measure',
      async (lite) => {
        await classRepository.findClasses(
          'edu-1',
          { lite },
          { field: undefined, dir: 'ASC' },
          { skip: 0, take: 10 },
        );

        const whereSql = qb.where.mock.calls.map(([sql]) => String(sql)).join(' ');
        expect(whereSql).toContain('is_active = true');
        expect(whereSql).toContain('sch.is_active = true');
        expect(whereSql).toContain('google_course_mappings');
      },
    );

    it('school groups apply the live class scope even without a measure', async () => {
      const groupsQb: Record<string, jest.Mock> = {};
      for (const method of [
        'leftJoin',
        'select',
        'addSelect',
        'where',
        'andWhere',
        'groupBy',
        'addGroupBy',
        'orderBy',
        'offset',
        'limit',
      ]) {
        groupsQb[method] = jest.fn().mockReturnValue(groupsQb);
      }
      groupsQb.getRawOne = jest.fn().mockResolvedValue({ count: '0' });
      groupsQb.getRawMany = jest.fn().mockResolvedValue([]);
      repo.createQueryBuilder.mockReset().mockReturnValue(groupsQb);

      await classRepository.findSchoolGroupsForEducator('edu-1', {}, { skip: 0, take: 10 });

      const whereSql = groupsQb.where.mock.calls.map(([sql]) => String(sql)).join(' ');
      expect(whereSql).toContain('sch.is_active = true');
      expect(whereSql).toContain('google_course_mappings');
    });

    it('school groups apply the class status and start/end date filters to both queries', async () => {
      const groupsQb: Record<string, jest.Mock> = {};
      for (const method of [
        'leftJoin',
        'select',
        'addSelect',
        'where',
        'andWhere',
        'groupBy',
        'addGroupBy',
        'orderBy',
        'offset',
        'limit',
      ]) {
        groupsQb[method] = jest.fn().mockReturnValue(groupsQb);
      }
      groupsQb.getRawOne = jest.fn().mockResolvedValue({ count: '0' });
      groupsQb.getRawMany = jest.fn().mockResolvedValue([]);
      repo.createQueryBuilder.mockReset().mockReturnValue(groupsQb);

      await classRepository.findSchoolGroupsForEducator(
        'edu-1',
        {
          classStatuses: [CommonStatus.ACTIVE, CommonStatus.DRAFT],
          classStartDateFrom: '2026-01-01',
          classEndDateTo: '2026-12-31',
        },
        { skip: 0, take: 10 },
      );

      const calls = groupsQb.andWhere.mock.calls.map(([sql, params]) => [String(sql), params]);
      // Count query + data query each apply the full filter set.
      expect(calls.filter(([sql]) => sql === 'c.status IN (:...statuses)')).toEqual([
        ['c.status IN (:...statuses)', { statuses: [CommonStatus.ACTIVE, CommonStatus.DRAFT] }],
        ['c.status IN (:...statuses)', { statuses: [CommonStatus.ACTIVE, CommonStatus.DRAFT] }],
      ]);
      expect(calls.filter(([sql]) => sql === 'c.start_date >= :startDateFrom')).toEqual([
        ['c.start_date >= :startDateFrom', { startDateFrom: '2026-01-01' }],
        ['c.start_date >= :startDateFrom', { startDateFrom: '2026-01-01' }],
      ]);
      expect(calls.filter(([sql]) => sql === 'c.end_date <= :endDateTo')).toEqual([
        ['c.end_date <= :endDateTo', { endDateTo: '2026-12-31' }],
        ['c.end_date <= :endDateTo', { endDateTo: '2026-12-31' }],
      ]);
    });

    it('school groups add no status or date condition when those filters are omitted', async () => {
      const groupsQb: Record<string, jest.Mock> = {};
      for (const method of [
        'leftJoin',
        'select',
        'addSelect',
        'where',
        'andWhere',
        'groupBy',
        'addGroupBy',
        'orderBy',
        'offset',
        'limit',
      ]) {
        groupsQb[method] = jest.fn().mockReturnValue(groupsQb);
      }
      groupsQb.getRawOne = jest.fn().mockResolvedValue({ count: '0' });
      groupsQb.getRawMany = jest.fn().mockResolvedValue([]);
      repo.createQueryBuilder.mockReset().mockReturnValue(groupsQb);

      await classRepository.findSchoolGroupsForEducator('edu-1', {}, { skip: 0, take: 10 });

      const andWhereSql = groupsQb.andWhere.mock.calls.map(([sql]) => String(sql)).join(' ');
      expect(andWhereSql).not.toContain('c.status IN');
      expect(andWhereSql).not.toContain('c.start_date >=');
      expect(andWhereSql).not.toContain('c.end_date <=');
    });
  });

  describe('live class scope is shared by every class-based read', () => {
    const makeQb = () => {
      const qb: Record<string, jest.Mock> = {};
      for (const method of [
        'select',
        'addSelect',
        'where',
        'andWhere',
        'orderBy',
        'addOrderBy',
        'skip',
        'take',
        'leftJoin',
        'leftJoinAndSelect',
      ]) {
        qb[method] = jest.fn().mockReturnValue(qb);
      }
      qb.getCount = jest.fn().mockResolvedValue(0);
      qb.getMany = jest.fn().mockResolvedValue([]);
      qb.getRawMany = jest.fn().mockResolvedValue([]);
      return qb;
    };

    let qb: ReturnType<typeof makeQb>;
    const repo = { createQueryBuilder: jest.fn() };
    const classRepository = new ClassRepository(repo as never);
    const scope = liveClassScopeSql('c');

    const appliedSql = (): string[] =>
      [...qb.where.mock.calls, ...qb.andWhere.mock.calls].map(([sql]) => String(sql));

    beforeEach(() => {
      qb = makeQb();
      repo.createQueryBuilder.mockReset().mockReturnValue(qb);
    });

    it('findAllActiveForEducator starts from the live scope', async () => {
      await classRepository.findAllActiveForEducator('edu-1');

      expect(qb.where).toHaveBeenCalledWith(scope);
    });

    it.each([
      ['countActiveForEducator', (r: ClassRepository) => r.countActiveForEducator('edu-1')],
      [
        'countActiveNeedingAttentionForEducator',
        (r: ClassRepository) => r.countActiveNeedingAttentionForEducator('edu-1'),
      ],
      [
        'countActiveWithNoStudentsForEducator',
        (r: ClassRepository) => r.countActiveWithNoStudentsForEducator('edu-1'),
      ],
      [
        'countActiveWithNoAssignedSimsForEducator',
        (r: ClassRepository) => r.countActiveWithNoAssignedSimsForEducator('edu-1'),
      ],
    ])('%s applies the live scope and status ACTIVE', async (_name, call) => {
      await call(classRepository);

      expect(appliedSql()).toContain(activeClassScopeSql('c'));
    });

    it('the attention counts add the school filter only when given', async () => {
      await classRepository.countActiveForEducator('edu-1');
      expect(qb.andWhere).not.toHaveBeenCalledWith('c.school_id = :schoolId', expect.anything());

      await classRepository.countActiveForEducator('edu-1', 'school-1');
      expect(qb.andWhere).toHaveBeenCalledWith('c.school_id = :schoolId', {
        schoolId: 'school-1',
      });
    });

    describe('measure filters narrow the live scope, never replace it', () => {
      const run = (measure: ClassAttentionMeasure) =>
        classRepository.findClasses(
          'edu-1',
          { lite: true, measure },
          { dir: 'ASC' },
          { skip: 0, take: 10 },
        );

      it.each(Object.values(ClassAttentionMeasure))(
        'measure=%s keeps the live scope as the base condition',
        async (measure) => {
          await run(measure);

          expect(qb.where).toHaveBeenCalledWith(scope);
          expect(appliedSql().filter((sql) => sql === scope)).toHaveLength(2);
        },
      );

      it.each(Object.values(ClassAttentionMeasure))(
        'measure=%s restricts to status ACTIVE (same scope as the counts)',
        async (measure) => {
          await run(measure);

          expect(qb.andWhere).toHaveBeenCalledWith(activeClassScopeSql('c'));
        },
      );

      it('without a measure the class list keeps the live scope and adds no status condition', async () => {
        await classRepository.findClasses(
          'edu-1',
          { lite: true },
          { dir: 'ASC' },
          { skip: 0, take: 10 },
        );

        expect(qb.where).toHaveBeenCalledWith(scope);
        expect(qb.andWhere).not.toHaveBeenCalledWith(activeClassScopeSql('c'));
      });

      it.each([
        [ClassAttentionMeasure.CLOSING_SOON, 'c.end_date BETWEEN'],
        [ClassAttentionMeasure.NEAR_AVATAR_LIMIT, 'csim.is_ai = TRUE'],
        [ClassAttentionMeasure.NEAR_AVATAR_LIMIT, 'csim.deleted_at IS NULL'],
        [ClassAttentionMeasure.UNREAD_REPORTS, 'sr.viewed_at IS NULL'],
        [ClassAttentionMeasure.NO_STUDENTS, 'NOT EXISTS'],
        [ClassAttentionMeasure.NO_ASSIGNED_SIMS, 'class_simulations cs'],
      ])('measure=%s adds its own condition (%s)', async (measure, fragment) => {
        await run(measure);

        expect(appliedSql().some((sql) => sql.includes(fragment))).toBe(true);
      });
    });

    it('the unread-reports rule ignores soft-deleted students', async () => {
      await classRepository.findClasses(
        'edu-1',
        { lite: true, measure: ClassAttentionMeasure.UNREAD_REPORTS },
        { dir: 'ASC' },
        { skip: 0, take: 10 },
      );

      const unreadSql = appliedSql().find((sql) => sql.includes('sr.viewed_at IS NULL'));
      expect(unreadSql).toContain('s.is_active = TRUE AND s.deleted_at IS NULL');
    });

    it('list counts (students, sims, reports, unread) all ignore soft-deleted rows', async () => {
      await classRepository.findClasses(
        'edu-1',
        { lite: false },
        { dir: 'ASC' },
        { skip: 0, take: 10 },
      );

      const countSelects = qb.addSelect.mock.calls.filter(([, alias]) =>
        ['students_count', 'sims_count', 'reports_count', 'unread_reports_count'].includes(alias),
      );
      expect(countSelects).toHaveLength(4);
      for (const [sql] of countSelects) {
        expect(String(sql)).toContain('deleted_at IS NULL');
      }
    });
  });

  describe('findActiveByIdsWithSchoolForEducator', () => {
    const qb: Record<string, jest.Mock> = {};
    for (const method of ['leftJoinAndSelect', 'where', 'andWhere']) {
      qb[method] = jest.fn().mockReturnValue(qb);
    }
    qb.getMany = jest.fn().mockResolvedValue([{ id: 'c-1' }]);
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const classRepository = new ClassRepository(repo as never);

    afterEach(() => jest.clearAllMocks());

    it('loads every requested active class the educator can access, with its school, in one query', async () => {
      await expect(
        classRepository.findActiveByIdsWithSchoolForEducator(['c-1', 'c-2'], 'edu-1'),
      ).resolves.toEqual([{ id: 'c-1' }]);

      expect(repo.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('c.school', 'school');
      expect(qb.where).toHaveBeenCalledWith('c.id IN (:...ids)', { ids: ['c-1', 'c-2'] });
      expect(qb.andWhere).toHaveBeenCalledWith('c.is_active = true');
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('c.educator_id = :educatorId'),
        { educatorId: 'edu-1' },
      );
    });

    it('skips the query for an empty list', async () => {
      await expect(
        classRepository.findActiveByIdsWithSchoolForEducator([], 'edu-1'),
      ).resolves.toEqual([]);
      expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
