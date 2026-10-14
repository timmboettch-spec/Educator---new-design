import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  In,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { Student } from 'src/database/entities';
import { CommonStatus } from 'src/common/enums/status.enum';
import { ClassStudentCodesExportConstants } from 'src/common/constants';
import {
  ClassStudentCodesExportCursor,
  ClassStudentCodesExportRawRow,
  ClassStudentCodesExportRow,
  PaginatedRows,
  StudentFilters,
  StudentLiteRow,
  StudentRow,
  StudentSortOptions,
} from 'src/common/interfaces';
import { ownerOrCoInstructorSql } from 'src/common/utils/educator-access.util';
import { escapeLikeWildcards } from 'src/common/utils/sql-like.util';
import { StudentCodeStatus, StudentSortField } from 'src/students/students.constants';

interface StudentClassNameRow {
  student_name: string;
  student_id: string;
  class_id: string;
  class_name: string;
}

@Injectable()
export class StudentRepository {
  constructor(
    @InjectRepository(Student)
    private readonly repo: Repository<Student>,
  ) {}

  async create(data: DeepPartial<Student>): Promise<Student> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async saveMany(data: DeepPartial<Student>[]): Promise<Student[]> {
    const entities = data.map((d) => this.repo.create(d));
    return this.repo.save(entities);
  }

  async find(options: FindManyOptions<Student> = {}): Promise<Student[]> {
    return this.repo.find(options);
  }

  async findOne(options: FindOneOptions<Student>): Promise<Student | null> {
    return this.repo.findOne(options);
  }

  async count(options: FindManyOptions<Student> = {}): Promise<number> {
    return this.repo.count(options);
  }

  async update(id: string, data: DeepPartial<Student>): Promise<number> {
    const result = await this.repo.update(id, data);
    return result.affected ?? 0;
  }

  async deleteById(id: string): Promise<boolean> {
    const result = await this.repo.delete({ id });
    return (result.affected ?? 0) > 0;
  }

  /** All non-empty, non-null student_id codes — used to avoid collisions when generating new codes. */
  async findAllNonEmptyStudentCodes(): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('s')
      .select('s.student_id', 'student_id')
      .where(`s.student_id IS NOT NULL AND s.student_id <> ''`)
      .getRawMany<{ student_id: string }>();
    return rows.map((r) => r.student_id);
  }

  /** Find which of the provided student codes already exist in the database (case-insensitive). */
  async findExistingStudentCodes(codes: string[]): Promise<string[]> {
    const cleaned = codes.map((c) => c.trim()).filter((c) => c.length > 0);
    if (cleaned.length === 0) return [];
    const upperCodes = Array.from(new Set(cleaned.map((c) => c.toUpperCase())));
    const rows = await this.repo
      .createQueryBuilder('s')
      .select('s.student_id', 'student_id')
      .where('UPPER(s.student_id) IN (:...upperCodes)', { upperCodes })
      .getRawMany<{ student_id: string }>();
    return rows.map((r) => r.student_id);
  }

  /** Of the given codes, those held by an active student in the class (exact, case-sensitive match) — one query. */
  async findActiveCodesInClass(classId: string, codes: string[]): Promise<string[]> {
    if (codes.length === 0) return [];
    const rows = await this.repo.find({
      select: { student_id: true },
      where: { student_id: In(codes), class: { id: classId }, is_active: true },
    });
    return rows.flatMap((r) => (r.student_id ? [r.student_id] : []));
  }

  /** Active students in a class, with class + educator loaded and inactive schools excluded, newest first. */
  async findActiveByClassWithClassAndEducator(classId: string): Promise<Student[]> {
    return this.repo
      .createQueryBuilder('s')
      .leftJoin('s.school', 'school')
      .leftJoinAndSelect('s.class', 'cls')
      .leftJoinAndSelect('s.educator', 'educator')
      .where('s.class_id = :classId', { classId })
      .andWhere('s.is_active = true')
      .andWhere('(s.school_id IS NULL OR school.is_active = true)')
      .orderBy('s.id', 'DESC')
      .getMany();
  }

  /** Count of active students in active classes owned by an admin's educators — dashboard overview. */
  async countActiveForAdmin(adminId: string): Promise<number> {
    return this.repo
      .createQueryBuilder('s')
      .innerJoin('s.educator', 'e')
      .innerJoin('e.admin', 'a')
      .innerJoin('a.userRole', 'aur')
      .innerJoin('s.class', 'c')
      .where('aur.userId = :adminId', { adminId })
      .andWhere('s.status = :status', { status: CommonStatus.ACTIVE })
      .andWhere('c.status = :classStatus', { classStatus: CommonStatus.ACTIVE })
      .andWhere('s.deleted_at IS NULL')
      .getCount();
  }

  /** Preview list of active students in active classes owned by an admin's educators — dashboard overview. */
  async findActiveForAdmin(adminId: string, limit: number): Promise<Student[]> {
    return this.repo
      .createQueryBuilder('s')
      .innerJoin('s.educator', 'e')
      .innerJoin('e.admin', 'a')
      .innerJoin('a.userRole', 'aur')
      .innerJoin('s.class', 'c')
      .where('aur.userId = :adminId', { adminId })
      .andWhere('s.status = :status', { status: CommonStatus.ACTIVE })
      .andWhere('c.status = :classStatus', { classStatus: CommonStatus.ACTIVE })
      .andWhere('s.deleted_at IS NULL')
      .take(limit)
      .getMany();
  }

  private applySuffixWhere(qb: SelectQueryBuilder<Student>, suffixes: string[]): void {
    const params: Record<string, string> = {};
    const predicates: string[] = [];
    suffixes.forEach((suffix, i) => {
      const key = `suffix${i}`;
      predicates.push(`s.student_id LIKE :${key}`);
      params[key] = `%${suffix}`;
    });
    qb.andWhere(`(${predicates.join(' OR ')})`, params);
  }

  /** Active student in a school matching one of the given student_id suffixes (LMS user-id matching). */
  async findActiveBySuffixInSchool(schoolId: string, suffixes: string[]): Promise<Student | null> {
    const qb = this.repo
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.class', 'c')
      .innerJoin('s.educator', 'e')
      .innerJoin('e.school', 'sch')
      .where('sch.id = :schoolId', { schoolId })
      .andWhere('s.is_active = true')
      .orderBy('s.updated_at', 'DESC')
      .addOrderBy('s.created_at', 'DESC');
    this.applySuffixWhere(qb, suffixes);
    return qb.getOne();
  }

  /** Any (active or inactive) student in a school matching one of the given student_id suffixes. */
  async findBySuffixInSchool(schoolId: string, suffixes: string[]): Promise<Student | null> {
    const qb = this.repo
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.class', 'c')
      .innerJoin('s.educator', 'e')
      .innerJoin('e.school', 'sch')
      .where('sch.id = :schoolId', { schoolId })
      .orderBy('s.updated_at', 'DESC')
      .addOrderBy('s.created_at', 'DESC');
    this.applySuffixWhere(qb, suffixes);
    return qb.getOne();
  }

  /** Active students anywhere matching one of the given student_id suffixes (global LMS user-id matching). */
  async findActiveBySuffixGlobal(suffixes: string[]): Promise<Student[]> {
    const qb = this.repo
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.class', 'c')
      .where('s.is_active = true')
      .orderBy('s.updated_at', 'DESC')
      .addOrderBy('s.created_at', 'DESC');
    this.applySuffixWhere(qb, suffixes);
    return qb.getMany();
  }

  /** Any (active or inactive) students anywhere matching one of the given student_id suffixes. */
  async findBySuffixGlobal(suffixes: string[]): Promise<Student[]> {
    const qb = this.repo
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.class', 'c')
      .orderBy('s.updated_at', 'DESC')
      .addOrderBy('s.created_at', 'DESC');
    this.applySuffixWhere(qb, suffixes);
    return qb.getMany();
  }

  /** Student's class name + display fields by UUID, joined via the raw `classes` table (report enrichment). */
  async findClassNameRowById(studentId: string): Promise<StudentClassNameRow | undefined> {
    const rows = await this.repo
      .createQueryBuilder('s')
      .leftJoin('classes', 'c', 'c.id = s.class_id')
      .select('s.student_name', 'student_name')
      .addSelect('s.student_id', 'student_id')
      .addSelect('s.class_id', 'class_id')
      .addSelect('c.class_name', 'class_name')
      .where('s.id = :studentId', { studentId })
      .limit(1)
      .getRawMany<StudentClassNameRow>();
    return rows[0];
  }

  /** The `students.id` uuid for a Student Code, or null when no student has that code. */
  async findIdByStudentCode(studentCode: string): Promise<string | null> {
    const student = await this.repo.findOne({
      select: { id: true },
      where: { student_id: studentCode },
    });
    return student?.id ?? null;
  }

  /** Student's class name + display fields by student code, joined via the raw `classes` table. */
  async findClassNameRowByCode(studentCode: string): Promise<StudentClassNameRow | undefined> {
    const rows = await this.repo
      .createQueryBuilder('s')
      .leftJoin('classes', 'c', 'c.id = s.class_id')
      .select('s.student_name', 'student_name')
      .addSelect('s.student_id', 'student_id')
      .addSelect('s.class_id', 'class_id')
      .addSelect('c.class_name', 'class_name')
      .where('s.student_id = :studentCode', { studentCode })
      .limit(1)
      .getRawMany<StudentClassNameRow>();
    return rows[0];
  }

  /** Owner-or-co-instructor floor + class/school/active filters, shared by the `findStudents` branches. */
  private applyStudentFilters(
    qb: SelectQueryBuilder<Student>,
    educatorId: string,
    filters: StudentFilters,
  ): void {
    qb.innerJoin('classes', 'c', 'c.id = s.class_id')
      .where(ownerOrCoInstructorSql('c'), { educatorId })
      .andWhere('s.deleted_at IS NULL');

    if (filters.search) {
      qb.andWhere('s.student_id ILIKE :search', {
        search: `%${escapeLikeWildcards(filters.search)}%`,
      });
    }
    if (filters.classIds?.length) {
      qb.andWhere('s.class_id IN (:...classIds)', { classIds: filters.classIds });
    }
    if (filters.schoolIds?.length) {
      qb.andWhere('s.school_id IN (:...schoolIds)', { schoolIds: filters.schoolIds });
    }
    if (filters.isActive !== undefined) {
      qb.andWhere('s.is_active = :isActive', { isActive: filters.isActive });
    }
  }

  private async countStudents(educatorId: string, filters: StudentFilters): Promise<number> {
    const countQb = this.repo.createQueryBuilder('s');
    this.applyStudentFilters(countQb, educatorId, filters);
    return countQb.getCount();
  }

  /**
   * These are free-text columns, not guaranteed numeric/time values, so sorting them as
   * strings would be wrong (`'10'` before `'9'`). Each is cast to a real number for ORDER
   * BY, guarded by a regex so a malformed value falls back to `0` instead of erroring the
   * query. The minute/second groups use `[0-5][0-9]`, not `[0-9]{2}` — Postgres's
   * `interval` cast rejects MM/SS ≥ 60 (e.g. `'05:60:00'`), so a looser regex would let a
   * bad-but-right-shaped value through the guard and crash the query.
   */
  private static readonly SIMS_COMPLETED_SORT_SQL = `CASE WHEN s.sims_completed ~ '^[0-9]+$' THEN s.sims_completed::int ELSE 0 END`;
  private static readonly TIME_SPENT_SORT_SQL = `CASE WHEN s.time_spent ~ '^[0-9]+:[0-5][0-9]:[0-5][0-9]$' THEN EXTRACT(EPOCH FROM s.time_spent::interval) ELSE 0 END`;
  private static readonly TIME_REMAINING_SORT_SQL = `CASE WHEN s.time_remaining ~ '^[0-9]+:[0-5][0-9]:[0-5][0-9]$' THEN EXTRACT(EPOCH FROM s.time_remaining::interval) ELSE 0 END`;

  /**
   * `reports_count`/`code_status` are SELECT aliases that only exist on the full branch of
   * `findStudents` — `lite` falls back to the default order instead of ordering by an alias
   * `findStudentsLite`'s query never selects.
   */
  private mapStudentSortColumn(field?: StudentSortField, lite = false): string {
    switch (field) {
      case StudentSortField.STUDENT_CODE:
        return 's.student_id';
      case StudentSortField.NAME:
        return 'gsm.google_name';
      case StudentSortField.TIME_SPENT:
        return StudentRepository.TIME_SPENT_SORT_SQL;
      case StudentSortField.TIME_REMAINING:
        return StudentRepository.TIME_REMAINING_SORT_SQL;
      case StudentSortField.SIMS_COMPLETED:
        return StudentRepository.SIMS_COMPLETED_SORT_SQL;
      case StudentSortField.SCORE:
        return 's.score';
      case StudentSortField.SUBMISSION_DATE:
        return 's.submission_date';
      case StudentSortField.STATUS:
        return 's.status';
      case StudentSortField.IS_ACTIVE:
        return 's.is_active';
      case StudentSortField.REPORTS:
        return lite ? 's.created_at' : 'reports_count';
      case StudentSortField.CODE_STATUS:
        return lite ? 's.created_at' : 'code_status';
      default:
        return 's.created_at';
    }
  }

  async findStudents(
    educatorId: string,
    filters: StudentFilters & { lite: true },
    sort: StudentSortOptions,
    pagination: { skip: number; take: number },
  ): Promise<PaginatedRows<StudentLiteRow>>;
  async findStudents(
    educatorId: string,
    filters: StudentFilters & { lite?: false | undefined },
    sort: StudentSortOptions,
    pagination: { skip: number; take: number },
  ): Promise<PaginatedRows<StudentRow>>;
  async findStudents(
    educatorId: string,
    filters: StudentFilters & { lite?: boolean },
    sort: StudentSortOptions,
    pagination: { skip: number; take: number },
  ): Promise<PaginatedRows<StudentRow> | PaginatedRows<StudentLiteRow>>;
  async findStudents(
    educatorId: string,
    filters: StudentFilters & { lite?: boolean },
    sort: StudentSortOptions,
    pagination: { skip: number; take: number },
  ): Promise<PaginatedRows<StudentRow> | PaginatedRows<StudentLiteRow>> {
    return filters.lite
      ? this.findStudentsLite(educatorId, filters, sort, pagination)
      : this.findStudentsFull(educatorId, filters, sort, pagination);
  }

  /** `lite: true` branch of `findStudents` — id + student code + Google-roster name only. */
  private async findStudentsLite(
    educatorId: string,
    filters: StudentFilters,
    sort: StudentSortOptions,
    pagination: { skip: number; take: number },
  ): Promise<PaginatedRows<StudentLiteRow>> {
    const total = await this.countStudents(educatorId, filters);

    const qb = this.repo
      .createQueryBuilder('s')
      .select('s.id', 'id')
      .addSelect('s.student_id', 'student_id')
      .leftJoin('google_student_mappings', 'gsm', 'gsm.student_id = s.id')
      .addSelect('gsm.google_name', 'name');
    this.applyStudentFilters(qb, educatorId, filters);
    qb.orderBy(this.mapStudentSortColumn(sort.field, true), sort.dir)
      .addOrderBy('s.id', 'ASC')
      // `.skip()/.take()` silently no-op on `getRawMany()` once the query has any join
      // (TypeORM's createLimitOffsetExpression) — `.offset()/.limit()` don't have that gap.
      .offset(pagination.skip)
      .limit(pagination.take);

    const raw = await qb.getRawMany<{ id: string; student_id: string; name: string | null }>();
    const rows: StudentLiteRow[] = raw.map((row) => ({
      id: row.id,
      studentId: row.student_id,
      name: row.name,
    }));
    return { rows, total };
  }

  /** Full branch of `findStudents` — every summary column plus reports count and derived code status. */
  private async findStudentsFull(
    educatorId: string,
    filters: StudentFilters,
    sort: StudentSortOptions,
    pagination: { skip: number; take: number },
  ): Promise<PaginatedRows<StudentRow>> {
    const total = await this.countStudents(educatorId, filters);

    const qb = this.repo
      .createQueryBuilder('s')
      .select('s.id', 'id')
      .addSelect('s.student_id', 'student_id')
      .addSelect('s.class_id', 'class_id')
      .addSelect('s.school_id', 'school_id')
      .addSelect('s.status', 'status')
      .addSelect('s.is_active', 'is_active')
      .addSelect('s.submission_date', 'submission_date')
      .addSelect('s.sims_completed', 'sims_completed')
      .addSelect('s.score', 'score')
      .addSelect('s.time_spent', 'time_spent')
      .addSelect('s.time_remaining', 'time_remaining')
      .addSelect(
        '(SELECT COUNT(*) FROM simulation_reports sr WHERE sr.student_id = s.id)',
        'reports_count',
      )
      .addSelect(
        `CASE WHEN s.student_id = '' OR s.student_id IS NULL THEN '${StudentCodeStatus.REVOKED}' ELSE '${StudentCodeStatus.ACTIVE}' END`,
        'code_status',
      )
      .leftJoin('google_student_mappings', 'gsm', 'gsm.student_id = s.id')
      .addSelect('gsm.google_name', 'name')
      .addSelect('gsm.google_email', 'email');
    this.applyStudentFilters(qb, educatorId, filters);
    qb.orderBy(this.mapStudentSortColumn(sort.field), sort.dir)
      .addOrderBy('s.id', 'ASC')
      // See the matching comment in `findStudentsLite` — `.offset()/.limit()`, not
      // `.skip()/.take()`, is required for LIMIT/OFFSET to actually reach the SQL here.
      .offset(pagination.skip)
      .limit(pagination.take);

    const raw = await qb.getRawMany<{
      id: string;
      student_id: string;
      class_id: string | null;
      school_id: string | null;
      status: CommonStatus;
      is_active: boolean;
      submission_date: string | null;
      sims_completed: string | null;
      score: string | null;
      time_spent: string | null;
      time_remaining: string | null;
      reports_count: string;
      code_status: StudentCodeStatus;
      name: string | null;
      email: string | null;
    }>();

    const rows: StudentRow[] = raw.map((row) => ({
      id: row.id,
      studentId: row.student_id,
      name: row.name,
      email: row.email,
      classId: row.class_id,
      schoolId: row.school_id,
      status: row.status,
      isActive: row.is_active,
      submissionDate: row.submission_date,
      simsCompleted: row.sims_completed,
      score: row.score === null ? null : Number(row.score),
      timeSpent: row.time_spent,
      timeRemaining: row.time_remaining,
      reportsCount: Number(row.reports_count),
      codeStatus: row.code_status,
    }));
    return { rows, total };
  }

  /**
   * Streams every exportable student of one class in enrolment order (`created_at`, then `id`),
   * `batchSize` rows per query. Exportable = live, active, has a code, and a status that can
   * still sign in. Keyset (not OFFSET) pagination, so each page is a cheap indexed read and no
   * DB connection is held while the consumer is paused between batches.
   *
   * The cursor carries `created_at` as Postgres text, not a JS `Date`: `timestamptz` has
   * microsecond precision and `Date` only milliseconds, so a `Date` cursor would skip or repeat
   * rows created within the same millisecond.
   */
  async *iterateStudentCodesByClass(
    educatorId: string,
    classId: string,
    batchSize: number,
  ): AsyncGenerator<ClassStudentCodesExportRow[]> {
    let cursor: ClassStudentCodesExportCursor | null = null;

    for (;;) {
      const qb = this.repo
        .createQueryBuilder('s')
        .select('s.id', 'id')
        .addSelect('s.student_id', 'student_id')
        .addSelect('CAST(s.created_at AS text)', 'created_at_cursor')
        .leftJoin('google_student_mappings', 'gsm', 'gsm.student_id = s.id')
        .addSelect('gsm.google_name', 'name');
      this.applyStudentFilters(qb, educatorId, { classIds: [classId], isActive: true });
      qb.andWhere("s.student_id IS NOT NULL AND s.student_id <> ''").andWhere(
        's.status NOT IN (:...excludedStatuses)',
        { excludedStatuses: ClassStudentCodesExportConstants.EXCLUDED_STATUSES },
      );
      if (cursor) {
        qb.andWhere(
          '(s.created_at, s.id) > (CAST(:cursorCreatedAt AS timestamptz), CAST(:cursorId AS uuid))',
          cursor,
        );
      }
      // `.limit()`, not `.take()` — see the matching comment in `findStudentsLite`.
      qb.orderBy('s.created_at', 'ASC').addOrderBy('s.id', 'ASC').limit(batchSize);

      const raw = await qb.getRawMany<ClassStudentCodesExportRawRow>();
      if (!raw.length) return;

      yield raw.map((row) => ({ id: row.id, studentId: row.student_id, name: row.name }));

      if (raw.length < batchSize) return;
      const last = raw[raw.length - 1];
      cursor = { cursorCreatedAt: last.created_at_cursor, cursorId: last.id };
    }
  }
}
