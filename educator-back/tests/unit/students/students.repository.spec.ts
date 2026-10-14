import { StudentRepository } from '../../../src/database/repositories/students.repository';
import { StudentCodeStatus, StudentSortField } from '../../../src/students/students.constants';
import { CommonStatus } from '../../../src/common/enums/status.enum';

describe('StudentRepository', () => {
  describe('findStudents (lite sort-column safety + full-shape mapping)', () => {
    const makeQb = () => {
      const qb: Record<string, jest.Mock> = {};
      qb.select = jest.fn().mockReturnValue(qb);
      qb.addSelect = jest.fn().mockReturnValue(qb);
      qb.leftJoin = jest.fn().mockReturnValue(qb);
      qb.innerJoin = jest.fn().mockReturnValue(qb);
      qb.where = jest.fn().mockReturnValue(qb);
      qb.andWhere = jest.fn().mockReturnValue(qb);
      qb.orderBy = jest.fn().mockReturnValue(qb);
      qb.addOrderBy = jest.fn().mockReturnValue(qb);
      qb.offset = jest.fn().mockReturnValue(qb);
      qb.limit = jest.fn().mockReturnValue(qb);
      qb.getCount = jest.fn().mockResolvedValue(0);
      qb.getRawMany = jest.fn().mockResolvedValue([]);
      return qb;
    };

    let qb: ReturnType<typeof makeQb>;
    const repo = { createQueryBuilder: jest.fn() };
    const studentRepository = new StudentRepository(repo as never);

    beforeEach(() => {
      qb = makeQb();
      repo.createQueryBuilder.mockReset().mockReturnValue(qb);
    });

    it.each([StudentSortField.REPORTS, StudentSortField.CODE_STATUS])(
      'lite=true with sortBy=%s falls back to s.created_at instead of the full-only alias',
      async (field) => {
        await studentRepository.findStudents(
          'edu-1',
          { lite: true },
          { field, dir: 'ASC' },
          { skip: 0, take: 10 },
        );

        expect(qb.orderBy).toHaveBeenCalledWith('s.created_at', 'ASC');
      },
    );

    it('lite=true with sortBy=studentCode still orders by the real column', async () => {
      await studentRepository.findStudents(
        'edu-1',
        { lite: true },
        { field: StudentSortField.STUDENT_CODE, dir: 'DESC' },
        { skip: 0, take: 10 },
      );

      expect(qb.orderBy).toHaveBeenCalledWith('s.student_id', 'DESC');
    });

    it.each([
      [StudentSortField.NAME, 'gsm.google_name'],
      [StudentSortField.SUBMISSION_DATE, 's.submission_date'],
      [StudentSortField.STATUS, 's.status'],
      [StudentSortField.IS_ACTIVE, 's.is_active'],
    ])(
      'sortBy=%s orders by %s on both branches (not subject to the lite-only fallback)',
      async (field, column) => {
        await studentRepository.findStudents(
          'edu-1',
          { lite: true },
          { field, dir: 'ASC' },
          { skip: 0, take: 10 },
        );
        expect(qb.orderBy).toHaveBeenCalledWith(column, 'ASC');

        await studentRepository.findStudents(
          'edu-1',
          { lite: false },
          { field, dir: 'DESC' },
          { skip: 0, take: 10 },
        );
        expect(qb.orderBy).toHaveBeenCalledWith(column, 'DESC');
      },
    );

    it.each([
      [
        StudentSortField.SIMS_COMPLETED,
        `CASE WHEN s.sims_completed ~ '^[0-9]+$' THEN s.sims_completed::int ELSE 0 END`,
      ],
      [
        StudentSortField.TIME_SPENT,
        `CASE WHEN s.time_spent ~ '^[0-9]+:[0-5][0-9]:[0-5][0-9]$' THEN EXTRACT(EPOCH FROM s.time_spent::interval) ELSE 0 END`,
      ],
      [
        StudentSortField.TIME_REMAINING,
        `CASE WHEN s.time_remaining ~ '^[0-9]+:[0-5][0-9]:[0-5][0-9]$' THEN EXTRACT(EPOCH FROM s.time_remaining::interval) ELSE 0 END`,
      ],
    ])(
      'sortBy=%s orders by a regex-guarded numeric cast, not the raw varchar column (avoids lexicographic sort)',
      async (field, expectedSql) => {
        await studentRepository.findStudents(
          'edu-1',
          { lite: true },
          { field, dir: 'ASC' },
          { skip: 0, take: 10 },
        );
        expect(qb.orderBy).toHaveBeenCalledWith(expectedSql, 'ASC');

        await studentRepository.findStudents(
          'edu-1',
          { lite: false },
          { field, dir: 'DESC' },
          { skip: 0, take: 10 },
        );
        expect(qb.orderBy).toHaveBeenCalledWith(expectedSql, 'DESC');
      },
    );

    // Postgres' `interval` cast hard-errors on an out-of-range MM/SS (e.g. '05:60:00'), so the
    // regex guard must reject those before the cast ever runs, not just enforce digit shape.
    describe('time_spent/time_remaining sort regex rejects out-of-range MM/SS', () => {
      const pattern = /^[0-9]+:[0-5][0-9]:[0-5][0-9]$/;

      it.each(['05:60:00', '05:99:00', '05:00:60'])(
        'rejects %s (minutes or seconds >= 60, right shape but invalid for ::interval)',
        (value) => {
          expect(pattern.test(value)).toBe(false);
        },
      );

      it.each(['00:00:00', '05:59:59', '123:45:06'])('accepts %s (valid HH:MM:SS)', (value) => {
        expect(pattern.test(value)).toBe(true);
      });
    });

    it('lite=true never selects the reports_count/code_status aggregates', async () => {
      await studentRepository.findStudents(
        'edu-1',
        { lite: true },
        { dir: 'ASC' },
        { skip: 0, take: 10 },
      );

      const addSelectAliases = qb.addSelect.mock.calls.map((call) => call[1]);
      expect(addSelectAliases).not.toContain('reports_count');
      expect(addSelectAliases).not.toContain('code_status');
    });

    it('lite=false with sortBy=reports still orders by the aggregate alias', async () => {
      await studentRepository.findStudents(
        'edu-1',
        { lite: false },
        { field: StudentSortField.REPORTS, dir: 'ASC' },
        { skip: 0, take: 10 },
      );

      expect(qb.orderBy).toHaveBeenCalledWith('reports_count', 'ASC');
    });

    it('lite=false with sortBy=codeStatus still orders by the derived alias', async () => {
      await studentRepository.findStudents(
        'edu-1',
        { lite: false },
        { field: StudentSortField.CODE_STATUS, dir: 'DESC' },
        { skip: 0, take: 10 },
      );

      expect(qb.orderBy).toHaveBeenCalledWith('code_status', 'DESC');
    });

    it('lite=false maps timeSpent/timeRemaining/reportsCount/codeStatus from the raw row', async () => {
      qb.getRawMany.mockResolvedValue([
        {
          id: 's1',
          student_id: 'BIO-4ZPT',
          class_id: 'class-1',
          school_id: 'school-1',
          status: CommonStatus.ACTIVE,
          is_active: true,
          submission_date: '2026-01-15',
          sims_completed: '3',
          score: '87.50',
          time_spent: '2 hours 15 minutes',
          time_remaining: '45 minutes',
          reports_count: '4',
          code_status: StudentCodeStatus.ACTIVE,
          name: 'Ava',
          email: 'ava@example.com',
        },
      ]);

      const result = await studentRepository.findStudents(
        'edu-1',
        { lite: false },
        { dir: 'ASC' },
        { skip: 0, take: 10 },
      );

      expect(result.rows[0]).toMatchObject({
        timeSpent: '2 hours 15 minutes',
        timeRemaining: '45 minutes',
        reportsCount: 4,
        codeStatus: StudentCodeStatus.ACTIVE,
        score: 87.5,
      });
    });

    it('lite=false maps codeStatus REVOKED when the raw row reports a revoked code', async () => {
      qb.getRawMany.mockResolvedValue([
        {
          id: 's1',
          student_id: '',
          class_id: null,
          school_id: null,
          status: CommonStatus.ACTIVE,
          is_active: true,
          submission_date: null,
          sims_completed: null,
          score: null,
          time_spent: null,
          time_remaining: null,
          reports_count: '0',
          code_status: StudentCodeStatus.REVOKED,
          name: null,
          email: null,
        },
      ]);

      const result = await studentRepository.findStudents(
        'edu-1',
        { lite: false },
        { dir: 'ASC' },
        { skip: 0, take: 10 },
      );

      expect(result.rows[0].codeStatus).toBe(StudentCodeStatus.REVOKED);
    });

    it('lite=true still maps only id/studentId/name', async () => {
      qb.getRawMany.mockResolvedValue([{ id: 's1', student_id: 'BIO-4ZPT', name: 'Ava' }]);

      const result = await studentRepository.findStudents(
        'edu-1',
        { lite: true },
        { dir: 'ASC' },
        { skip: 0, take: 10 },
      );

      expect(result.rows).toEqual([{ id: 's1', studentId: 'BIO-4ZPT', name: 'Ava' }]);
    });
  });

  describe('findStudents (search)', () => {
    const makeQb = () => {
      const qb: Record<string, jest.Mock> = {};
      qb.select = jest.fn().mockReturnValue(qb);
      qb.addSelect = jest.fn().mockReturnValue(qb);
      qb.leftJoin = jest.fn().mockReturnValue(qb);
      qb.innerJoin = jest.fn().mockReturnValue(qb);
      qb.where = jest.fn().mockReturnValue(qb);
      qb.andWhere = jest.fn().mockReturnValue(qb);
      qb.orderBy = jest.fn().mockReturnValue(qb);
      qb.addOrderBy = jest.fn().mockReturnValue(qb);
      qb.offset = jest.fn().mockReturnValue(qb);
      qb.limit = jest.fn().mockReturnValue(qb);
      qb.getCount = jest.fn().mockResolvedValue(0);
      qb.getRawMany = jest.fn().mockResolvedValue([]);
      return qb;
    };

    let qb: ReturnType<typeof makeQb>;
    const repo = { createQueryBuilder: jest.fn() };
    const studentRepository = new StudentRepository(repo as never);

    beforeEach(() => {
      qb = makeQb();
      repo.createQueryBuilder.mockReset().mockReturnValue(qb);
    });

    it('adds an ILIKE condition on student_id, wildcard-wrapped, for the lite branch', async () => {
      await studentRepository.findStudents(
        'edu-1',
        { lite: true, search: 'bio-4z' },
        { dir: 'ASC' },
        { skip: 0, take: 10 },
      );

      expect(qb.andWhere).toHaveBeenCalledWith('s.student_id ILIKE :search', {
        search: '%bio-4z%',
      });
    });

    it('adds an ILIKE condition on student_id, wildcard-wrapped, for the full branch', async () => {
      await studentRepository.findStudents(
        'edu-1',
        { lite: false, search: 'bio-4z' },
        { dir: 'ASC' },
        { skip: 0, take: 10 },
      );

      expect(qb.andWhere).toHaveBeenCalledWith('s.student_id ILIKE :search', {
        search: '%bio-4z%',
      });
    });

    it('never adds the search condition when search is omitted', async () => {
      await studentRepository.findStudents(
        'edu-1',
        { lite: false },
        { dir: 'ASC' },
        { skip: 0, take: 10 },
      );

      const searchCalls = qb.andWhere.mock.calls.filter(
        (call) => call[0] === 's.student_id ILIKE :search',
      );
      expect(searchCalls).toHaveLength(0);
    });

    it('never adds the search condition for an empty string', async () => {
      await studentRepository.findStudents(
        'edu-1',
        { lite: false, search: '' },
        { dir: 'ASC' },
        { skip: 0, take: 10 },
      );

      const searchCalls = qb.andWhere.mock.calls.filter(
        (call) => call[0] === 's.student_id ILIKE :search',
      );
      expect(searchCalls).toHaveLength(0);
    });

    it('escapes literal % and _ in the search input before wildcard-wrapping it', async () => {
      await studentRepository.findStudents(
        'edu-1',
        { lite: false, search: 'a%b_c' },
        { dir: 'ASC' },
        { skip: 0, take: 10 },
      );

      expect(qb.andWhere).toHaveBeenCalledWith('s.student_id ILIKE :search', {
        search: '%a\\%b\\_c%',
      });
    });

    it('combines search with the other filters (classIds/schoolIds/isActive)', async () => {
      await studentRepository.findStudents(
        'edu-1',
        {
          lite: false,
          search: 'bio',
          classIds: ['class-1'],
          schoolIds: ['school-1'],
          isActive: true,
        },
        { dir: 'ASC' },
        { skip: 0, take: 10 },
      );

      expect(qb.andWhere).toHaveBeenCalledWith('s.student_id ILIKE :search', { search: '%bio%' });
      expect(qb.andWhere).toHaveBeenCalledWith('s.class_id IN (:...classIds)', {
        classIds: ['class-1'],
      });
      expect(qb.andWhere).toHaveBeenCalledWith('s.school_id IN (:...schoolIds)', {
        schoolIds: ['school-1'],
      });
      expect(qb.andWhere).toHaveBeenCalledWith('s.is_active = :isActive', { isActive: true });
    });
  });

  describe('findStudents (pagination — regression for the join/skip-take LIMIT bug)', () => {
    // TypeORM's `createLimitOffsetExpression()` only turns `.skip()/.take()` into a real SQL
    // LIMIT/OFFSET on `getRawMany()` when the query has zero joins. Both branches here always
    // join (`classes` for the owner/co-instructor filter, `google_student_mappings` for the
    // roster name), so `.skip()/.take()` would silently no-op — `.offset()/.limit()` must be
    // used instead, since those bypass that guard.
    const makeQb = () => {
      const qb: Record<string, jest.Mock> = {};
      qb.select = jest.fn().mockReturnValue(qb);
      qb.addSelect = jest.fn().mockReturnValue(qb);
      qb.leftJoin = jest.fn().mockReturnValue(qb);
      qb.innerJoin = jest.fn().mockReturnValue(qb);
      qb.where = jest.fn().mockReturnValue(qb);
      qb.andWhere = jest.fn().mockReturnValue(qb);
      qb.orderBy = jest.fn().mockReturnValue(qb);
      qb.addOrderBy = jest.fn().mockReturnValue(qb);
      qb.skip = jest.fn().mockReturnValue(qb);
      qb.take = jest.fn().mockReturnValue(qb);
      qb.offset = jest.fn().mockReturnValue(qb);
      qb.limit = jest.fn().mockReturnValue(qb);
      qb.getCount = jest.fn().mockResolvedValue(0);
      qb.getRawMany = jest.fn().mockResolvedValue([]);
      return qb;
    };

    let qb: ReturnType<typeof makeQb>;
    const repo = { createQueryBuilder: jest.fn() };
    const studentRepository = new StudentRepository(repo as never);

    beforeEach(() => {
      qb = makeQb();
      repo.createQueryBuilder.mockReset().mockReturnValue(qb);
    });

    it('lite branch calls offset()/limit() with the pagination values, not skip()/take()', async () => {
      await studentRepository.findStudents(
        'edu-1',
        { lite: true },
        { dir: 'ASC' },
        { skip: 20, take: 5 },
      );

      expect(qb.offset).toHaveBeenCalledWith(20);
      expect(qb.limit).toHaveBeenCalledWith(5);
      expect(qb.skip).not.toHaveBeenCalled();
      expect(qb.take).not.toHaveBeenCalled();
    });

    it('full branch calls offset()/limit() with the pagination values, not skip()/take()', async () => {
      await studentRepository.findStudents(
        'edu-1',
        { lite: false },
        { dir: 'ASC' },
        { skip: 40, take: 1 },
      );

      expect(qb.offset).toHaveBeenCalledWith(40);
      expect(qb.limit).toHaveBeenCalledWith(1);
      expect(qb.skip).not.toHaveBeenCalled();
      expect(qb.take).not.toHaveBeenCalled();
    });
  });

  describe('iterateStudentCodesByClass (keyset-batched export stream)', () => {
    const makeQb = () => {
      const qb: Record<string, jest.Mock> = {};
      for (const m of [
        'select',
        'addSelect',
        'leftJoin',
        'innerJoin',
        'where',
        'andWhere',
        'orderBy',
        'addOrderBy',
        'limit',
      ]) {
        qb[m] = jest.fn().mockReturnValue(qb);
      }
      qb.getRawMany = jest.fn();
      return qb;
    };
    const row = (id: string, createdAt: string) => ({
      id,
      student_id: `BIO-${id}`,
      created_at_cursor: createdAt,
      name: id === '2' ? 'Ava Thompson' : null,
    });

    const repo = { createQueryBuilder: jest.fn() };
    const studentRepository = new StudentRepository(repo as never);
    const drain = async (gen: AsyncIterable<unknown[]>): Promise<unknown[][]> => {
      const out: unknown[][] = [];
      for await (const batch of gen) out.push(batch);
      return out;
    };

    it('pages by (created_at, id) using the full-precision text cursor from the last row', async () => {
      const qbs = [makeQb(), makeQb()];
      qbs[0].getRawMany.mockResolvedValue([
        row('1', '2026-09-01 10:00:00.123456+00'),
        row('2', '2026-09-01 10:00:00.123456+00'),
      ]);
      qbs[1].getRawMany.mockResolvedValue([row('3', '2026-09-02 08:00:00.5+00')]);
      repo.createQueryBuilder.mockReset().mockReturnValueOnce(qbs[0]).mockReturnValueOnce(qbs[1]);

      const batches = await drain(
        studentRepository.iterateStudentCodesByClass('edu-1', 'class-1', 2),
      );

      expect(batches).toEqual([
        [
          { id: '1', studentId: 'BIO-1', name: null },
          { id: '2', studentId: 'BIO-2', name: 'Ava Thompson' },
        ],
        [{ id: '3', studentId: 'BIO-3', name: null }],
      ]);
      // A short page (1 < 2) ends the stream without a third query.
      expect(repo.createQueryBuilder).toHaveBeenCalledTimes(2);

      const cursorCall = (qb: Record<string, jest.Mock>) =>
        qb.andWhere.mock.calls.find(([sql]) => String(sql).startsWith('(s.created_at, s.id) >'));
      expect(cursorCall(qbs[0])).toBeUndefined();
      expect(cursorCall(qbs[1])?.[1]).toEqual({
        cursorCreatedAt: '2026-09-01 10:00:00.123456+00',
        cursorId: '2',
      });

      for (const qb of qbs) {
        expect(qb.orderBy).toHaveBeenCalledWith('s.created_at', 'ASC');
        expect(qb.addOrderBy).toHaveBeenCalledWith('s.id', 'ASC');
        expect(qb.limit).toHaveBeenCalledWith(2);
      }
    });

    it("restricts to the educator's class, active students with a live code and a sign-in-able status", async () => {
      const qb = makeQb();
      qb.getRawMany.mockResolvedValue([]);
      repo.createQueryBuilder.mockReset().mockReturnValue(qb);

      await drain(studentRepository.iterateStudentCodesByClass('edu-1', 'class-1', 1000));

      expect(qb.where).toHaveBeenCalledWith(expect.stringContaining('c.educator_id'), {
        educatorId: 'edu-1',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('s.class_id IN (:...classIds)', {
        classIds: ['class-1'],
      });
      expect(qb.andWhere).toHaveBeenCalledWith('s.is_active = :isActive', { isActive: true });
      expect(qb.andWhere).toHaveBeenCalledWith("s.student_id IS NOT NULL AND s.student_id <> ''");
      expect(qb.andWhere).toHaveBeenCalledWith('s.status NOT IN (:...excludedStatuses)', {
        excludedStatuses: [CommonStatus.INACTIVE, CommonStatus.ARCHIVED, CommonStatus.ARCHIEVED],
      });
    });

    it('yields nothing and issues a single query for an empty class', async () => {
      const qb = makeQb();
      qb.getRawMany.mockResolvedValue([]);
      repo.createQueryBuilder.mockReset().mockReturnValue(qb);

      expect(
        await drain(studentRepository.iterateStudentCodesByClass('edu-1', 'class-1', 10)),
      ).toEqual([]);
      expect(repo.createQueryBuilder).toHaveBeenCalledTimes(1);
    });

    it('issues one extra (empty) query when the row count is an exact multiple of the batch size', async () => {
      const qbs = [makeQb(), makeQb()];
      qbs[0].getRawMany.mockResolvedValue([row('1', 't1'), row('2', 't2')]);
      qbs[1].getRawMany.mockResolvedValue([]);
      repo.createQueryBuilder.mockReset().mockReturnValueOnce(qbs[0]).mockReturnValueOnce(qbs[1]);

      const batches = await drain(
        studentRepository.iterateStudentCodesByClass('edu-1', 'class-1', 2),
      );

      expect(batches).toHaveLength(1);
      expect(repo.createQueryBuilder).toHaveBeenCalledTimes(2);
    });
  });

  describe('findIdByStudentCode', () => {
    const repo = { findOne: jest.fn() };
    const studentRepository = new StudentRepository(repo as never);

    beforeEach(() => repo.findOne.mockReset());

    it('returns the students.id for the Student Code', async () => {
      repo.findOne.mockResolvedValue({ id: 'student-uuid-1' });

      await expect(studentRepository.findIdByStudentCode('REP-PH9N')).resolves.toBe(
        'student-uuid-1',
      );
      expect(repo.findOne).toHaveBeenCalledWith({
        select: { id: true },
        where: { student_id: 'REP-PH9N' },
      });
    });

    it('returns null when no student has the code', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(studentRepository.findIdByStudentCode('NOPE')).resolves.toBeNull();
    });
  });
});
