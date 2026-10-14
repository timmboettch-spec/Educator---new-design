import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  IsNull,
  Not,
  Raw,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { SimulationReport } from 'src/database/entities';
import {
  IReportListingFilters,
  IReportListingPagination,
  IReportListingRawRow,
  IReportListingResult,
  IReportListingSort,
  AttemptRowInput,
  LatestAttemptNotificationRow,
  ReportDetailRow,
  ReportDetailWithStudentRow,
  ReportListRow,
  ReportOwnedScoreRow,
  ReportScoreModeRow,
  ReportMonthlyCount,
  ReportMonthlyCountParams,
  ReportPageParams,
  SimulationReportRow,
  SimulationsCompletedGraphFilters,
  SimulationsCompletedGraphRawRow,
  SimulationsCompletedGraphResult,
  StudentAttemptTotals,
  StudentScenarioPair,
} from 'src/common/interfaces';
import {
  buildSimulationsCompletedGraphConditions,
  buildSimulationsCompletedGraphSql,
  groupSimulationsCompletedGraphRows,
  resolveSimulationsCompletedGraphCompareLevel,
  resolveSimulationsCompletedGraphGroupLevel,
} from 'src/class/utils/simulations-completed-graph-query.util';
import { ownerOrCoInstructorSql } from 'src/common/utils/educator-access.util';
import { activeClassScopeSql, liveClassScopeSql } from 'src/common/utils/class-scope.util';
import { ReportListSortField, ReportModeType, ReportReviewStatus } from 'src/common/constants';
import { isUuid } from 'src/common/utils/uuid.util';
import {
  buildScoreColumnExpr,
  buildTimeSpentColumnExpr,
} from 'src/common/utils/simulation-report-jsonb-expressions.util';

const SCORE_SORT_EXPR = buildScoreColumnExpr('sr');
const TIME_SPENT_SORT_EXPR = buildTimeSpentColumnExpr('sr');

const REPORT_LIST_COLUMNS = [
  'r.id',
  'r.reportId',
  'r.userId',
  'r.studentCode',
  'r.key',
  'r.studentName',
  'r.studentClass',
  'r.scenarioId',
  'r.scenarioTitle',
  'r.transcriptId',
  'r.scenarioStartTime',
  'r.scenarioEndTime',
  'r.totalTimeSeconds',
  'r.mode',
  'r.score',
  'r.performanceLabel',
  'r.scoreJson',
  'r.createdAt',
];

const REPORT_DETAIL_COLUMNS = [
  ...REPORT_LIST_COLUMNS,
  'r.summary',
  'r.summaryEntries',
  'r.summaryByCategory',
  'r.feedback',
  'r.commonActionTracker',
  'r.communicationAssessment',
  'r.rubricsSummary',
  'r.rubricsTotal',
  'r.debriefReflection',
  'r.actionScores',
  'r.actionSummary',
  'r.mandatoryActions',
  'r.optionalActions',
  'r.distractorActions',
];

/** The column lists above as entity property names, for `find*` APIs (no `r.` alias). */
const toFields = (columns: string[]): (keyof SimulationReport)[] =>
  columns.map((column) => column.slice(2)) as (keyof SimulationReport)[];
const REPORT_LIST_FIELDS = toFields(REPORT_LIST_COLUMNS);
const REPORT_DETAIL_FIELDS = toFields(REPORT_DETAIL_COLUMNS);

/** Every column of an Attempt (rows the educator reads return). */
const REPORT_ROW_FIELDS: (keyof SimulationReport)[] = [
  ...new Set<keyof SimulationReport>([
    'id',
    'studentId',
    'viewedAt',
    'viewedBy',
    'updatedAt',
    ...REPORT_DETAIL_FIELDS,
  ]),
];

/** The simulation's current title, else the title stored on the Attempt. */
const SIMULATION_NAME_EXPR = 'COALESCE(sim.title, sr.scenario_title)';

const SORT_EXPR_BY_FIELD: Record<ReportListSortField, string> = {
  [ReportListSortField.STUDENT_CODE]: 's.student_id',
  [ReportListSortField.STUDENT_NAME]: 'sr.studentName',
  [ReportListSortField.MODE]: 'sr.mode',
  [ReportListSortField.SIMULATION_NAME]: SIMULATION_NAME_EXPR,
  [ReportListSortField.SCORE]: SCORE_SORT_EXPR,
  [ReportListSortField.TIME_SPENT]: TIME_SPENT_SORT_EXPR,
  [ReportListSortField.COMPLETED_AT]: 'sr.createdAt',
};
import { BulkReviewParams, BulkReviewRawRow } from 'src/common/interfaces';
import { SimulationReportSelectorType } from 'src/common/constants/simulation-report.constants';

/** Column each selector kind filters the scoped join on. */
const BULK_REVIEW_SELECTOR_COLUMN: Record<SimulationReportSelectorType, string> = {
  [SimulationReportSelectorType.REPORT]: 'sr.id',
  [SimulationReportSelectorType.STUDENT]: 'sr.student_id',
  [SimulationReportSelectorType.SIMULATION]: 'sr.scenario_id',
  [SimulationReportSelectorType.CLASS]: 's.class_id',
};

@Injectable()
export class SimulationReportRepository {
  constructor(
    @InjectRepository(SimulationReport)
    private readonly repo: Repository<SimulationReport>,
  ) {}

  async create(data: DeepPartial<SimulationReport>): Promise<SimulationReport> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async find(options: FindManyOptions<SimulationReport> = {}): Promise<SimulationReport[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<SimulationReport>): Promise<SimulationReport | null> {
    return this.repo.findOne(options);
  }

  async update(id: string, data: DeepPartial<SimulationReport>): Promise<number> {
    const result = await this.repo.update(id, data);
    return result.affected ?? 0;
  }

  /**
   * Fetches a report only if it belongs to a class the given educator owns or
   * co-instructs — null both when the report doesn't exist and when it exists
   * but is out of scope, so callers can't distinguish the two (RE-38).
   */
  async findAccessibleById(id: string, educatorId: string): Promise<SimulationReport | null> {
    return this.repo
      .createQueryBuilder('sr')
      .innerJoin('students', 's', 's.id = sr.student_id')
      .innerJoin('classes', 'c', 'c.id = s.class_id')
      .where('sr.id = :id', { id })
      .andWhere(ownerOrCoInstructorSql('c'), { educatorId })
      .getOne();
  }

  /** The Attempt with this `transcript_id`, the Attempt's identity. */
  async findByTranscriptId(transcriptId: string): Promise<SimulationReport | null> {
    return this.repo.findOneBy({ transcriptId });
  }

  /**
   * A Student's own Report by the Blob-era `report_id` the client already uses. Null both when it
   * doesn't exist and when it belongs to another Student. Soft-deleted rows are excluded by
   * TypeORM.
   */
  async findDetailRowByReportIdForStudent(
    studentId: string,
    reportId: string,
  ): Promise<ReportDetailRow | null> {
    return this.repo
      .createQueryBuilder('r')
      .select(REPORT_DETAIL_COLUMNS)
      .where('r.student_id = :studentId', { studentId })
      .andWhere('r.report_id = :reportId', { reportId })
      .getOne();
  }

  /**
   * A Report by the Blob-era `report_id`, regardless of owner (admin read). Null when it doesn't
   * exist; soft-deleted rows are excluded by TypeORM.
   */
  async findDetailRowByReportId(reportId: string): Promise<ReportDetailRow | null> {
    return this.repo
      .createQueryBuilder('r')
      .select(REPORT_DETAIL_COLUMNS)
      .where('r.report_id = :reportId', { reportId })
      .getOne();
  }

  /**
   * A Student's own Report by its unique `transcript_id`. Null for unknown or foreign transcripts.
   * Early-completion stubs (`report_id IS NULL`) are excluded.
   */
  async findDetailRowByTranscriptIdForStudent(
    studentId: string,
    transcriptId: string,
  ): Promise<ReportDetailRow | null> {
    return this.repo.findOne({
      select: REPORT_DETAIL_FIELDS,
      where: { transcriptId, studentId, reportId: Not(IsNull()) },
    });
  }

  /**
   * A Student's Report list, newest first. Selects
   * only the columns the list entry needs (no large jsonb). The optional mode matches
   * case-insensitively as a residual predicate on `idx_simulation_reports_student_created_live`.
   */
  async findListRowsByStudentId(studentId: string, mode?: string): Promise<ReportListRow[]> {
    return this.repo.find({
      select: REPORT_LIST_FIELDS,
      where: {
        studentId,
        reportId: Not(IsNull()),
        ...(mode && { mode: Raw((alias) => `lower(${alias}) = lower(:mode)`, { mode }) }),
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Inserts one Attempt unless its transcript is already stored (`ON CONFLICT DO NOTHING`, backed
   * by the unique `transcript_id` index). Returns the inserted row, or null when a row for the
   * transcript already exists — e.g. a concurrent request for the same transcript won.
   */
  async insertAttemptIfAbsent(row: AttemptRowInput): Promise<SimulationReport | null> {
    const result = await this.repo
      .createQueryBuilder()
      .insert()
      .into(SimulationReport)
      .values(row)
      .orIgnore()
      .returning('id')
      .execute();
    const insertedId = (result.raw as Array<{ id: string }>)[0]?.id;
    if (!insertedId) return null;
    return this.repo.findOneBy({ id: insertedId });
  }

  /**
   * How many Assessment-mode Attempts a student has stored for one scenario, from the typed `mode`
   * column only. Soft-deleted rows are excluded by TypeORM.
   */
  async countAssessmentAttempts(studentId: string, scenarioId: string): Promise<number> {
    return this.repo.count({
      where: { studentId, scenarioId, mode: ReportModeType.ASSESSMENT },
    });
  }

  /**
   * Every stored Attempt of a student, in any mode and scenario: how many there are and the sum of
   * their `total_time_seconds` column (null durations count as 0). Early-completion stubs count.
   */
  async getAttemptTotalsByStudentId(studentId: string): Promise<StudentAttemptTotals> {
    const raw = await this.repo
      .createQueryBuilder('sr')
      .select('COUNT(*)', 'attemptCount')
      .addSelect('COALESCE(SUM(sr.total_time_seconds), 0)', 'totalSeconds')
      .where('sr.student_id = :studentId', { studentId })
      .getRawOne<{ attemptCount: string; totalSeconds: string }>();
    return {
      attemptCount: Number(raw?.attemptCount ?? 0),
      totalSeconds: Number(raw?.totalSeconds ?? 0),
    };
  }

  /**
   * A student's Assessment-mode Attempts at one scenario, newest first by (created_at, id).
   */
  async findAssessmentAttemptsByStudentAndScenario(
    studentId: string,
    scenarioId: string,
  ): Promise<SimulationReport[]> {
    return this.repo.find({
      where: { studentId, scenarioId, mode: ReportModeType.ASSESSMENT },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  /** A student's newest Attempt at one scenario in any mode, by (created_at, id). */
  async findLatestAttemptByStudentAndScenario(
    studentId: string,
    scenarioId: string,
  ): Promise<SimulationReport | null> {
    return this.repo.findOne({
      where: { studentId, scenarioId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  async getAttentionCountsByClass(
    classId: string,
  ): Promise<{ report_count: string; unread_count: string }[]> {
    return this.repo
      .createQueryBuilder('sr')
      .innerJoin('students', 's', 's.id = sr.student_id')
      .select('COUNT(sr.id)', 'report_count')
      .addSelect('COUNT(sr.id) FILTER (WHERE sr.viewed_at IS NULL)', 'unread_count')
      .where('s.class_id = :classId', { classId })
      .andWhere('s.is_active = :isActive', { isActive: true })
      .getRawMany<{ report_count: string; unread_count: string }>();
  }

  async getAttentionCountsByClassIds(
    classIds: string[],
  ): Promise<{ class_id: string; report_count: string; unread_count: string }[]> {
    if (classIds.length === 0) return [];
    return this.repo
      .createQueryBuilder('sr')
      .innerJoin('students', 's', 's.id = sr.student_id')
      .select('s.class_id', 'class_id')
      .addSelect('COUNT(sr.id)', 'report_count')
      .addSelect('COUNT(sr.id) FILTER (WHERE sr.viewed_at IS NULL)', 'unread_count')
      .where('s.class_id IN (:...classIds)', { classIds })
      .andWhere('s.is_active = :isActive', { isActive: true })
      .groupBy('s.class_id')
      .getRawMany<{ class_id: string; report_count: string; unread_count: string }>();
  }

  /**
   * Per-class unread-report counts for classes the educator owns or co-instructs (live scope).
   */
  async getAttentionCountsByEducator(
    educatorId: string,
    schoolId?: string,
  ): Promise<{ class_id: string; report_count: string; unread_count: string }[]> {
    const qb = this.repo
      .createQueryBuilder('sr')
      .innerJoin('students', 's', 'sr.student_id = s.id AND s.is_active = TRUE')
      .innerJoin('classes', 'c', 's.class_id = c.id')
      .select('s.class_id', 'class_id')
      .addSelect('COUNT(sr.id)', 'report_count')
      .addSelect('COUNT(sr.id) FILTER (WHERE sr.viewed_at IS NULL)', 'unread_count')
      .where(ownerOrCoInstructorSql('c'), { educatorId })
      .andWhere(activeClassScopeSql('c'))
      .groupBy('s.class_id')
      .having('COUNT(sr.id) FILTER (WHERE sr.viewed_at IS NULL) > 0')
      .orderBy('unread_count', 'DESC');

    if (schoolId) {
      qb.andWhere('c.school_id = :schoolId', { schoolId });
    }

    return qb.getRawMany<{ class_id: string; report_count: string; unread_count: string }>();
  }

  /** Completion counts by month plus school, class (forSchool) or student (forClass) groups. */
  async getSimulationsCompletedGraph(
    educatorId: string,
    filters: SimulationsCompletedGraphFilters,
  ): Promise<SimulationsCompletedGraphResult> {
    const groupLevel = resolveSimulationsCompletedGraphGroupLevel(filters);
    const { conditions, params } = buildSimulationsCompletedGraphConditions(educatorId, filters);
    const compareLevel = resolveSimulationsCompletedGraphCompareLevel(filters);
    const sql = buildSimulationsCompletedGraphSql(
      conditions.join(' AND '),
      groupLevel,
      compareLevel,
    );
    const rows = await this.repo.query<SimulationsCompletedGraphRawRow[]>(sql, params);

    return groupSimulationsCompletedGraphRows(rows, groupLevel, compareLevel);
  }

  /**
   * RE-192: flat, paginated, filterable report listing for the bulk-review row selector.
   * Scoped to `simulation_reports` -> `students` -> `classes` the educator owns or
   * co-instructs (`ownerOrCoInstructorSql`), same base join as `RE-38`'s selector resolution.
   */
  async findReportsForListing(
    educatorId: string,
    filters: IReportListingFilters,
    sort: IReportListingSort,
    pagination: IReportListingPagination,
  ): Promise<IReportListingResult> {
    const qb = this.buildListingBaseQuery(educatorId, filters);

    const rowsQb = this.buildListingSelect(qb.clone(), sort)
      .offset(pagination.skip)
      .limit(pagination.take);

    const [total, rows] = await Promise.all([
      qb.getCount(),
      rowsQb.getRawMany<IReportListingRawRow>(),
    ]);

    return { rows, total };
  }

  /** Joins + scope + filters for the listing. Every Attempt is listed. */
  private buildListingBaseQuery(
    educatorId: string,
    filters: IReportListingFilters,
  ): SelectQueryBuilder<SimulationReport> {
    const qb = this.repo
      .createQueryBuilder('sr')
      .innerJoin('students', 's', 's.id = sr.student_id AND s.is_active = TRUE')
      .innerJoin('classes', 'c', 's.class_id = c.id')
      .leftJoin('simulations', 'sim', 'sim.id = sr.scenario_id')
      .where(liveClassScopeSql('c'))
      .andWhere(ownerOrCoInstructorSql('c'), { educatorId });

    if (filters.studentIds?.length) {
      qb.andWhere('sr.student_id IN (:...studentIds)', { studentIds: filters.studentIds });
    }
    if (filters.classIds?.length) {
      qb.andWhere('s.class_id IN (:...classIds)', { classIds: filters.classIds });
    }
    if (filters.schoolIds?.length) {
      qb.andWhere('c.school_id IN (:...schoolIds)', { schoolIds: filters.schoolIds });
    }
    if (filters.simulationIds?.length) {
      qb.andWhere('sr.scenario_id IN (:...simulationIds)', {
        simulationIds: filters.simulationIds,
      });
    }
    if (filters.reviewStatus === ReportReviewStatus.UNREAD) {
      qb.andWhere('sr.viewed_at IS NULL');
    } else if (filters.reviewStatus === ReportReviewStatus.READ) {
      qb.andWhere('sr.viewed_at IS NOT NULL');
    }

    return qb;
  }

  /** Select of the listing's typed columns plus the SQL sort and the `sr.id` tiebreaker. */
  private buildListingSelect(
    qb: SelectQueryBuilder<SimulationReport>,
    sort: IReportListingSort,
  ): SelectQueryBuilder<SimulationReport> {
    return qb
      .select('sr.id', 'reportId')
      .addSelect('s.student_id', 'studentCode')
      .addSelect('sr.studentName', 'studentName')
      .addSelect('sr.scenarioId', 'scenarioId')
      .addSelect(SIMULATION_NAME_EXPR, 'simulationName')
      .addSelect('sr.mode', 'mode')
      .addSelect('sr.score', 'score')
      .addSelect('sr.score_json', 'scoreJson')
      .addSelect('sr.performance_label', 'performanceLabel')
      .addSelect('sr.total_time_seconds', 'totalTimeSeconds')
      .addSelect('sr.transcript_id', 'transcriptId')
      .addSelect('sr.createdAt', 'completedAt')
      .addSelect('sr.viewedAt', 'viewedAt')
      .addSelect('sr.viewedBy', 'viewedBy')
      .orderBy(SORT_EXPR_BY_FIELD[sort.field], sort.direction)
      .addOrderBy('sr.id', 'ASC');
  }

  /** Query over every Attempt's columns. */
  private buildReportRowsQuery(): SelectQueryBuilder<SimulationReport> {
    return this.repo
      .createQueryBuilder('sr')
      .select(REPORT_ROW_FIELDS.map((field) => `sr.${field}`))
      .orderBy('sr.createdAt', 'DESC')
      .addOrderBy('sr.id', 'ASC');
  }

  /** Restricts a query on `sr` to the students of the educators a District Admin (a `users.id`)
   * owns, falling back to the students of the classes those educators teach when none match. */
  private applyAdminScope(
    qb: SelectQueryBuilder<SimulationReport>,
    adminId: string,
  ): SelectQueryBuilder<SimulationReport> {
    const educatorScope = `
      SELECT s.id FROM students s
      JOIN educators e ON e.id = s.educator_id
      LEFT JOIN district_admins da ON da.district_admin_id = e.district_admin_id
      LEFT JOIN user_roles dur ON dur.user_role_id = da.user_role_id
      WHERE dur.user_id = :adminId OR e.admin_id = :adminId`;
    const classScope = `
      SELECT s.id FROM students s
      JOIN classes c ON c.id = s.class_id
      JOIN educators e ON e.id = c.educator_id
      LEFT JOIN district_admins da ON da.district_admin_id = e.district_admin_id
      LEFT JOIN user_roles dur ON dur.user_role_id = da.user_role_id
      WHERE dur.user_id = :adminId OR e.admin_id = :adminId`;
    return qb.andWhere(
      `(sr.student_id IN (${educatorScope})
        OR (NOT EXISTS (${educatorScope}) AND sr.student_id IN (${classScope})))`,
      { adminId },
    );
  }

  /** The Reports of the given students, newest first. */
  async findReportRowsByStudentIds(studentIds: string[]): Promise<SimulationReportRow[]> {
    if (studentIds.length === 0) return [];
    return this.buildReportRowsQuery()
      .andWhere('sr.student_id = ANY(:studentIds::uuid[])', { studentIds })
      .getMany();
  }

  /** The Reports of a class's students whose school is still active, newest first. */
  async findReportRowsByClassId(classId: string): Promise<SimulationReportRow[]> {
    return this.buildReportRowsQuery()
      .innerJoin('students', 's', 's.id = sr.student_id')
      .leftJoin('schools', 'school', 'school.id = s.school_id')
      .andWhere('s.class_id = :classId', { classId })
      .andWhere('(s.school_id IS NULL OR school.is_active = true)')
      .getMany();
  }

  /** The Reports of an educator's active students whose school is still active, newest first. */
  async findReportRowsByEducatorId(educatorId: string): Promise<SimulationReportRow[]> {
    return this.buildReportRowsQuery()
      .innerJoin('students', 's', 's.id = sr.student_id')
      .leftJoin('schools', 'school', 'school.id = s.school_id')
      .andWhere('s.educator_id = :educatorId', { educatorId })
      .andWhere('s.is_active = true')
      .andWhere('(s.school_id IS NULL OR school.is_active = true)')
      .getMany();
  }

  /** The Reports of the students under a District Admin (a `users.id`), newest first. */
  async findReportRowsByAdminId(adminId: string): Promise<SimulationReportRow[]> {
    return this.applyAdminScope(this.buildReportRowsQuery(), adminId).getMany();
  }

  /** The Reports of a class's students created at or after `since`, newest first. */
  async findReportRowsByClassIdSince(classId: string, since: Date): Promise<SimulationReportRow[]> {
    return this.buildReportRowsQuery()
      .innerJoin('students', 's', 's.id = sr.student_id')
      .andWhere('s.class_id = :classId', { classId })
      .andWhere('sr.created_at >= :since', { since })
      .getMany();
  }

  /** One page of Reports, newest first, optionally for one student and/or scenario. */
  async findReportRowsPage(params: ReportPageParams): Promise<SimulationReportRow[]> {
    const qb = this.buildReportRowsQuery().offset(params.skip).limit(params.take);
    if (params.studentId)
      qb.andWhere('sr.student_id = :studentId', { studentId: params.studentId });
    if (params.scenarioId) {
      qb.andWhere('sr.scenario_id = :scenarioId', { scenarioId: params.scenarioId });
    }
    return qb.getMany();
  }

  /**
   * How many Attempts were completed in each UTC month since `since`, optionally only for the
   * students under one District Admin. Months with no Attempt are absent.
   */
  async countReportsPerMonth(params: ReportMonthlyCountParams): Promise<ReportMonthlyCount[]> {
    const monthExpr = `to_char(date_trunc('month', sr.created_at AT TIME ZONE 'UTC'), 'YYYY-MM')`;
    let qb = this.repo
      .createQueryBuilder('sr')
      .select(monthExpr, 'month')
      .addSelect('COUNT(*)', 'count')
      .where('sr.created_at >= :since', { since: params.since })
      .groupBy(monthExpr);
    if (params.adminId) qb = this.applyAdminScope(qb, params.adminId);
    const rows = await qb.getRawMany<{ month: string; count: string }>();
    return rows.map((row) => ({ month: row.month, count: Number(row.count) }));
  }

  /** A row by its uuid, else by the legacy `report_id`. */
  async findRowByIdOrReportId(id: string): Promise<SimulationReportRow | null> {
    if (isUuid(id)) {
      const byId = await this.repo.findOne({ select: REPORT_ROW_FIELDS, where: { id } });
      if (byId) return byId;
    }
    return this.repo.findOne({ select: REPORT_ROW_FIELDS, where: { reportId: id } });
  }

  /** The detail columns of a row by its uuid, else by the legacy `report_id`. */
  async findDetailRowByIdOrReportId(id: string): Promise<ReportDetailWithStudentRow | null> {
    const select: (keyof SimulationReport)[] = ['id', 'studentId', ...REPORT_DETAIL_FIELDS];
    if (isUuid(id)) {
      const byId = await this.repo.findOne({ select, where: { id } });
      if (byId) return byId;
    }
    return this.repo.findOne({ select, where: { reportId: id } });
  }

  /** The detail columns of a row by its unique `transcript_id`. */
  async findDetailRowByTranscriptId(
    transcriptId: string,
  ): Promise<ReportDetailWithStudentRow | null> {
    return this.repo.findOne({
      select: ['id', 'studentId', ...REPORT_DETAIL_FIELDS],
      where: { transcriptId },
    });
  }

  /**
   * The Report (earliest Attempt) of a student at one scenario, as detail columns, or null when
   * the student has no Attempt there.
   */
  async findReportDetailRowByStudentAndScenario(
    studentId: string,
    scenarioId: string,
  ): Promise<ReportDetailWithStudentRow | null> {
    return this.repo.findOne({
      select: ['id', 'studentId', ...REPORT_DETAIL_FIELDS],
      where: { studentId, scenarioId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  }

  /** The owner, scenario, mode and score columns of a row by its uuid, else by the legacy `report_id`. */
  async findOwnedScoreRowByIdOrReportId(id: string): Promise<ReportOwnedScoreRow | null> {
    const select: (keyof SimulationReport)[] = [
      'id',
      'studentId',
      'scenarioId',
      'mode',
      'score',
      'scoreJson',
    ];
    if (isUuid(id)) {
      const byId = await this.repo.findOne({ select, where: { id } });
      if (byId) return byId;
    }
    return this.repo.findOne({ select, where: { reportId: id } });
  }

  /** The mode and score columns of every Attempt a student has at one scenario. */
  async findScoreRowsByStudentAndScenario(
    studentId: string,
    scenarioId: string,
  ): Promise<ReportScoreModeRow[]> {
    return this.repo.find({
      select: ['mode', 'score', 'scoreJson'],
      where: { studentId, scenarioId },
    });
  }

  /** Every Attempt of a student, newest first. */
  async findAttemptRowsByStudentId(studentId: string): Promise<SimulationReportRow[]> {
    return this.repo.find({
      select: REPORT_ROW_FIELDS,
      where: { studentId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  /** The newest Attempt's report id, scenario and student name, or null when there is none. */
  async findLatestAttemptNotificationRow(
    studentId: string,
  ): Promise<LatestAttemptNotificationRow | null> {
    return this.repo.findOne({
      select: ['reportId', 'scenarioId', 'studentName'],
      where: { studentId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  /**
   * Which of `scenarioIds` the student has at least one Attempt at — matched by `students.id`
   * (`student_id`/`user_id`) or, when given, by Student Code (`student_code`/`user_id`).
   */
  async findScenarioIdsUsedByStudent(
    studentId: string,
    studentCode: string | null | undefined,
    scenarioIds: string[],
  ): Promise<string[]> {
    if (scenarioIds.length === 0) return [];
    const code = studentCode?.trim() || null;
    const rows = await this.repo
      .createQueryBuilder('sr')
      .select('sr.scenarioId', 'scenarioId')
      .distinct(true)
      .where(
        code
          ? '(sr.student_id = :studentId OR sr.user_id = CAST(:studentId AS text) OR sr.student_code = :code OR sr.user_id = :code)'
          : '(sr.student_id = :studentId OR sr.user_id = CAST(:studentId AS text))',
        { studentId, code },
      )
      .andWhere('sr.scenario_id = ANY(:scenarioIds)', { scenarioIds })
      .getRawMany<{ scenarioId: string }>();
    return rows.map((row) => row.scenarioId);
  }

  /**
   * The public id (legacy `report_id`, else uuid) of a Student Code's newest Attempt at one
   * scenario, or null. Matches the code via `students.student_id` or the row's `student_code`.
   */
  async findLatestReportIdByStudentCodeAndScenario(
    studentCode: string,
    scenarioId: string,
  ): Promise<string | null> {
    const row = await this.repo
      .createQueryBuilder('sr')
      .leftJoin('students', 's', 's.id = sr.student_id')
      .select('sr.id', 'id')
      .addSelect('sr.report_id', 'reportId')
      .where('sr.scenario_id = :scenarioId', { scenarioId })
      .andWhere('(UPPER(s.student_id) = UPPER(:code) OR UPPER(sr.student_code) = UPPER(:code))', {
        code: studentCode,
      })
      .orderBy('sr.created_at', 'DESC')
      .addOrderBy('sr.id', 'DESC')
      .limit(1)
      .getRawOne<{ id: string; reportId: string | null }>();
    if (!row) return null;
    return row.reportId?.trim() || row.id;
  }

  /** Whether the report (uuid or legacy `report_id`) belongs to the Student Code at the scenario. */
  async isReportOfStudentCodeAndScenario(
    id: string,
    studentCode: string,
    scenarioId: string,
  ): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('sr')
      .leftJoin('students', 's', 's.id = sr.student_id')
      .where('sr.scenario_id = :scenarioId', { scenarioId })
      .andWhere('(UPPER(s.student_id) = UPPER(:code) OR UPPER(sr.student_code) = UPPER(:code))', {
        code: studentCode,
      });
    if (isUuid(id)) {
      qb.andWhere('(sr.id = CAST(:id AS uuid) OR sr.report_id = :id)', { id });
    } else {
      qb.andWhere('sr.report_id = :id', { id });
    }
    return (await qb.getCount()) > 0;
  }

  /** Active students of a class with at least one Attempt at any of `scenarioIds`. */
  async findStudentIdsWhoUsedScenariosInClass(
    classId: string,
    scenarioIds: string[],
  ): Promise<string[]> {
    if (scenarioIds.length === 0) return [];
    const rows = await this.repo
      .createQueryBuilder('sr')
      .innerJoin('students', 's', 's.id = sr.student_id')
      .select('sr.studentId', 'studentId')
      .distinct(true)
      .where('sr.scenario_id = ANY(:scenarioIds)', { scenarioIds })
      .andWhere('s.class_id = :classId', { classId })
      .andWhere('s.is_active = true')
      .getRawMany<{ studentId: string }>();
    return rows.map((row) => row.studentId);
  }

  /** The (student, scenario) pairs among the given ones that have at least one Attempt. */
  async findStudentScenarioPairsWithAttempts(
    studentIds: string[],
    scenarioIds: string[],
  ): Promise<StudentScenarioPair[]> {
    if (studentIds.length === 0 || scenarioIds.length === 0) return [];
    return this.repo
      .createQueryBuilder('sr')
      .select('sr.studentId', 'studentId')
      .addSelect('sr.scenarioId', 'scenarioId')
      .distinct(true)
      .where('sr.student_id = ANY(:studentIds::uuid[])', { studentIds })
      .andWhere('sr.scenario_id = ANY(:scenarioIds)', { scenarioIds })
      .getRawMany<StudentScenarioPair>();
  }

  /**
   * Mark/unmark a scoped selection of reports reviewed in one atomic UPDATE.
   * Scope is always narrowed to reports belonging to students in classes the
   * caller owns or co-instructs, regardless of selector kind. Returns every
   * updated row's report/student/scenario/class ids so the caller can work
   * out, per selector kind, which requested ids yielded zero updated rows
   * (the ownership check happens inline in this statement's `WHERE ... IN
   * (subquery)`, using `ownerOrCoInstructorSql`, never as a separate query —
   * one round trip, built entirely through TypeORM's QueryBuilder, no raw SQL).
   */
  async bulkReview(params: BulkReviewParams): Promise<BulkReviewRawRow[]> {
    const { selectorType, ids, reviewed, educatorId } = params;
    const selectorColumn = BULK_REVIEW_SELECTOR_COLUMN[selectorType];
    const viewedAt = reviewed ? new Date() : null;
    const viewedBy = reviewed ? educatorId : null;

    const scopedIdsSubQuery = this.repo
      .createQueryBuilder()
      .subQuery()
      .select('sr.id')
      .from(SimulationReport, 'sr')
      .innerJoin('students', 's', 's.id = sr.student_id')
      .innerJoin('classes', 'c', 'c.id = s.class_id')
      .where('s.is_active = TRUE')
      .andWhere(liveClassScopeSql('c'))
      .andWhere(ownerOrCoInstructorSql('c'), { educatorId })
      .andWhere(`${selectorColumn}::text = ANY(:ids::text[])`, { ids })
      .getQuery();

    const result = await this.repo
      .createQueryBuilder()
      .update(SimulationReport)
      .set({ viewedAt, viewedBy })
      .where(`id IN (${scopedIdsSubQuery})`)
      .setParameters({ educatorId, ids })
      .returning(
        `id, student_id, scenario_id, ` +
          `(SELECT s2.class_id FROM students s2 WHERE s2.id = simulation_reports.student_id) AS class_id`,
      )
      .execute();

    return result.raw as BulkReviewRawRow[];
  }
}
