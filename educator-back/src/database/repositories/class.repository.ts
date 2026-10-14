import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  In,
  IsNull,
  DeepPartial,
  EntityManager,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  Not,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import {
  Class,
  ClassEducator,
  ClassSimulation,
  ClassTransferAudit,
  ClassTransferStatus,
  EducatorSimulation,
  GoogleCourseMapping,
  Student,
} from 'src/database/entities';
import { ClassTransferConflictException } from 'src/common/exceptions/class-transfer-conflict.exception';
import {
  ClassConstants as CommonClassConstants,
  ClassTransferFailureReason,
  ClassTransferListSortField,
} from 'src/common/constants/class.constants';
import { ownerOrCoInstructorSql } from 'src/common/utils/educator-access.util';
import { escapeLikeWildcards } from 'src/common/utils/sql-like.util';
import { activeClassScopeSql, liveClassScopeSql } from 'src/common/utils/class-scope.util';
import { getUtcDateWindow } from 'src/common/utils/date-window.util';
import { ActivityOverviewCounts } from 'src/class/interfaces';
import { CommonStatus } from 'src/common/enums/status.enum';
import { ClassScopeConstants } from 'src/common/constants/class.constants';
import {
  ClassDuplicateNameFilter,
  ClassFilters,
  ClassLiteRawRow,
  ClassLiteRow,
  ClassRow,
  IBatchClassTransferInput,
  IClassTransferCandidate,
  ITransferClassListQuery,
  ITransferClassListRawRow,
  ITransferClassListRow,
  PaginatedRows,
  SchoolGroupFilters,
  SchoolGroupRow,
  TransferClassInput,
  TransferClassResult,
} from 'src/common/interfaces';
import { ClassAttentionMeasure, ClassConstants, ClassSortField } from 'src/class/constants';

@Injectable()
export class ClassRepository {
  // Shared "near avatar limit" business rule
  private static nearAvatarLimitExistsSql(classIdExpr: string, thresholdSql: string): string {
    return `
      EXISTS (
        SELECT 1 FROM class_simulations csim
        WHERE csim.class_id = ${classIdExpr} AND csim.is_active = TRUE AND csim.deleted_at IS NULL
          AND csim.is_ai = TRUE
      )
      AND EXISTS (
        SELECT 1 FROM students s
        WHERE s.class_id = ${classIdExpr} AND s.is_active = TRUE AND s.deleted_at IS NULL
          AND s.time_remaining ~ '^[0-9]+:[0-9]{2}:[0-9]{2}$'
          AND EXTRACT(EPOCH FROM s.time_remaining::interval) / 60 <= ${thresholdSql}
      )
    `;
  }

  /** Shared join for the "unread simulation reports" business rule: report belongs to an active student. */
  private static readonly UNREAD_REPORTS_ACTIVE_STUDENT_JOIN =
    'INNER JOIN students s ON sr.student_id = s.id AND s.is_active = TRUE AND s.deleted_at IS NULL';

  /** Shared "no active students enrolled" business rule. */
  private static noStudentsNotExistsSql(classIdExpr: string): string {
    return `NOT EXISTS (
      SELECT 1 FROM students s
      WHERE s.class_id = ${classIdExpr} AND s.is_active = true AND s.deleted_at IS NULL
    )`;
  }

  /** Shared "no simulations assigned" business rule. */
  private static noAssignedSimsNotExistsSql(classIdExpr: string): string {
    return `NOT EXISTS (
      SELECT 1 FROM class_simulations cs
      WHERE cs.class_id = ${classIdExpr} AND cs.is_active = true AND cs.deleted_at IS NULL
    )`;
  }

  /** Shared "has at least one unread simulation report" business rule. */
  private static hasUnreadReportsExistsSql(classIdExpr: string): string {
    return `EXISTS (
      SELECT 1 FROM simulation_reports sr
      ${ClassRepository.UNREAD_REPORTS_ACTIVE_STUDENT_JOIN}
      WHERE s.class_id = ${classIdExpr} AND sr.viewed_at IS NULL
    )`;
  }

  private applyAttentionScope(qb: SelectQueryBuilder<Class>): void {
    qb.andWhere(activeClassScopeSql('c'));
  }

  constructor(
    @InjectRepository(Class)
    private readonly repo: Repository<Class>,
  ) { }

  async create(data: DeepPartial<Class>): Promise<Class> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async find(options: FindManyOptions<Class> = {}): Promise<Class[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<Class>): Promise<Class | null> {
    return this.repo.findOne(options);
  }

  async count(options: FindManyOptions<Class> = {}): Promise<number> {
    return this.repo.count(options);
  }

  /**
   * Primary owner on classes OR co-instructor via class_educators — EXISTS avoids
   * join duplication.
   */
  private applyEducatorAccessFilter(
    qb: SelectQueryBuilder<Class>,
    educatorId: string,
  ): SelectQueryBuilder<Class> {
    return qb.andWhere(ownerOrCoInstructorSql('c'), { educatorId });
  }

  /** Active class by id, with its school loaded, restricted to classes the educator can access. */
  async findActiveByIdWithSchoolForEducator(id: string, educatorId: string): Promise<Class | null> {
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.school', 'school')
      .where('c.id = :id', { id })
      .andWhere('c.is_active = true');
    this.applyEducatorAccessFilter(qb, educatorId);
    return qb.getOne();
  }

  /**
   * Every active class among `ids` the educator can access (owner or co-instructor), with its
   * school loaded — the batched form of `findActiveByIdWithSchoolForEducator`. Inaccessible or
   * unknown ids are simply absent.
   */
  async findActiveByIdsWithSchoolForEducator(ids: string[], educatorId: string): Promise<Class[]> {
    if (ids.length === 0) return [];
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.school', 'school')
      .where('c.id IN (:...ids)', { ids })
      .andWhere('c.is_active = true');
    this.applyEducatorAccessFilter(qb, educatorId);
    return qb.getMany();
  }

  /**
   * Class by id (including ARCHIEVED) for Google Classroom relink, still
   * restricted to educator access and soft-active rows.
   */
  async findByIdWithSchoolForEducator(id: string, educatorId: string): Promise<Class | null> {
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.school', 'school')
      .where('c.id = :id', { id })
      .andWhere('c.is_active = true');
    this.applyEducatorAccessFilter(qb, educatorId);
    return qb.getOne();
  }

  /** Active class for a school + Google course id. */
  async findBySchoolAndGoogleCourseId(
    schoolId: string,
    googleCourseId: string,
  ): Promise<Class | null> {
    return this.repo.findOne({
      where: {
        school_id: schoolId,
        google_course_id: googleCourseId,
        is_active: true,
      },
    });
  }

  /** Soft-deleted class for a school + Google course id (TypeORM hides these unless withDeleted). */
  async findSoftDeletedBySchoolAndGoogleCourseId(
    schoolId: string,
    googleCourseId: string,
  ): Promise<Class | null> {
    return this.repo.findOne({
      where: {
        school_id: schoolId,
        google_course_id: googleCourseId,
        is_active: false,
      },
      withDeleted: true,
    });
  }

  /** All Google Classroom–origin archived classes for a school. */
  async findArchivedGoogleClassroomForSchool(schoolId: string): Promise<Class[]> {
    return this.repo.find({
      where: {
        school_id: schoolId,
        origin: ClassScopeConstants.GOOGLE_CLASSROOM_ORIGIN,
        status: CommonStatus.ARCHIEVED,
        is_active: true,
      },
      order: { updated_at: 'DESC' },
    });
  }

  /** All Google Classroom–origin classes for a school (any status). */
  async findGoogleClassroomOriginForSchool(schoolId: string): Promise<Class[]> {
    return this.repo.find({
      where: {
        school_id: schoolId,
        origin: ClassScopeConstants.GOOGLE_CLASSROOM_ORIGIN,
        is_active: true,
      },
    });
  }

  /** Google Classroom–origin classes owned by one educator at a school. */
  async findGoogleClassroomOriginForSchoolAndEducator(
    schoolId: string,
    educatorId: string,
  ): Promise<Class[]> {
    return this.repo.find({
      where: {
        school_id: schoolId,
        educator_id: educatorId,
        origin: 'google_classroom',
        is_active: true,
      },
    });
  }

  async update(id: string, data: Partial<Class>): Promise<void> {
    await this.repo.update(id, data);
  }

  /** Active class by id, with educator + students loaded, restricted to classes the educator can access. */
  async findActiveByIdWithEducatorAndStudentsForEducator(
    id: string,
    educatorId: string,
  ): Promise<Class | null> {
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.educator', 'educator')
      .leftJoinAndSelect('c.students', 'students')
      .where('c.id = :id', { id })
      .andWhere('c.is_active = true');
    this.applyEducatorAccessFilter(qb, educatorId);
    return qb.getOne();
  }

  /**
   * All active classes visible to an educator (owner or co-instructor), with the
   * (filtered) student list and school preloaded, optionally scoped to one school.
   *
   * Google Classroom auto-created classes are included only when currently linked
   * (mapping exists) and not archived — pending/archived GC classes stay on the
   * Google Classroom page only.
   */
  async findAllActiveForEducator(educatorId: string, schoolId?: string): Promise<Class[]> {
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoin('c.students', 'students')
      .addSelect([
        'students.id',
        'students.student_id',
        'students.status',
        'students.class_id',
        'students.educator_id',
        'students.school_id',
        'students.submission_date',
        'students.sims_completed',
        'students.time_spent',
        'students.time_remaining',
        'students.attempt',
        'students.score',
        'students.created_at',
        'students.updated_at',
        'students.is_active',
        'students.deleted_at',
      ])
      .leftJoinAndSelect('c.school', 'school')
      .where(liveClassScopeSql('c'))
      .orderBy('c.created_at', 'DESC');
    this.applyEducatorAccessFilter(qb, educatorId);

    if (schoolId) {
      qb.andWhere('c.school_id = :schoolId', { schoolId });
    }

    return qb.getMany();
  }

  async countActiveWithNoStudentsForEducator(
    educatorId: string,
    schoolId?: string,
  ): Promise<number> {
    const qb = this.repo.createQueryBuilder('c').where('1 = 1');
    this.applyAttentionScope(qb);
    qb.andWhere(ClassRepository.noStudentsNotExistsSql('c.id'));
    this.applyEducatorAccessFilter(qb, educatorId);
    if (schoolId) {
      qb.andWhere('c.school_id = :schoolId', { schoolId });
    }
    return qb.getCount();
  }

  async countActiveWithNoAssignedSimsForEducator(
    educatorId: string,
    schoolId?: string,
  ): Promise<number> {
    const qb = this.repo.createQueryBuilder('c').where('1 = 1');
    this.applyAttentionScope(qb);
    qb.andWhere(ClassRepository.noAssignedSimsNotExistsSql('c.id'));
    this.applyEducatorAccessFilter(qb, educatorId);
    if (schoolId) {
      qb.andWhere('c.school_id = :schoolId', { schoolId });
    }
    return qb.getCount();
  }

  async countActiveForEducator(educatorId: string, schoolId?: string): Promise<number> {
    const qb = this.repo.createQueryBuilder('c').where('1 = 1');
    this.applyAttentionScope(qb);
    this.applyEducatorAccessFilter(qb, educatorId);
    if (schoolId) {
      qb.andWhere('c.school_id = :schoolId', { schoolId });
    }
    return qb.getCount();
  }

  /**
   * Distinct count of active classes needing attention for at least one reason — unread
   * reports, no active students, or no assigned sims — so the frontend has the true
   * (deduplicated) number instead of summing the three individual counts, which can
   * double-count a class hitting more than one condition.
   */
  async countActiveNeedingAttentionForEducator(
    educatorId: string,
    schoolId?: string,
  ): Promise<number> {
    const qb = this.repo.createQueryBuilder('c').where('1 = 1');
    this.applyAttentionScope(qb);
    this.applyEducatorAccessFilter(qb, educatorId);
    qb.andWhere(
      new Brackets((sub) => {
        sub
          .orWhere(ClassRepository.hasUnreadReportsExistsSql('c.id'))
          .orWhere(ClassRepository.noStudentsNotExistsSql('c.id'))
          .orWhere(ClassRepository.noAssignedSimsNotExistsSql('c.id'));
      }),
    );
    if (schoolId) {
      qb.andWhere('c.school_id = :schoolId', { schoolId });
    }
    return qb.getCount();
  }
  /**
   * Get all six activity-overview counts in one query, over the shared live-class scope.
   */
  async getActivityOverviewCounts(
    educatorId: string,
    todayStr: string,
    windowEndStr: string,
    thresholdMinutes: number,
    schoolId?: string,
  ): Promise<ActivityOverviewCounts> {
    const rows = await this.repo.query<{ metric: string; value: string }[]>(
      `
      WITH accessible_classes AS (
        SELECT c.id, c.end_date
        FROM classes c
        WHERE ${activeClassScopeSql('c')}
          AND (c.educator_id = $1 OR EXISTS (
            SELECT 1 FROM class_educators ce
            WHERE ce.class_id = c.id AND ce.educator_id = $1
          ))
          AND ($2::uuid IS NULL OR c.school_id = $2)
      ),
      unread_reports AS (
        SELECT s.class_id AS class_id,
               COUNT(sr.id) FILTER (WHERE sr.viewed_at IS NULL) AS unread_count
        FROM simulation_reports sr
        ${ClassRepository.UNREAD_REPORTS_ACTIVE_STUDENT_JOIN}
        WHERE s.class_id IN (SELECT id FROM accessible_classes)
        GROUP BY s.class_id
        HAVING COUNT(sr.id) FILTER (WHERE sr.viewed_at IS NULL) > 0
      )
      SELECT 'activeClasses' AS metric, COUNT(*)::text AS value
        FROM accessible_classes
      UNION ALL
      SELECT 'classesClosingSoon', COUNT(*)::text
        FROM accessible_classes
        WHERE end_date BETWEEN $3 AND $4
      UNION ALL
      SELECT 'studentsInActiveClasses', COUNT(*)::text
        FROM students s
        WHERE s.is_active = TRUE AND s.deleted_at IS NULL
          AND s.class_id IN (SELECT id FROM accessible_classes)
      UNION ALL
      SELECT 'classesWithStudentsNearAvatarLimit', COUNT(*)::text
        FROM accessible_classes c
        WHERE ${ClassRepository.nearAvatarLimitExistsSql('c.id', '$5')}
      UNION ALL
      SELECT 'classesWithUnreadReports', COUNT(*)::text FROM unread_reports
      UNION ALL
      SELECT 'totalUnreadReports', COALESCE(SUM(unread_count), 0)::text FROM unread_reports
      `,
      [educatorId, schoolId ?? null, todayStr, windowEndStr, thresholdMinutes],
    );

    const byMetric = new Map(rows.map((row) => [row.metric, parseInt(row.value, 10)]));
    return {
      activeClasses: byMetric.get('activeClasses') ?? 0,
      classesClosingSoon: byMetric.get('classesClosingSoon') ?? 0,
      studentsInActiveClasses: byMetric.get('studentsInActiveClasses') ?? 0,
      classesWithStudentsNearAvatarLimit: byMetric.get('classesWithStudentsNearAvatarLimit') ?? 0,
      classesWithUnreadReports: byMetric.get('classesWithUnreadReports') ?? 0,
      totalUnreadReports: byMetric.get('totalUnreadReports') ?? 0,
    };
  }

  /** An active class for this educator with the same name, excluding the class being updated (duplicate-name check). */
  async findActiveDuplicateForUpdate(
    className: string,
    excludeId: string,
    educatorId: string,
  ): Promise<Class | null> {
    return this.repo.findOne({
      where: {
        class_name: className,
        id: Not(excludeId),
        educator: { id: educatorId },
        is_active: true,
      },
    });
  }

  /**
   * Active class for this educator matching name/term/year/school, optionally excluding one
   * class id — the consolidated duplicate-name check shared by create and update.
   */
  async findActiveClassByName(filter: ClassDuplicateNameFilter): Promise<Class | null> {
    const where: FindOptionsWhere<Class> = {
      class_name: filter.className,
      educator: { id: filter.educatorId },
      is_active: true,
    };
    if (filter.term) where.term = filter.term;
    if (filter.year) where.year = filter.year;
    if (filter.schoolId) where.school = { id: filter.schoolId };
    if (filter.excludeClassId) where.id = Not(filter.excludeClassId);
    return this.repo.findOne({ where });
  }

  /** Active LMS-linked classes for a school (non-empty lms_class_id) — constructed-code fallback matching. */
  async findLmsLinkedActiveForSchool(schoolId: string): Promise<Class[]> {
    return this.repo
      .createQueryBuilder('c')
      .innerJoin('c.educator', 'e')
      .innerJoin('e.school', 'sch')
      .where('sch.id = :schoolId', { schoolId })
      .andWhere('c.lms_class_id IS NOT NULL')
      .andWhere("c.lms_class_id <> ''")
      .andWhere('c.is_active = true')
      .getMany();
  }

  /** Most-recently-updated active class for a school matching an LMS course reference. */
  async findActiveByLmsCourseReferenceForSchool(
    lmsCourseId: string,
    schoolId: string,
  ): Promise<Class | null> {
    return this.repo
      .createQueryBuilder('c')
      .innerJoin('c.educator', 'e')
      .innerJoin('e.school', 'sch')
      .where('sch.id = :schoolId', { schoolId })
      .andWhere('c.lms_class_reference = :lmsCourseId', { lmsCourseId })
      .andWhere('c.is_active = true')
      .orderBy('c.updated_at', 'DESC')
      .addOrderBy('c.created_at', 'DESC')
      .getOne();
  }

  /** Active/legacy classes owned by an educator, each with its school name, for the class-transfer picker. */
  async findActiveByEducatorWithSchool(educatorId: string): Promise<Class[]> {
    return this.repo
      .createQueryBuilder('c')
      .select([
        'c.id',
        'c.class_name',
        'c.term',
        'c.year',
        'c.status',
        'c.start_date',
        'c.end_date',
        'c.is_active',
        'c.total_no_of_students',
        'c.school_id',
        's.school_name',
      ])
      .leftJoin('c.school', 's')
      .where('c.educator_id = :educatorId', { educatorId })
      .andWhere('(c.is_active = :active OR c.is_active IS NULL)', { active: true })
      .andWhere('c.deleted_at IS NULL')
      .orderBy('c.created_at', 'DESC')
      .getMany();
  }

  /** Maps a public sort field to the column/alias the classes-in-group query can `ORDER BY`. */
  /**
   * `students_count`/`sims_count`/`reports_count` are correlated-subquery SELECT aliases that
   * only exist on the full branch of `findClasses` — `lite` falls back to the default order
   * instead of ordering by an alias `findClassesLite`'s query never selects.
   */
  private mapClassSortColumn(field?: ClassSortField, lite = false): string {
    switch (field) {
      case ClassSortField.CLASS_NAME:
        return 'c.class_name';
      case ClassSortField.STUDENTS:
        return lite ? 'c.created_at' : 'students_count';
      case ClassSortField.SIMS:
        return lite ? 'c.created_at' : 'sims_count';
      case ClassSortField.REPORTS:
        return lite ? 'c.created_at' : 'reports_count';
      case ClassSortField.STATUS:
        return 'c.status';
      default:
        return 'c.created_at';
    }
  }

  /**
   * Restricts `qb` to the given school ids and/or the "unassigned" (null school) bucket.
   * Shared by `applySchoolGroupFilters` and `applyClassFilters` — a no-op when neither
   * `schoolIds` nor `includeUnassigned` is provided.
   */
  private applySchoolScopeFilter(
    qb: SelectQueryBuilder<Class>,
    schoolIds?: string[],
    includeUnassigned?: boolean,
  ): void {
    if (!schoolIds?.length && !includeUnassigned) {
      return;
    }

    qb.andWhere(
      new Brackets((sub) => {
        if (schoolIds?.length) {
          sub.orWhere('c.school_id IN (:...schoolIds)', { schoolIds });
        }
        if (includeUnassigned) {
          sub.orWhere('c.school_id IS NULL');
        }
      }),
    );
  }

  private applyAttentionMeasureFilter(
    qb: SelectQueryBuilder<Class>,
    measure?: ClassAttentionMeasure,
  ): void {
    if (!measure) {
      return;
    }

    // Same scope as the counts these drill-downs come from: live classes with status ACTIVE.
    qb.andWhere(activeClassScopeSql('c'));

    switch (measure) {
      case ClassAttentionMeasure.ACTIVE:
        break;
      case ClassAttentionMeasure.CLOSING_SOON: {
        const { todayStr, windowEndStr } = getUtcDateWindow(
          ClassConstants.ACTIVITY_OVERVIEW.CLOSING_SOON_WINDOW_DAYS,
        );
        qb.andWhere('c.end_date BETWEEN :todayStr AND :windowEndStr', { todayStr, windowEndStr });
        break;
      }
      case ClassAttentionMeasure.NEAR_AVATAR_LIMIT:
        qb.andWhere(ClassRepository.nearAvatarLimitExistsSql('c.id', ':thresholdMinutes'), {
          thresholdMinutes: ClassConstants.ACTIVITY_OVERVIEW.AVATAR_NEAR_LIMIT_THRESHOLD_MINUTES,
        });
        break;
      case ClassAttentionMeasure.UNREAD_REPORTS:
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM simulation_reports sr
            ${ClassRepository.UNREAD_REPORTS_ACTIVE_STUDENT_JOIN}
            WHERE s.class_id = c.id AND sr.viewed_at IS NULL
          )`,
        );
        break;
      case ClassAttentionMeasure.NO_STUDENTS:
        qb.andWhere(ClassRepository.noStudentsNotExistsSql('c.id'));
        break;
      case ClassAttentionMeasure.NO_ASSIGNED_SIMS:
        qb.andWhere(ClassRepository.noAssignedSimsNotExistsSql('c.id'));
        break;
    }
  }

  /** Class status + start/end date filters, shared by the school-groups and class-list queries. */
  private applyClassStatusDateFilters(
    qb: SelectQueryBuilder<Class>,
    statuses?: CommonStatus[],
    startDateFrom?: string,
    endDateTo?: string,
    endDateFrom?: string,
  ): void {
    if (statuses?.length) {
      qb.andWhere('c.status IN (:...statuses)', { statuses });
    }
    if (startDateFrom) {
      qb.andWhere('c.start_date >= :startDateFrom', { startDateFrom });
    }
    if (endDateTo) {
      qb.andWhere('c.end_date <= :endDateTo', { endDateTo });
    }
    if (endDateFrom) {
      qb.andWhere('c.end_date >= :endDateFrom', { endDateFrom });
    }
  }

  /** Applies the WHERE-clause filters shared by the count and data queries in `findSchoolGroupsForEducator`. */
  private applySchoolGroupFilters(
    qb: SelectQueryBuilder<Class>,
    educatorId: string,
    filters: SchoolGroupFilters,
  ): void {
    qb.where(liveClassScopeSql('c'));
    this.applyEducatorAccessFilter(qb, educatorId);
    this.applySchoolScopeFilter(qb, filters.schoolIds, filters.includeUnassigned);
    this.applyAttentionMeasureFilter(qb, filters.measure);
    this.applyClassStatusDateFilters(
      qb,
      filters.classStatuses,
      filters.classStartDateFrom,
      filters.classEndDateTo,
    );

    if (filters.classIds?.length) {
      qb.andWhere('c.id IN (:...classIds)', { classIds: filters.classIds });
    }

    if (filters.className) {
      qb.andWhere('c.class_name ILIKE :className', { className: `%${filters.className}%` });
    }

    if (filters.schoolName) {
      qb.andWhere('school.school_name ILIKE :schoolName', {
        schoolName: `%${filters.schoolName}%`,
      });
    }
  }

  /**
   * The educator's school groups (+ the "unassigned" bucket when requested), with a class
   * count per group under whatever school/class filters are applied.
   * A school with no matching class simply doesn't appear — every filter is applied in
   * `WHERE`, before `GROUP BY`, so there's nothing left to group for it (this also means a
   * `schoolName` filter naturally excludes the unassigned bucket, since it has no school name
   * to match against).
   *
   * `total` is computed via a separate `COUNT(DISTINCT ...)` query rather than a
   * `COUNT(*) OVER()` window column on the grouped query — the window-function approach
   * returns no rows (and so no total) once `offset` skips past the last matching group.
   */
  async findSchoolGroupsForEducator(
    educatorId: string,
    filters: SchoolGroupFilters,
    pagination: { skip: number; take: number },
  ): Promise<PaginatedRows<SchoolGroupRow>> {
    const countQb = this.repo
      .createQueryBuilder('c')
      .leftJoin('c.school', 'school')
      .select("COUNT(DISTINCT COALESCE(school.id::text, 'unassigned'))", 'count');
    this.applySchoolGroupFilters(countQb, educatorId, filters);
    const countRow = await countQb.getRawOne<{ count: string }>();
    const total = Number(countRow?.count ?? 0);

    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoin('c.school', 'school')
      .select('school.id', 'school_id')
      .addSelect('school.school_name', 'school_name')
      .addSelect('COUNT(c.id)', 'class_count');
    this.applySchoolGroupFilters(qb, educatorId, filters);

    qb.groupBy('school.id')
      .addGroupBy('school.school_name')
      .orderBy('school.school_name', 'ASC', 'NULLS LAST')
      .offset(pagination.skip)
      .limit(pagination.take);

    const raw = await qb.getRawMany<{
      school_id: string | null;
      school_name: string | null;
      class_count: string;
    }>();

    const rows: SchoolGroupRow[] = raw.map((row) => ({
      schoolId: row.school_id,
      schoolName: row.school_name,
      classCount: Number(row.class_count),
    }));

    return { rows, total };
  }

  /** Applies the WHERE-clause filters shared by the count and data queries in `findClasses`. */
  private applyClassFilters(
    qb: SelectQueryBuilder<Class>,
    educatorId: string,
    filters: ClassFilters,
  ): void {
    qb.where(liveClassScopeSql('c'));
    this.applyEducatorAccessFilter(qb, educatorId);
    this.applySchoolScopeFilter(qb, filters.schoolIds, filters.includeUnassigned);
    this.applyAttentionMeasureFilter(qb, filters.measure);

    if (filters.search) {
      qb.andWhere('c.class_name ILIKE :search', { search: `%${filters.search}%` });
    }
    if (filters.classIds?.length) {
      qb.andWhere('c.id IN (:...classIds)', { classIds: filters.classIds });
    }
    this.applyClassStatusDateFilters(
      qb,
      filters.statuses,
      filters.startDateFrom,
      filters.endDateTo,
      filters.endDateFrom,
    );
  }

  /**
   * The educator's classes, optionally scoped to one or more schools (and/or the "unassigned"
   * bucket) via `filters.schoolIds`/`filters.includeUnassigned` — when neither is provided,
   * classes across every school (and the unassigned bucket) are returned. Paginated and sorted
   * server-side, with per-class students/sims/reports counts computed as correlated subqueries
   * so sorting-by-count operates on the true aggregate across the whole matching set, not just
   * the page being returned.
   *
   * `total` is computed via a separate `.getCount()` query rather than a `COUNT(*) OVER()`
   * window column — the window-function approach returns no rows (and so no total) once
   * `skip` moves past the last matching class.
   */
  async findClasses(
    educatorId: string,
    filters: ClassFilters & { lite: true },
    sort: { field?: ClassSortField; dir: 'ASC' | 'DESC' },
    pagination: { skip: number; take: number },
  ): Promise<PaginatedRows<ClassLiteRow>>;
  async findClasses(
    educatorId: string,
    filters: ClassFilters & { lite?: false | undefined },
    sort: { field?: ClassSortField; dir: 'ASC' | 'DESC' },
    pagination: { skip: number; take: number },
  ): Promise<PaginatedRows<ClassRow>>;
  async findClasses(
    educatorId: string,
    filters: ClassFilters & { lite?: boolean },
    sort: { field?: ClassSortField; dir: 'ASC' | 'DESC' },
    pagination: { skip: number; take: number },
  ): Promise<PaginatedRows<ClassRow> | PaginatedRows<ClassLiteRow>>;
  async findClasses(
    educatorId: string,
    filters: ClassFilters & { lite?: boolean },
    sort: { field?: ClassSortField; dir: 'ASC' | 'DESC' },
    pagination: { skip: number; take: number },
  ): Promise<PaginatedRows<ClassRow> | PaginatedRows<ClassLiteRow>> {
    return filters.lite
      ? this.findClassesLite(educatorId, filters, sort, pagination)
      : this.findClassesFull(educatorId, filters, sort, pagination);
  }

  private async countClasses(educatorId: string, filters: ClassFilters): Promise<number> {
    const countQb = this.repo.createQueryBuilder('c');
    this.applyClassFilters(countQb, educatorId, filters);
    return countQb.getCount();
  }

  /** `lite: true` branch of `findClasses` — id, name, dates and status only, no joins/subqueries. */
  private async findClassesLite(
    educatorId: string,
    filters: ClassFilters,
    sort: { field?: ClassSortField; dir: 'ASC' | 'DESC' },
    pagination: { skip: number; take: number },
  ): Promise<PaginatedRows<ClassLiteRow>> {
    const total = await this.countClasses(educatorId, filters);

    const qb = this.repo
      .createQueryBuilder('c')
      .select('c.id', 'id')
      .addSelect('c.class_name', 'class_name')
      .addSelect('c.start_date', 'start_date')
      .addSelect('c.end_date', 'end_date')
      .addSelect('c.status', 'status');
    this.applyClassFilters(qb, educatorId, filters);
    qb.orderBy(this.mapClassSortColumn(sort.field, true), sort.dir)
      .addOrderBy('c.id', 'ASC')
      .skip(pagination.skip)
      .take(pagination.take);

    const raw = await qb.getRawMany<ClassLiteRawRow>();
    const rows: ClassLiteRow[] = raw.map((row) => ({
      id: row.id,
      className: row.class_name,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
    }));
    return { rows, total };
  }

  /** Full branch of `findClasses` — every column plus the students/sims/reports correlated-subquery counts. */
  private async findClassesFull(
    educatorId: string,
    filters: ClassFilters,
    sort: { field?: ClassSortField; dir: 'ASC' | 'DESC' },
    pagination: { skip: number; take: number },
  ): Promise<PaginatedRows<ClassRow>> {
    const total = await this.countClasses(educatorId, filters);

    const qb = this.repo
      .createQueryBuilder('c')
      .select('c.id', 'id')
      .addSelect('c.class_name', 'class_name')
      .addSelect('c.start_date', 'start_date')
      .addSelect('c.end_date', 'end_date')
      .addSelect('c.status', 'status')
      .addSelect(
        '(SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.is_active = true AND s.deleted_at IS NULL)',
        'students_count',
      )
      .addSelect(
        '(SELECT COUNT(*) FROM class_simulations cs WHERE cs.class_id = c.id AND cs.is_active = true AND cs.deleted_at IS NULL)',
        'sims_count',
      )
      .addSelect(
        `(SELECT COUNT(*) FROM simulation_reports sr
            JOIN students s2 ON s2.id = sr.student_id
            WHERE s2.class_id = c.id AND s2.is_active = true AND s2.deleted_at IS NULL)`,
        'reports_count',
      )
      .addSelect(
        `(SELECT COUNT(*) FROM simulation_reports sr
            ${ClassRepository.UNREAD_REPORTS_ACTIVE_STUDENT_JOIN}
            WHERE s.class_id = c.id AND sr.viewed_at IS NULL)`,
        'unread_reports_count',
      );
    this.applyClassFilters(qb, educatorId, filters);
    qb.orderBy(this.mapClassSortColumn(sort.field), sort.dir)
      .addOrderBy('c.id', 'ASC')
      .skip(pagination.skip)
      .take(pagination.take);

    const raw = await qb.getRawMany<{
      id: string;
      class_name: string;
      start_date: string;
      end_date: string;
      status: CommonStatus;
      students_count: string;
      sims_count: string;
      reports_count: string;
      unread_reports_count: string;
    }>();

    const rows: ClassRow[] = raw.map((row) => ({
      id: row.id,
      className: row.class_name,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      studentsCount: Number(row.students_count),
      simsCount: Number(row.sims_count),
      reportsCount: Number(row.reports_count),
      unreadReportsCount: Number(row.unread_reports_count),
    }));

    return { rows, total };
  }

  /**
   * Moves a class to another educator in one transaction: the class and its students change
   * owner, the audit row is written and the class's simulations are synced into the target
   * educator's library. Any failure rolls the whole transfer back.
   */
  async transferToEducator(input: TransferClassInput): Promise<TransferClassResult> {
    return this.repo.manager.transaction(async (manager) => {
      await manager.update(Class, { id: input.classId }, { educator_id: input.targetEducatorId });
      await manager.update(
        Student,
        { class_id: input.classId },
        { educator_id: input.targetEducatorId },
      );

      const audit = await manager.save(
        ClassTransferAudit,
        manager.create(ClassTransferAudit, {
          classId: input.classId,
          className: input.className,
          sourceEducatorId: input.sourceEducatorId,
          sourceEducatorName: input.sourceEducatorName,
          targetEducatorId: input.targetEducatorId,
          targetEducatorName: input.targetEducatorName,
          adminId: input.adminId,
          adminEmail: input.adminEmail,
          status: ClassTransferStatus.SUCCESS,
          notes: null,
        }),
      );

      await this.syncTargetSimulationLibrary(manager, input);

      return audit;
    });
  }

  /**
   * The classes a bulk Class Transfer was asked to move, restricted to those owned by one of the
   * acting district admin's educators. Soft-deleted classes are included so the caller can report
   * them; ids that don't exist or belong to another admin are simply absent.
   */
  async findTransferCandidates(
    classIds: string[],
    districtAdminId: string,
  ): Promise<IClassTransferCandidate[]> {
    if (classIds.length === 0) return [];

    const classes = await this.repo.find({
      where: { id: In(classIds), educator: { districtAdminId } },
      relations: { educator: true },
      select: {
        id: true,
        class_name: true,
        educator_id: true,
        school_id: true,
        google_course_id: true,
        is_active: true,
        deleted_at: true,
        status: true,
        educator: { id: true },
      },
      withDeleted: true,
    });

    return classes.map((c) => ({
      id: String(c.id),
      className: c.class_name ?? '',
      educatorId: c.educator_id ?? null,
      schoolId: c.school_id ?? null,
      googleCourseId: c.google_course_id ?? null,
      isActive: c.is_active ?? null,
      deletedAt: c.deleted_at ?? null,
      // NOT NULL column; the entity just types it optional.
      status: c.status!,
    }));
  }

  /**
   * One page of the classes an educator owns, for the Class Transfer picker: every non-deleted
   * owned class (inactive ones included so the caller can flag them, unless `transferableOnly`
   * hides them), with the school name and a
   * live count of active students. `total` comes from a separate count query, so it stays correct
   * when the page is past the last row.
   */
  async findTransferClassesForEducator(
    educatorId: string,
    query: ITransferClassListQuery,
  ): Promise<PaginatedRows<ITransferClassListRow>> {
    const scope = (qb: SelectQueryBuilder<Class>): SelectQueryBuilder<Class> => {
      qb.where('c.educator_id = :educatorId', { educatorId }).andWhere('c.deleted_at IS NULL');
      if (query.search) {
        // Escape `%`/`_` so a search for a literal percent or underscore isn't a wildcard.
        qb.andWhere('c.class_name ILIKE :search', {
          search: `%${escapeLikeWildcards(query.search)}%`,
        });
      }
      if (query.transferableOnly) {
        // The receiver-independent transfer rules: the class is active and not archived.
        qb.andWhere('c.is_active = true').andWhere('c.status NOT IN (:...blockedStatuses)', {
          blockedStatuses: CommonClassConstants.TRANSFER.BLOCKED_STATUSES,
        });
      }
      return qb;
    };

    const total = await scope(this.repo.createQueryBuilder('c')).getCount();

    const qb = scope(
      this.repo
        .createQueryBuilder('c')
        .leftJoin('c.school', 's')
        .select('c.id', 'id')
        .addSelect('c.class_name', 'class_name')
        .addSelect('c.educator_id', 'educator_id')
        .addSelect('c.school_id', 'school_id')
        .addSelect('s.school_name', 'school_name')
        .addSelect('c.google_course_id', 'google_course_id')
        .addSelect('c.is_active', 'is_active')
        .addSelect('c.status', 'status')
        // As text: the driver turns a raw DATE into a JS Date in the server's timezone, which can
        // shift the calendar day.
        .addSelect("TO_CHAR(c.start_date, 'YYYY-MM-DD')", 'start_date')
        .addSelect("TO_CHAR(c.end_date, 'YYYY-MM-DD')", 'end_date')
        .addSelect(
          '(SELECT COUNT(*) FROM students st WHERE st.class_id = c.id AND st.is_active = true AND st.deleted_at IS NULL)',
          'students_count',
        ),
    );
    if (query.sortBy) {
      qb.orderBy(this.mapTransferClassSortColumn(query.sortBy), query.sortDir);
    } else {
      qb.orderBy('c.created_at', 'DESC');
    }
    // `.offset()/.limit()` set the SQL clause directly, which is what a joined raw query needs.
    qb.addOrderBy('c.id', 'ASC').offset(query.skip).limit(query.take);

    const raw = await qb.getRawMany<ITransferClassListRawRow>();

    const rows: ITransferClassListRow[] = raw.map((row) => ({
      id: row.id,
      className: row.class_name,
      educatorId: row.educator_id,
      schoolId: row.school_id,
      schoolName: row.school_name,
      googleCourseId: row.google_course_id,
      isActive: row.is_active,
      deletedAt: null,
      status: row.status,
      startDate: row.start_date,
      endDate: row.end_date,
      studentsCount: Number(row.students_count),
    }));
    return { rows, total };
  }

  private mapTransferClassSortColumn(field: ClassTransferListSortField): string {
    switch (field) {
      case ClassTransferListSortField.CLASS_NAME:
        return 'c.class_name';
      case ClassTransferListSortField.STUDENTS:
        return 'students_count';
      case ClassTransferListSortField.STATUS:
        return 'c.status';
      case ClassTransferListSortField.START_DATE:
        return 'c.start_date';
      case ClassTransferListSortField.END_DATE:
        return 'c.end_date';
      default: {
        // Exhaustive: a new sort field fails to compile until it is mapped here.
        const unmapped: never = field;
        throw new Error(`Unmapped class transfer sort field: ${String(unmapped)}`);
      }
    }
  }

  /**
   * Moves one class of a bulk Class Transfer in its own transaction. Unlike `transferToEducator`,
   * the class UPDATE is guarded on the class still being owned by the source, active and not
   * deleted (otherwise `ClassTransferConflictException` with the current reason), the source's
   * co-instructor row is swapped for a primary one for the target, and the Google Classroom
   * mapping is handed to the target. Any failure rolls the whole class back.
   */
  async transferClassInBatch(input: IBatchClassTransferInput): Promise<ClassTransferAudit> {
    return this.repo.manager.transaction(async (manager) => {
      const moved = await manager.update(
        Class,
        {
          id: input.classId,
          educator_id: input.sourceEducatorId,
          is_active: true,
          deleted_at: IsNull(),
          status: Not(In(CommonClassConstants.TRANSFER.BLOCKED_STATUSES)),
        },
        { educator_id: input.targetEducatorId },
      );
      if (moved.affected !== 1) {
        // Re-read under the same transaction to report why the class is no longer transferable.
        const current = await manager.findOne(Class, {
          where: { id: input.classId },
          select: { id: true, educator_id: true, is_active: true, deleted_at: true, status: true },
          withDeleted: true,
        });
        throw new ClassTransferConflictException(
          input.classId,
          this.resolveTransferConflictReason(current),
        );
      }

      await manager.update(
        Student,
        { class_id: input.classId },
        { educator_id: input.targetEducatorId },
      );

      await manager.delete(ClassEducator, {
        classId: input.classId,
        educatorId: input.sourceEducatorId,
      });
      await manager.upsert(
        ClassEducator,
        { classId: input.classId, educatorId: input.targetEducatorId, isPrimary: true },
        ['classId', 'educatorId'],
      );

      await manager.update(
        GoogleCourseMapping,
        { classId: input.classId },
        { linkedByEducatorId: input.targetEducatorId },
      );

      const audit = await manager.save(
        ClassTransferAudit,
        manager.create(ClassTransferAudit, {
          classId: input.classId,
          className: input.className,
          sourceEducatorId: input.sourceEducatorId,
          sourceEducatorName: input.sourceEducatorName,
          targetEducatorId: input.targetEducatorId,
          targetEducatorName: input.targetEducatorName,
          adminId: input.adminId,
          adminEmail: input.adminEmail,
          status: ClassTransferStatus.SUCCESS,
          notes: null,
          batchId: input.batchId,
        }),
      );

      await this.syncTargetSimulationLibrary(manager, input);

      return audit;
    });
  }

  /** Why the guarded transfer UPDATE matched no row; same order as the up-front checks. */
  private resolveTransferConflictReason(current: Class | null): ClassTransferFailureReason {
    if (!current || current.deleted_at) {
      return ClassTransferFailureReason.CLASS_NOT_FOUND;
    }
    if (current.is_active !== true) {
      return ClassTransferFailureReason.CLASS_INACTIVE;
    }
    if (CommonClassConstants.TRANSFER.BLOCKED_STATUSES.includes(current.status!)) {
      return ClassTransferFailureReason.CLASS_ARCHIVED;
    }
    return ClassTransferFailureReason.CLASS_NOT_OWNED_BY_SOURCE;
  }

  /**
   * Adds the class's active simulations to the target educator's library (restoring rows the
   * target had soft-deleted), so the class never shows simulations its new owner can't see.
   * Shared by both transfer writes; runs inside their transaction.
   */
  private async syncTargetSimulationLibrary(
    manager: EntityManager,
    input: TransferClassInput,
  ): Promise<void> {
    const classSimulations = await manager.find(ClassSimulation, {
      where: { class_id: input.classId, is_active: true },
    });
    if (classSimulations.length === 0) return;

    const scenarioIds = classSimulations.map((cs) => cs.simulation_id);
    const sourceEntries = await manager.find(EducatorSimulation, {
      where: {
        educator_id: input.sourceEducatorId,
        scenario_id: In(scenarioIds),
        deleted_at: IsNull(),
      },
    });
    const targetEntries = await manager.find(EducatorSimulation, {
      where: { educator_id: input.targetEducatorId, scenario_id: In(scenarioIds) },
    });
    const sourceByScenario = new Map(sourceEntries.map((e) => [e.scenario_id, e]));
    const targetByScenario = new Map(targetEntries.map((e) => [e.scenario_id, e]));

    for (const cs of classSimulations) {
      const target = targetByScenario.get(cs.simulation_id);
      if (!target) {
        await manager.save(
          EducatorSimulation,
          manager.create(EducatorSimulation, {
            educator_id: input.targetEducatorId,
            unit_id: sourceByScenario.get(cs.simulation_id)?.unit_id ?? '',
            scenario_id: cs.simulation_id,
            deleted_at: null,
          }),
        );
      } else if (target.deleted_at !== null) {
        await manager.update(EducatorSimulation, { id: target.id }, { deleted_at: null });
      }
    }
  }
}
