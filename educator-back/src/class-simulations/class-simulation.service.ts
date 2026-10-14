import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { In, Not } from 'typeorm';
import { LoggerService } from 'src/common/services';

import { AssignClassSimulationDto } from './dto/class-simulation.dto';
import {
  ClassSimulationListItemResDto,
  ListClassSimulationsReqDto,
} from './dto/list-class-simulations.dto';
import {
  BulkAssignClassSimulationsReqDto,
  BulkAssignClassSimulationsResDto,
  BulkAssignPairResultResDto,
} from './dto/bulk-assign-class-simulations.dto';
import {
  UpdateClassSimulationReqDto,
  UpdateClassSimulationResDto,
} from './dto/update-class-simulation.dto';
import {
  ClassSimulationAssignmentConstants,
  ClassSimulationAssignmentFailureReason,
  ClassSimulationAssignmentStatus,
  ClassSimulationListingConstants,
} from 'src/common/constants';
import type {
  IAssignmentDateRange,
  IBulkAssignClassSimulationRow,
  IBulkAssignPairOutcome,
} from 'src/common/interfaces';
import { BulkOperationException } from 'src/common/exceptions/bulk-operation.exception';
import { CLASS_SIMULATION_MSG } from 'src/common/messages/class-simulation.message';
import { findAccessibleClassForEducator } from 'src/common/utils/class-access.util';
import { runWithConcurrency } from 'src/common/utils/concurrency.util';
import {
  assignmentRangesOverlap,
  isSameAssignmentRange,
  normalizeAssignmentDate,
} from 'src/common/utils/assignment-date.util';
import { assertEducator } from 'src/common/utils/current-user.util';
import { buildPaginationMeta, getPagination } from 'src/common/utils/pagination.util';
import { BlobScenario, BlobUnit, MappedSimulation, ServiceResponse } from 'src/common/types';
import { ErrorTypes } from 'src/common/utils/messages';
import { throwAppError } from 'src/common/utils/app-error';
import { handleError } from 'src/common/utils/common.util';
import { ResponseResult } from 'src/common/class/response.class';
import { SUCCESS_MSG } from 'src/common/messages/success.message';
import { ERROR_MSG } from 'src/common/messages/error.message';
import type { ICurrentUser, IPaginationMeta } from 'src/common/interfaces';
import { ClassSimulationConstants } from './class-simulation.constant';
import { ClassConstants } from 'src/class/constants';
import { EducatorsService } from 'src/educators/educators.service';

import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { NotificationsConstants } from 'src/notifications/notifications.constants';
import { ConfigService } from '@nestjs/config';
import { Class, ClassSimulation, SimulationV2, Educator } from 'src/database/entities';
import { CommonStatus } from 'src/common/enums/status.enum';
import {
  CLASS_REPOSITORY,
  CLASS_SIMULATION_REPOSITORY,
  EDUCATOR_REPOSITORY,
  EDUCATOR_SCHOOL_REPOSITORY,
  SIMULATION_V2_REPOSITORY,
  SIMULATION_REPORT_REPOSITORY,
  STUDENT_REPOSITORY,
  UNIT_REPOSITORY,
} from 'src/database/tokens';
import {
  ClassRepository,
  ClassSimulationRepository,
  EducatorRepository,
  EducatorSchoolRepository,
  SimulationReportRepository,
  SimulationV2Repository,
  StudentRepository,
  UnitRepository,
} from 'src/database/repositories';
import { DatabaseService } from 'src/database/services/database.service';
import { GoogleCourseworkService } from 'src/google/google-coursework.service';

/** Input of `ClassSimulationService.runPostAssignSideEffects`; dates are normalised `YYYY-MM-DD`. */
interface PostAssignSideEffectsParams {
  educatorId: string;
  classId: string;
  classEntity: Class;
  simulationId: string;
  simulation: SimulationV2;
  classSimulationId: string;
  startDate?: string;
  dueDate?: string;
  endDate?: string;
  /** Passed to Google CourseWork as-is — legacy `assign` sends the raw request value. */
  courseworkDueDate?: string;
  logTag: string;
}

@Injectable()
export class ClassSimulationService {
  private isAiCategoryLabel(value?: string | null): boolean {
    if (!value) return false;

    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;

    if (normalized === 'ai' || normalized.includes('artificial intelligence')) {
      return true;
    }

    if (normalized.split(/[^a-z0-9]+/).some((token) => token === 'ai')) {
      return true;
    }

    return normalized.startsWith('ai') && normalized.includes('sim');
  }

  private async requiresAiSeats(
    simulation: SimulationV2,
    scenario: BlobScenario,
  ): Promise<boolean> {
    // avatarEnabled (set explicitly via Student Admin) is the single source of truth for
    // AI Only vs Manikin — see Educator-App-Realityworks/src/utils/simulationType.ts. It must
    // win over legacy class/department/category labels, otherwise a scenario flipped to
    // Manikin keeps reserving AI seats because an old category string still says "AI".
    if (typeof scenario.avatarEnabled === 'boolean') {
      return scenario.avatarEnabled;
    }

    if (
      this.isAiCategoryLabel(simulation.class) ||
      this.isAiCategoryLabel(simulation.department) ||
      this.isAiCategoryLabel(scenario.class) ||
      this.isAiCategoryLabel(scenario.department)
    ) {
      return true;
    }
    if (simulation.avatarEnabled) {
      return true;
    }

    const unitId = (simulation.unitId ?? scenario.unitId ?? '').trim();
    if (!unitId) return false;

    const rows: unknown = await this.dataSource.connection.query(
      `SELECT category FROM simulation_library WHERE unit_id = $1`,
      [unitId],
    );

    if (Array.isArray(rows) && rows.length > 0) {
      const hasAiCategory = rows.some((row: unknown) => {
        if (!row || typeof row !== 'object') return false;
        const category = (row as { category?: string | null }).category;
        return this.isAiCategoryLabel(category ?? null);
      });
      if (hasAiCategory) {
        return true;
      }
    }

    const unit = await this.unitRepository.findByBusinessId(unitId);
    if (unit && this.isAiCategoryLabel(unit.category)) {
      return true;
    }

    return false;
  }

  private getDueReminderWindowDays(): number {
    const configured = this.configService.get<string>('app.notificationDueReminderDays');
    const parsed = Number(configured);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
    return NotificationsConstants.DEFAULTS.DUE_DATE_REMINDER_DAYS;
  }

  private parseDueDate(rawDate?: string): Date | null {
    if (!rawDate) return null;
    const trimmed = rawDate.trim();
    if (!trimmed || trimmed.includes('undefined')) return null;
    const mmddyyyy = /^(\d{2})-(\d{2})-(\d{4})$/;
    // A date-only YYYY-MM-DD is read as a local calendar date too: `new Date('2026-01-15')`
    // would be UTC midnight, i.e. the previous day on a server west of UTC.
    const isoDateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    const match = mmddyyyy.exec(trimmed) ?? isoDateOnly;
    if (match) {
      const month = Number(isoDateOnly ? match[2] : match[1]);
      const day = Number(isoDateOnly ? match[3] : match[2]);
      const year = Number(isoDateOnly ? match[1] : match[3]);
      const parsed = new Date(year, month - 1, day);
      return Number.isNaN(parsed.getTime()) ||
        parsed.getFullYear() !== year ||
        parsed.getMonth() !== month - 1 ||
        parsed.getDate() !== day
        ? null
        : parsed;
    }
    if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(trimmed)) return null;
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private shouldSendDueReminder(dueDate?: string): boolean {
    const parsed = this.parseDueDate(dueDate);
    if (!parsed) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    parsed.setHours(0, 0, 0, 0);

    const days = Math.ceil((parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return days >= 0 && days <= this.getDueReminderWindowDays();
  }

  private shouldSendDateReminder(date?: string): boolean {
    return this.shouldSendDueReminder(date);
  }

  constructor(
    private readonly educatorService: EducatorsService,
    @Inject(CLASS_SIMULATION_REPOSITORY)
    private readonly repo: ClassSimulationRepository,
    @Inject(CLASS_REPOSITORY)
    private readonly classRepo: ClassRepository,
    @Inject(SIMULATION_V2_REPOSITORY)
    private readonly simulationRepo: SimulationV2Repository,
    @Inject(STUDENT_REPOSITORY)
    private readonly studentRepo: StudentRepository,
    @Inject(UNIT_REPOSITORY)
    private readonly unitRepository: UnitRepository,
    @Inject(SIMULATION_REPORT_REPOSITORY)
    private readonly simulationReportRepo: SimulationReportRepository,
    private readonly dataSource: DatabaseService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    @Inject(forwardRef(() => GoogleCourseworkService))
    private readonly googleCourseworkService: GoogleCourseworkService,
    @Inject(EDUCATOR_SCHOOL_REPOSITORY)
    private readonly educatorSchoolRepo: EducatorSchoolRepository,
    @Inject(EDUCATOR_REPOSITORY)
    private readonly educatorRepo: EducatorRepository,
  ) {}

  /**
   * Class-page "Sims" table: the simulations assigned to one class, with started/completed/
   * average aggregates over DB reports, sorted and paginated. New-pattern (`ResponseResult`).
   */
  async findClassSimulations(
    currentUser: ICurrentUser,
    dto: ListClassSimulationsReqDto,
  ): Promise<ResponseResult<ClassSimulationListItemResDto[], IPaginationMeta>> {
    try {
      assertEducator(currentUser);

      // Owner or co-instructor, active school, still assigned to it. Archived classes stay readable.
      const { classId } = dto;
      const classEntity = await findAccessibleClassForEducator(
        this.classRepo,
        this.educatorSchoolRepo,
        classId,
        currentUser.educatorId,
      );
      if (!classEntity) throwAppError(ERROR_MSG.DB.NOT_FOUND('Class'), ErrorTypes.NOT_FOUND);

      const { page, pageSize, skip, take } = getPagination({
        page: dto.page,
        pageSize: dto.pageSize,
      });
      const sort = {
        field: dto.sortBy ?? ClassSimulationListingConstants.DEFAULT_SORT.FIELD,
        direction: dto.sortDir
          ? (dto.sortDir.toUpperCase() as 'ASC' | 'DESC')
          : ClassSimulationListingConstants.DEFAULT_SORT.DIRECTION,
      };

      const { rows, total } = await this.repo.findForClassListing(classId, sort, { skip, take });

      const data: ClassSimulationListItemResDto[] = rows.map((row) => ({
        classSimulationId: row.classSimulationId,
        simId: row.simId,
        simName: row.simName,
        isArchived: row.isArchived,
        startDate: row.startDate,
        dueDate: row.dueDate,
        closeDate: row.closeDate,
        startedCount: row.startedCount,
        completedCount: row.completedCount,
        averageScore: row.averageScore,
        avatarEnabled: row.avatarEnabled,
        unitId: row.unitId,
        unitName: row.unitName,
      }));

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.FETCHED('Class simulations'),
        data,
        meta: buildPaginationMeta(total, page, pageSize),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  /** Units are read from the `units` table, not blob storage. */
  private async getUnits(): Promise<BlobUnit[]> {
    const units = await this.unitRepository.find({
      order: { name: 'ASC' },
    });
    return units.map((u) => ({
      id: u.id,
      name: u.name,
      category: u.category ?? '',
      imageUrl: u.imageUrl ?? undefined,
      description: u.description ?? undefined,
    }));
  }

  /** See simulation.service.ts's identical helper for why this mapping is needed. */
  private toBlobScenario(sim: SimulationV2): BlobScenario {
    const learningObjective = Array.isArray(sim.learningObjective)
      ? sim.learningObjective.join('\n')
      : sim.learningObjective;

    return {
      ...sim,
      id: sim.id,
      unitId: sim.unitId ?? '',
      learningObjective,
    } as unknown as BlobScenario;
  }

  private async getSimulationData(): Promise<[BlobScenario[], BlobUnit[]]> {
    const [simulations, units] = await Promise.all([this.simulationRepo.find(), this.getUnits()]);
    return [simulations.map((s) => this.toBlobScenario(s)), units];
  }

  private mapSimulation(
    cs: ClassSimulation,
    scenarios: BlobScenario[],
    units: BlobUnit[],
  ): MappedSimulation {
    const sim = scenarios.find((s) => s.id === cs.simulation_id);
    const unit = sim ? units.find((u) => u.id === sim.unitId) : undefined;
    const rawStatus = sim
      ? String(sim.status ?? '')
          .toLowerCase()
          .trim() || null
      : null;
    const isArchived = !sim || rawStatus === 'archived' || rawStatus === 'draft';

    return {
      id: cs.id,
      class_id: cs.class_id,
      simulation_id: cs.simulation_id,
      start_date: cs.start_date,
      due_date: cs.due_date,
      end_date: cs.end_date,
      created_at: cs.created_at,
      updated_at: cs.updated_at,
      simulation_title: sim?.title ?? null,
      unit_name: unit?.name ?? null,
      unit_id: sim?.unitId ?? null,
      scenario_status: isArchived ? 'archived' : rawStatus,
      avatarEnabled: sim?.avatarEnabled ?? null,
      estimated_duration: sim?.estimatedDuration?.trim() || null,
      difficulty: sim?.difficulty?.trim() || null,
      learner_level: sim?.learnerLevel?.trim() || null,
      purpose: sim?.studentBriefing?.purpose?.trim() || null,
    };
  }

  async assign(
    dto: AssignClassSimulationDto,
    educator: Educator,
  ): Promise<ServiceResponse<ClassSimulation>> {
    try {
      const classExists = await this.classRepo.findOne({
        where: { id: dto.class_id, is_active: true },
      });
      if (!classExists) {
        return {
          success: false,
          message: ClassSimulationConstants.MESSAGES.CLASS_NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }

      const simulationId = dto.simulation_id?.trim();
      if (!simulationId) {
        return {
          success: false,
          message: ClassSimulationConstants.MESSAGES.SIMULATION_NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }

      const syncedSimulation = await this.simulationRepo.findByBusinessId(simulationId);
      if (!syncedSimulation) {
        return {
          success: false,
          message:
            'Simulation could not be synced to the database for this assignment. Check unit mapping in simulation_library.',
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      const startDate = normalizeAssignmentDate(dto.start_date);
      const dueDate = normalizeAssignmentDate(dto.due_date);
      const endDate = normalizeAssignmentDate(dto.end_date);
      const requestedRange = { startDate, endDate };

      const existingAssignments = await this.repo.find({
        where: {
          class_id: dto.class_id,
          simulation_id: simulationId,
          is_active: true,
        },
      });
      const existing = existingAssignments.find((assignment) =>
        assignmentRangesOverlap(requestedRange, {
          startDate: assignment.start_date,
          endDate: assignment.end_date,
        }),
      );
      if (existing) {
        const hasSameStartAndEndDates = isSameAssignmentRange(
          { startDate: existing.start_date, endDate: existing.end_date },
          requestedRange,
        );
        return {
          success: false,
          message: hasSameStartAndEndDates
            ? ClassSimulationConstants.MESSAGES.ALREADY_ASSIGNED_SAME_DATES
            : ClassSimulationConstants.MESSAGES.ALREADY_ASSIGNED,
          type: ErrorTypes.CONFLICT,
        };
      }

      const isAiSimulation = await this.requiresAiSeats(
        syncedSimulation,
        this.toBlobScenario(syncedSimulation),
      );
      let tokensToReduce = 0;
      if (isAiSimulation) {
        const studentsNeedingSeats = await this.countStudentsWhoHaveNotUsedAiInClass(dto.class_id);
        tokensToReduce = studentsNeedingSeats;

        if (Number(educator.tokens) < tokensToReduce) {
          return {
            success: false,
            message: ClassConstants.VALIDATION.INSUFFICIENT_TOKENS,
            type: ErrorTypes.BAD_REQUEST,
          };
        }
      }
      const recordData = {
        ...dto,
        simulation_id: simulationId,
        start_date: startDate,
        due_date: dueDate,
        end_date: endDate,
        is_ai: isAiSimulation,
      };
      let saved: ClassSimulation;
      try {
        saved = await this.repo.create(recordData);
      } catch (error) {
        if (['23505', '23P01'].includes((error as { code?: string }).code ?? '')) {
          return {
            success: false,
            message: ClassSimulationConstants.MESSAGES.ALREADY_ASSIGNED,
            type: ErrorTypes.CONFLICT,
          };
        }
        throw error;
      }
      await this.educatorService.updateToken(educator.id, tokensToReduce);

      this.runPostAssignSideEffects({
        educatorId: educator.id,
        classId: dto.class_id,
        classEntity: classExists,
        simulationId,
        simulation: syncedSimulation,
        classSimulationId: saved.id,
        startDate,
        dueDate,
        endDate,
        courseworkDueDate: dto.due_date,
        logTag: 'assign',
      });

      return {
        success: true,
        message: ClassSimulationConstants.MESSAGES.ASSIGNED,
        data: saved,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      return {
        success: false,
        message: errorMessage,
        type: ErrorTypes.BAD_REQUEST,
      };
    }
  }

  /**
   * `POST /class-simulations/bulk`: every simulation in `dto.simulationIds` to every class in
   * `dto.classIds`, all-or-nothing. Every pair is checked first (class access within the school,
   * simulation exists, no overlapping assignment); any failure → 422 with each pair's outcome and
   * nothing written. Otherwise all rows are inserted and AI seats charged in one transaction.
   * Seats per AI pair match legacy `assign`: the class's students who haven't used an AI seat yet.
   */
  async bulkAssign(
    currentUser: ICurrentUser,
    dto: BulkAssignClassSimulationsReqDto,
  ): Promise<ResponseResult<BulkAssignClassSimulationsResDto>> {
    try {
      assertEducator(currentUser);
      const { educatorId } = currentUser;

      const availableSeats = await this.educatorRepo.findActiveTokenBalance(educatorId);
      if (availableSeats === null) throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Educator'));

      const isAssignedToSchool = await this.educatorSchoolRepo.isEducatorAssignedToSchool(
        educatorId,
        dto.schoolId,
      );
      if (!isAssignedToSchool) throw new ForbiddenException(ERROR_MSG.COMMON.FORBIDDEN);

      const dates = this.resolveBulkAssignDates(dto);

      const [classes, simulations, existing] = await Promise.all([
        this.findBulkAssignClasses(dto.classIds, educatorId, dto.schoolId),
        this.simulationRepo.findByBusinessIds(dto.simulationIds),
        this.repo.findActiveByClassIdsAndSimulationIds(dto.classIds, dto.simulationIds),
      ]);
      const simulationsById = new Map(simulations.map((sim) => [sim.id, sim]));
      const evaluatePairs = (existingRows: ClassSimulation[]): IBulkAssignPairOutcome[] => {
        const existingByPair = this.groupByPair(existingRows);
        return dto.classIds.flatMap((classId) =>
          dto.simulationIds.map((simulationId) =>
            this.evaluateBulkAssignPair(classId, simulationId, dates, {
              classes,
              simulationsById,
              existingByPair,
            }),
          ),
        );
      };

      const outcomes = evaluatePairs(existing);
      this.assertNoFailedPairs(outcomes);

      const isAiBySimulation = new Map(
        await Promise.all(
          simulations.map(
            async (sim) =>
              [sim.id, await this.requiresAiSeats(sim, this.toBlobScenario(sim))] as const,
          ),
        ),
      );
      const hasAiSimulation = dto.simulationIds.some((id) => isAiBySimulation.get(id));
      const seatsPerAiAssignmentByClass = hasAiSimulation
        ? await this.countSeatsPerClass(dto.classIds)
        : new Map<string, number>();

      const rows: (IBulkAssignClassSimulationRow & { seatsCharged: number })[] = outcomes.map(
        ({ classId, simulationId }) => {
          const isAi = isAiBySimulation.get(simulationId) ?? false;
          return {
            classId,
            simulationId,
            ...dates,
            isAi,
            seatsCharged: isAi ? (seatsPerAiAssignmentByClass.get(classId) ?? 0) : 0,
          };
        },
      );
      const seatsToCharge = rows.reduce((sum, row) => sum + row.seatsCharged, 0);
      if (seatsToCharge > availableSeats) {
        throw new BadRequestException(
          CLASS_SIMULATION_MSG.BULK_ASSIGN.INSUFFICIENT_SEATS(seatsToCharge, availableSeats),
        );
      }

      const { saved, conflicts, previousTokens, newTokens } =
        await this.repo.createManyAndChargeSeats({
          educatorId,
          seatsToCharge,
          rows: rows.map(({ seatsCharged: _seatsCharged, ...row }) => row),
        });
      // A concurrent request (double-click, retry, co-instructor) committed an overlapping
      // assignment after the pre-check above. Nothing was written or charged — report it as 422.
      if (conflicts.length > 0) {
        this.assertNoFailedPairs(evaluatePairs(conflicts));
      }

      if (seatsToCharge > 0) {
        void this.educatorService
          .notifyIfSeatsBelowThreshold(educatorId, previousTokens, newTokens)
          .catch((err) => {
            this.logger.warn(
              `[bulkAssign] Low-seat warning failed for educator=${educatorId}: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
      }

      const sideEffects: PostAssignSideEffectsParams[] = rows.map((row, index) => ({
        educatorId,
        classId: row.classId,
        classEntity: classes.get(row.classId) as Class,
        simulationId: row.simulationId,
        simulation: simulationsById.get(row.simulationId) as SimulationV2,
        classSimulationId: saved[index].id,
        startDate: row.startDate,
        dueDate: row.dueDate,
        endDate: row.endDate,
        courseworkDueDate: row.dueDate,
        logTag: 'bulkAssign',
      }));
      // Background, a few rows at a time: up to MAX_CLASSES × MAX_SIMULATIONS Google calls must
      // not all start at once. The response doesn't wait; failures are logged, as in assign().
      void runWithConcurrency(
        sideEffects,
        ClassSimulationAssignmentConstants.BULK.SIDE_EFFECT_CONCURRENCY,
        async (params) => {
          this.sendAssignReminders(params);
          await this.syncAssignCourseWork(params);
        },
      ).catch((err) => {
        this.logger.warn(
          `[bulkAssign] Post-assign side effects stopped early: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

      const results: BulkAssignPairResultResDto[] = rows.map((row, index) => ({
        classId: row.classId,
        simulationId: row.simulationId,
        status: ClassSimulationAssignmentStatus.CREATED,
        classSimulationId: saved[index].id,
        isAi: row.isAi,
        seatsCharged: row.seatsCharged,
        startDate: row.startDate,
        dueDate: row.dueDate,
        endDate: row.endDate,
      }));

      return new ResponseResult({
        message: CLASS_SIMULATION_MSG.BULK_ASSIGN.CREATED(results.length),
        data: {
          total: results.length,
          created: results.length,
          seatsCharged: seatsToCharge,
          remainingSeats: newTokens,
          results,
        },
      });
    } catch (error) {
      return handleError(error);
    }
  }

  /** Normalised (`YYYY-MM-DD`) window; the DTO already guaranteed each date is real. */
  private resolveBulkAssignDates(dto: BulkAssignClassSimulationsReqDto): {
    startDate: string;
    dueDate: string;
    endDate: string;
  } {
    const startDate = normalizeAssignmentDate(dto.startDate) ?? dto.startDate;
    const dueDate = normalizeAssignmentDate(dto.dueDate) ?? dto.dueDate;
    const endDate = normalizeAssignmentDate(dto.endDate) ?? dto.endDate;
    if (startDate > dueDate) {
      throw new BadRequestException(ERROR_MSG.COMMON.INVALID_DATE_RANGE('startDate', 'dueDate'));
    }
    if (dueDate > endDate) {
      throw new BadRequestException(ERROR_MSG.COMMON.INVALID_DATE_RANGE('dueDate', 'endDate'));
    }
    return { startDate, dueDate, endDate };
  }

  /**
   * Each requested class the educator may assign to, or `null`: active, owner/co-instructor, in
   * `schoolId` and that school active — `findAccessibleClassForEducator`'s rules, in one query.
   * Its per-class "educator still assigned to the school" lookup isn't repeated: `bulkAssign`
   * already checked that once for `schoolId`, and every class must be in it. A class with no
   * school doesn't belong to the selected school, so it is refused. Ids are lowercase (DTO).
   */
  private async findBulkAssignClasses(
    classIds: string[],
    educatorId: string,
    schoolId: string,
  ): Promise<Map<string, Class | null>> {
    const accessible = await this.classRepo.findActiveByIdsWithSchoolForEducator(
      classIds,
      educatorId,
    );
    const byId = new Map(
      accessible
        .filter((cls) => cls.school_id === schoolId && cls.school?.is_active !== false)
        .map((cls) => [(cls.id ?? '').toLowerCase(), cls] as const),
    );
    return new Map(classIds.map((classId) => [classId, byId.get(classId.toLowerCase()) ?? null]));
  }

  /** Not-yet-used AI student count per class, a few classes at a time. */
  private async countSeatsPerClass(classIds: string[]): Promise<Map<string, number>> {
    const seatsByClass = new Map<string, number>();
    await runWithConcurrency(
      classIds,
      ClassSimulationAssignmentConstants.BULK.SEAT_COUNT_CONCURRENCY,
      async (classId) => {
        seatsByClass.set(classId, await this.countStudentsWhoHaveNotUsedAiInClass(classId));
      },
    );
    return seatsByClass;
  }

  /** Class ids compared lowercase (Postgres returns uuids lowercase); simulation ids as-is. */
  private pairKey(classId: string, simulationId: string): string {
    return `${classId.toLowerCase()}|${simulationId}`;
  }

  private groupByPair(rows: ClassSimulation[]): Map<string, ClassSimulation[]> {
    const byPair = new Map<string, ClassSimulation[]>();
    for (const row of rows) {
      const key = this.pairKey(row.class_id, row.simulation_id);
      byPair.set(key, [...(byPair.get(key) ?? []), row]);
    }
    return byPair;
  }

  /** All-or-nothing: any `FAILED` pair → 422 listing every pair's outcome. */
  private assertNoFailedPairs(outcomes: IBulkAssignPairOutcome[]): void {
    const failed = outcomes.filter(
      (outcome) => outcome.status === ClassSimulationAssignmentStatus.FAILED,
    ).length;
    if (failed > 0) {
      throw new BulkOperationException(
        CLASS_SIMULATION_MSG.BULK_ASSIGN.FAILED(failed, outcomes.length),
        { total: outcomes.length, failed, results: outcomes },
      );
    }
  }

  /** First failing rule wins: class access, simulation exists, same-dates, then overlap. */
  private evaluateBulkAssignPair(
    classId: string,
    simulationId: string,
    dates: IAssignmentDateRange,
    lookups: {
      classes: Map<string, Class | null>;
      simulationsById: Map<string, SimulationV2>;
      existingByPair: Map<string, ClassSimulation[]>;
    },
  ): IBulkAssignPairOutcome {
    const fail = (reason: ClassSimulationAssignmentFailureReason): IBulkAssignPairOutcome => ({
      classId,
      simulationId,
      status: ClassSimulationAssignmentStatus.FAILED,
      reason,
      message: CLASS_SIMULATION_MSG.BULK_ASSIGN[reason],
    });

    if (!lookups.classes.get(classId)) {
      return fail(ClassSimulationAssignmentFailureReason.CLASS_NOT_ACCESSIBLE);
    }
    if (!lookups.simulationsById.has(simulationId)) {
      return fail(ClassSimulationAssignmentFailureReason.SIMULATION_NOT_FOUND);
    }
    const conflict = (lookups.existingByPair.get(this.pairKey(classId, simulationId)) ?? []).find(
      (assignment) =>
        assignmentRangesOverlap(dates, {
          startDate: assignment.start_date,
          endDate: assignment.end_date,
        }),
    );
    if (conflict) {
      return fail(
        isSameAssignmentRange(dates, { startDate: conflict.start_date, endDate: conflict.end_date })
          ? ClassSimulationAssignmentFailureReason.ALREADY_ASSIGNED_SAME_DATES
          : ClassSimulationAssignmentFailureReason.ALREADY_ASSIGNED_OVERLAP,
      );
    }
    return { classId, simulationId, status: ClassSimulationAssignmentStatus.VALID };
  }

  /**
   * Fire-and-forget follow-ups of a new assignment, shared by `assign` and `bulkAssign`: the
   * start/due/end reminders (when inside the reminder window) and the Google Classroom
   * coursework sync. Failures are logged, never thrown.
   */
  private runPostAssignSideEffects(params: PostAssignSideEffectsParams): void {
    this.sendAssignReminders(params);
    void this.syncAssignCourseWork(params);
  }

  /** Start/due/end reminders for a new assignment, when inside the reminder window. Fire-and-forget. */
  private sendAssignReminders(params: PostAssignSideEffectsParams): void {
    const {
      educatorId,
      classId,
      classEntity,
      simulationId,
      simulation,
      startDate,
      dueDate,
      endDate,
    } = params;
    const className = classEntity.class_name ?? classId;
    const simulationTitle = simulation.title || simulationId;

    if (this.shouldSendDueReminder(dueDate)) {
      void this.notificationsGateway.notifyEducatorSimulationDueDateReminder(
        educatorId,
        simulationId,
        simulationTitle,
        classId,
        className,
        dueDate ?? '',
      );
    }
    if (this.shouldSendDateReminder(startDate)) {
      void this.notificationsGateway.notifyEducatorSimulationStartDateReminder(
        educatorId,
        simulationId,
        simulationTitle,
        classId,
        className,
        startDate ?? '',
      );
    }
    if (this.shouldSendDateReminder(endDate)) {
      void this.notificationsGateway.notifyEducatorSimulationEndDateReminder(
        educatorId,
        simulationId,
        simulationTitle,
        classId,
        className,
        endDate ?? '',
      );
    }
  }

  /**
   * Google Classroom coursework for a new assignment. Never rejects: a failure is logged. The
   * call starts synchronously, so `runPostAssignSideEffects` fires it exactly as before.
   */
  private async syncAssignCourseWork(params: PostAssignSideEffectsParams): Promise<void> {
    const { classId, classEntity, simulationId, simulation } = params;
    const simulationTitle = simulation.title || simulationId;

    await this.googleCourseworkService
      .ensureCourseWorkForAssignment({
        classId,
        schoolId: classEntity.school_id,
        classSimulationId: params.classSimulationId,
        simulationId,
        title: simulationTitle,
        description:
          typeof simulation.description === 'string' ? simulation.description : undefined,
        dueDate: params.courseworkDueDate,
      })
      .catch((err) => {
        this.logger.warn(
          `[${params.logTag}] Google CourseWork sync skipped/failed for class=${classId} sim=${simulationId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
  }

  async findByClass(class_id: string): Promise<ServiceResponse<MappedSimulation[]>> {
    const [data, [scenarios, units]] = await Promise.all([
      this.repo.find({ where: { class_id, is_active: true }, order: { created_at: 'DESC' } }),
      this.getSimulationData(),
    ]);
    return {
      success: true,
      message: ClassSimulationConstants.MESSAGES.BY_CLASS_FETCHED,
      data: data.map((cs) => this.mapSimulation(cs, scenarios, units)),
    };
  }

  async findByClassIdsBatch(classIds: string[]): Promise<Map<string, MappedSimulation[]>> {
    if (classIds.length === 0) return new Map();
    const [data, [scenarios, units]] = await Promise.all([
      this.repo.find({
        where: { class_id: In(classIds), is_active: true },
        order: { created_at: 'DESC' },
      }),
      this.getSimulationData(),
    ]);
    const result = new Map<string, MappedSimulation[]>();
    for (const cs of data) {
      const mapped = this.mapSimulation(cs, scenarios, units);
      const list = result.get(cs.class_id) ?? [];
      list.push(mapped);
      result.set(cs.class_id, list);
    }
    return result;
  }

  async findByClassActive(class_id: string): Promise<ServiceResponse<MappedSimulation[]>> {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setDate(now.getDate() + 7);
    end.setHours(23, 59, 59, 999);

    const [data, [scenarios, units]] = await Promise.all([
      this.repo.find({ where: { class_id, is_active: true }, order: { created_at: 'DESC' } }),
      this.getSimulationData(),
    ]);

    const filtered = data.filter((cs) => {
      const s = cs.start_date ? new Date(cs.start_date) : null;
      const d = cs.due_date ? new Date(cs.due_date) : null;
      return s !== null && d !== null && s <= end && d >= now;
    });

    return {
      success: true,
      message: ClassSimulationConstants.MESSAGES.BY_CLASS_FETCHED,
      data: filtered.map((cs) => this.mapSimulation(cs, scenarios, units)),
    };
  }

  async findBySimulation(simulation_id: string): Promise<ServiceResponse<MappedSimulation[]>> {
    const [data, [scenarios, units]] = await Promise.all([
      this.repo.find({ where: { simulation_id, is_active: true }, order: { created_at: 'DESC' } }),
      this.getSimulationData(),
    ]);
    return {
      success: true,
      message: ClassSimulationConstants.MESSAGES.BY_SIMULATION_FETCHED,
      data: data.map((cs) => this.mapSimulation(cs, scenarios, units)),
    };
  }

  async findByUnit(unit_id: string): Promise<ServiceResponse<MappedSimulation[]>> {
    const [allActive, [scenarios, units]] = await Promise.all([
      this.repo.find({ where: { is_active: true }, order: { created_at: 'DESC' } }),
      this.getSimulationData(),
    ]);
    const unitScenarioIds = new Set(scenarios.filter((s) => s.unitId === unit_id).map((s) => s.id));
    const data = allActive.filter((cs) => unitScenarioIds.has(cs.simulation_id));
    return {
      success: true,
      message: ClassSimulationConstants.MESSAGES.BY_CLASS_FETCHED,
      data: data.map((cs) => this.mapSimulation(cs, scenarios, units)),
    };
  }

  async update(
    currentUser: ICurrentUser,
    id: string,
    dto: UpdateClassSimulationReqDto,
  ): Promise<ResponseResult<UpdateClassSimulationResDto>> {
    try {
      assertEducator(currentUser);

      const record = await this.repo.findOne({ where: { id, is_active: true } });
      if (!record) {
        return throwAppError(ERROR_MSG.DB.NOT_FOUND('Class simulation'), ErrorTypes.NOT_FOUND);
      }

      // Owner or co-instructor, same check as findClassSimulations. Archived classes are still
      // returned, so the archived check below stays explicit.
      const classData = await findAccessibleClassForEducator(
        this.classRepo,
        this.educatorSchoolRepo,
        record.class_id,
        currentUser.educatorId,
      );
      if (!classData) {
        return throwAppError(ERROR_MSG.DB.NOT_FOUND('Class'), ErrorTypes.NOT_FOUND);
      }
      if (this.isArchivedClass(classData)) {
        return throwAppError(ERROR_MSG.CLASS.ARCHIVED, ErrorTypes.CONFLICT);
      }

      const nextDueDate = normalizeAssignmentDate(dto.dueDate);
      const isDueDateChanged =
        !!nextDueDate && nextDueDate !== normalizeAssignmentDate(record.due_date);
      const updated: ClassSimulation = {
        ...record,
        start_date: this.nextAssignmentDate(dto.startDate, record.start_date),
        due_date: this.nextAssignmentDate(dto.dueDate, record.due_date),
        end_date: this.nextAssignmentDate(dto.endDate, record.end_date),
      };

      if (await this.hasOverlappingAssignment(updated)) {
        return throwAppError(
          ERROR_MSG.CLASS_SIMULATION.OVERLAPPING_ASSIGNMENT,
          ErrorTypes.CONFLICT,
        );
      }

      const { affected } = await this.repo.updateDatesIfActive(id, {
        start_date: updated.start_date,
        due_date: updated.due_date,
        end_date: updated.end_date,
      });
      if (!affected) {
        // Removed between the read above and this write.
        return throwAppError(ERROR_MSG.DB.NOT_FOUND('Class simulation'), ErrorTypes.NOT_FOUND);
      }

      const ownerEducatorId = classData.educator_id;
      if (ownerEducatorId && isDueDateChanged && this.shouldSendDueReminder(updated.due_date)) {
        const simulationData = await this.simulationRepo.findOne({
          where: { id: updated.simulation_id },
        });
        void this.notificationsGateway.notifyEducatorSimulationDueDateReminder(
          ownerEducatorId,
          updated.simulation_id,
          simulationData?.title || updated.simulation_id,
          updated.class_id,
          classData.class_name || updated.class_id,
          updated.due_date || '',
        );
      }

      return new ResponseResult({
        message: SUCCESS_MSG.COMMON.UPDATED('Class simulation'),
        data: this.toUpdateResDto(updated),
      });
    } catch (error) {
      return handleError(error);
    }
  }

  /**
   * The sent date if present, else the stored one, normalised to YYYY-MM-DD so all three dates
   * share assign()'s format. A stored value that doesn't parse is kept as-is.
   */
  private nextAssignmentDate(sent?: string, stored?: string): string | undefined {
    return normalizeAssignmentDate(sent) ?? normalizeAssignmentDate(stored) ?? stored;
  }

  /**
   * The only overlap guard on update (the DB trigger was dropped in
   * 1790224730322-AlignSchemaWithEntities). Same inclusive-range rule as assign().
   */
  private async hasOverlappingAssignment(record: ClassSimulation): Promise<boolean> {
    const startDate = normalizeAssignmentDate(record.start_date);
    const endDate = normalizeAssignmentDate(record.end_date);
    if (!startDate || !endDate) return false;

    const siblings = await this.repo.find({
      where: {
        id: Not(record.id),
        class_id: record.class_id,
        simulation_id: record.simulation_id,
        is_active: true,
      },
    });
    return siblings.some((assignment) => {
      const siblingStartDate = normalizeAssignmentDate(assignment.start_date);
      const siblingEndDate = normalizeAssignmentDate(assignment.end_date);
      return !!(
        siblingStartDate &&
        siblingEndDate &&
        startDate <= siblingEndDate &&
        endDate >= siblingStartDate
      );
    });
  }

  private isArchivedClass(classData: Class): boolean {
    return (
      classData.status === CommonStatus.ARCHIEVED || classData.status === CommonStatus.ARCHIVED
    );
  }

  private toUpdateResDto(record: ClassSimulation): UpdateClassSimulationResDto {
    return {
      id: record.id,
      classId: record.class_id,
      simulationId: record.simulation_id,
      startDate: record.start_date,
      dueDate: record.due_date,
      endDate: record.end_date,
    };
  }

  async remove(id: string, userId: string): Promise<ServiceResponse<null>> {
    const record = await this.repo.findOne({ where: { id, is_active: true } });
    if (!record) {
      return {
        success: false,
        message: ClassSimulationConstants.MESSAGES.NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }

    const [seatsToRefund, educatorId] = await Promise.all([
      this.calculateRefundableSeats(record.class_id, record.simulation_id, record.is_ai ?? false),
      this.resolveClassEducatorId(record.class_id),
    ]);

    if (!educatorId) {
      throw new BadRequestException(ClassSimulationConstants.MESSAGES.EDUCATOR_NOT_FOUND_CLASS);
    }

    const educator = await this.educatorService.findById(userId);

    if (!educator?.data) {
      throw new BadRequestException(ClassSimulationConstants.MESSAGES.EDUCATOR_NOT_FOUND);
    }

    if (educatorId && educatorId !== userId) {
      throw new BadRequestException(ClassSimulationConstants.MESSAGES.NO_PERMISSION);
    }

    this.logger.log(
      `[remove] id=${id} classId=${record.class_id} simId=${record.simulation_id} ` +
        `isAi=${record.is_ai} seatsToRefund=${seatsToRefund} educatorId=${educatorId ?? 'null'}`,
    );

    // Atomic deactivation: WHERE is_active=true prevents duplicate refunds on retry
    const updated = await this.repo.deactivateIfActive(id);

    if ((updated.affected ?? 0) === 0) {
      return { success: true, message: ClassSimulationConstants.MESSAGES.REMOVED, data: null };
    }

    if (seatsToRefund > 0 && educatorId) {
      await this.educatorService.releaseTokens(educatorId, seatsToRefund);
      this.logger.log(`[remove] Released ${seatsToRefund} seat(s) to educator ${educatorId}`);
    }

    void this.googleCourseworkService
      .deleteCourseWorkForAssignment({
        classId: record.class_id,
        simulationId: record.simulation_id,
      })
      .catch((err) => {
        this.logger.warn(
          `[remove] Google CourseWork delete skipped/failed for class=${record.class_id} sim=${record.simulation_id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });

    return {
      success: true,
      message: ClassSimulationConstants.MESSAGES.REMOVED,
      data: null,
    };
  }

  async allocateSeatsForNewStudents(
    classId: string,
    educatorId: string,
    studentCount: number,
  ): Promise<ServiceResponse<{ seatsAllocated: number }>> {
    const aiSims = await this.repo.find({
      where: { class_id: classId, is_active: true, is_ai: true },
    });

    if (aiSims.length === 0) {
      return { success: true, message: 'No AI simulations in class', data: { seatsAllocated: 0 } };
    }

    // One seat per student regardless of how many AI simulations are in the class.
    const seatsNeeded = studentCount;
    const available = await this.educatorService.availableTokens(educatorId);

    if (available < seatsNeeded) {
      return {
        success: false,
        message: `Not enough AI seats. ${seatsNeeded} seat(s) required (${studentCount} student(s)) but only ${available} available.`,
        type: ErrorTypes.BAD_REQUEST,
      };
    }

    await this.educatorService.updateToken(educatorId, seatsNeeded);
    this.logger.log(
      `[allocateSeatsForNewStudents] classId=${classId} educatorId=${educatorId} students=${studentCount} aiSims=${aiSims.length} deducted=${seatsNeeded}`,
    );

    return {
      success: true,
      message: `Allocated ${seatsNeeded} AI seat(s)`,
      data: { seatsAllocated: seatsNeeded },
    };
  }

  async refundUnusedSeatsForClass(classId: string, educatorId: string): Promise<void> {
    const aiSims = await this.repo.find({
      where: { class_id: classId, is_active: true, is_ai: true },
    });
    if (aiSims.length === 0) return;

    let total = 0;
    for (const sim of aiSims) {
      total += await this.calculateRefundableSeats(classId, sim.simulation_id, true);
    }

    if (total > 0) {
      this.logger.log(
        `[refundUnusedSeatsForClass] classId=${classId} educatorId=${educatorId} refund=${total}`,
      );
      await this.educatorService.releaseTokens(educatorId, total);
    }
  }

  /** Refunds 1 seat per unused AI simulation for a student being removed from a class. */
  async refundUnusedSeatsForStudent(student: {
    id?: string;
    class_id?: string;
    student_id?: string | null;
    class?: { id?: string };
  }): Promise<void> {
    const classId = student.class_id ?? student.class?.id;
    if (!classId || !student.id) return;

    const educatorId = await this.resolveClassEducatorId(classId);
    if (!educatorId) return;

    const aiSims = await this.repo.find({
      where: { class_id: classId, is_active: true, is_ai: true },
    });
    if (aiSims.length === 0) return;

    // Seat is charged once per student — only refund if no AI sim was ever used.
    const usedSimIds = await this.simulationReportRepo.findScenarioIdsUsedByStudent(
      student.id,
      student.student_id,
      aiSims.map((s) => s.simulation_id),
    );
    if (usedSimIds.length > 0) {
      this.logger.log(
        `[refundUnusedSeatsForStudent] studentId=${student.id} classId=${classId} — used sim ${usedSimIds[0]}, no refund`,
      );
      return;
    }

    this.logger.log(
      `[refundUnusedSeatsForStudent] studentId=${student.id} classId=${classId} — no AI sim used, refund 1`,
    );
    await this.educatorService.releaseTokens(educatorId, 1);
  }

  private async resolveClassEducatorId(classId: string): Promise<string | null> {
    const cls = await this.classRepo.findOne({
      where: { id: classId },
      relations: { educator: true },
    });
    const educatorId = cls?.educator_id ?? cls?.educator?.id ?? null;
    if (!educatorId) {
      this.logger.warn(`[resolveClassEducatorId] No educator found for class ${classId}`);
    }
    return educatorId ?? null;
  }

  private async countStudentsWhoHaveNotUsedAiInClass(classId: string): Promise<number> {
    const totalStudents = await this.studentRepo.count({
      where: { class: { id: classId }, is_active: true },
    });
    if (totalStudents === 0) return 0;

    const allAiSimsInClass = await this.repo.find({
      where: { class_id: classId, is_ai: true },
    });
    const aiSimIds = allAiSimsInClass.map((s) => s.simulation_id);
    if (aiSimIds.length === 0) {
      return totalStudents;
    }

    const usedIds = new Set<string>(
      await this.simulationReportRepo.findStudentIdsWhoUsedScenariosInClass(classId, aiSimIds),
    );

    const studentCount = Math.max(0, totalStudents - usedIds.size);
    this.logger.log(
      `[countStudentsWhoHaveNotUsedAiInClass] classId=${classId} total=${totalStudents} usedAny=${usedIds.size} needSeats=${studentCount}`,
    );
    return studentCount;
  }

  private async calculateRefundableSeats(
    classId: string,
    simulationId: string,
    isAi: boolean,
  ): Promise<number> {
    if (!isAi) return 0;

    // If other AI sims remain after this removal, the student's seat is still in use — no refund.
    const allActiveAiSims = await this.repo.find({
      where: { class_id: classId, is_active: true, is_ai: true },
    });
    const remainingAiSims = allActiveAiSims.filter((s) => s.simulation_id !== simulationId);
    if (remainingAiSims.length > 0) {
      this.logger.log(
        `[calculateRefundableSeats] simId=${simulationId} classId=${classId} — ${remainingAiSims.length} other AI sim(s) remain, no refund`,
      );
      return 0;
    }

    // This is the last AI sim — refund 1 seat for every student who used no AI sim in this class.
    const totalStudents = await this.studentRepo.count({
      where: { class: { id: classId }, is_active: true },
    });
    if (totalStudents === 0) return 0;

    const allAiSimIds = allActiveAiSims.map((s) => s.simulation_id);
    const usedIds = new Set<string>(
      await this.simulationReportRepo.findStudentIdsWhoUsedScenariosInClass(classId, allAiSimIds),
    );

    const usedStudents = usedIds.size;
    const refundable = Math.max(0, totalStudents - usedStudents);
    this.logger.log(
      `[calculateRefundableSeats] simId=${simulationId} classId=${classId} total=${totalStudents} usedAny=${usedStudents} refundable=${refundable}`,
    );
    return refundable;
  }

  async recalculateSeatsForUnitCategoryChange(unitId: string): Promise<void> {
    const affectedRows = await this.dataSource.connection.query<
      Array<{ id: string; class_id: string; simulation_id: string; is_ai: boolean }>
    >(
      `SELECT cs.id, cs.class_id, cs.simulation_id, cs.is_ai
       FROM class_simulations cs
       INNER JOIN simulations_v2 s ON s.id = cs.simulation_id
       WHERE cs.is_active = true AND s.unit_id = $1`,
      [unitId],
    );
    await this.reconcileAffectedRows(affectedRows, `unitId=${unitId}`);
  }

  async recalculateSeatsForSimulationChange(simulationId: string): Promise<void> {
    const affectedRows = await this.dataSource.connection.query<
      Array<{ id: string; class_id: string; simulation_id: string; is_ai: boolean }>
    >(
      `SELECT cs.id, cs.class_id, cs.simulation_id, cs.is_ai
       FROM class_simulations cs
       WHERE cs.is_active = true AND cs.simulation_id = $1`,
      [simulationId],
    );
    await this.reconcileAffectedRows(affectedRows, `simulationId=${simulationId}`);
  }

  private async reconcileAffectedRows(
    affectedRows: Array<{ id: string; class_id: string; simulation_id: string; is_ai: boolean }>,
    logContext: string,
  ): Promise<void> {
    if (!affectedRows.length) {
      this.logger.log(`[recalculateSeats] ${logContext} — no active class_simulations affected`);
      return;
    }

    const byClass = new Map<string, typeof affectedRows>();
    for (const row of affectedRows) {
      const list = byClass.get(row.class_id) ?? [];
      list.push(row);
      byClass.set(row.class_id, list);
    }

    for (const [classId, rows] of byClass) {
      await this.recalculateSeatsForClassCategoryChange(classId, rows);
    }
  }

  private async recalculateSeatsForClassCategoryChange(
    classId: string,
    rows: Array<{ id: string; class_id: string; simulation_id: string; is_ai: boolean }>,
  ): Promise<void> {
    const educatorId = await this.resolveClassEducatorId(classId);
    if (!educatorId) return;

    const simIds = rows.map((r) => r.simulation_id);
    const simRows = await this.simulationRepo.find({ where: { id: In(simIds) } });
    const simIdx = new Map(simRows.map((s) => [s.id, s]));

    const transitions: Array<{
      id: string;
      simulationId: string;
      oldIsAi: boolean;
      newIsAi: boolean;
    }> = [];
    for (const row of rows) {
      const sim = simIdx.get(row.simulation_id);
      if (!sim) {
        this.logger.warn(
          `[recalculateSeats] classId=${classId} simulationId=${row.simulation_id} — ` +
            `skipped (no simulations_v2 row found); token recalculation cannot run for this row`,
        );
        continue;
      }
      const scenario: BlobScenario = {
        id: sim.id,
        title: sim.title ?? sim.id,
        unitId: sim.unitId ?? '',
        class: sim.class ?? undefined,
        department: sim.department ?? undefined,
        avatarEnabled: sim.avatarEnabled ?? undefined,
      };
      const newIsAi = await this.requiresAiSeats(sim, scenario);
      this.logger.log(
        `[recalculateSeats] classId=${classId} simulationId=${row.simulation_id} — ` +
          `oldIsAi=${row.is_ai} newIsAi=${newIsAi}`,
      );
      if (newIsAi !== row.is_ai) {
        transitions.push({
          id: row.id,
          simulationId: row.simulation_id,
          oldIsAi: row.is_ai,
          newIsAi,
        });
      }
    }

    if (!transitions.length) {
      this.logger.log(`[recalculateSeats] classId=${classId} — no is_ai transitions for this unit`);
      return;
    }

    const allAiActiveBefore = await this.repo.find({
      where: { class_id: classId, is_active: true, is_ai: true },
    });
    const hadAiBefore = allAiActiveBefore.length > 0;

    const affectedIdSet = new Set(rows.map((r) => r.id));
    const unaffectedAiCount = allAiActiveBefore.filter((s) => !affectedIdSet.has(s.id)).length;
    const transitionsToAi = transitions.filter((t) => t.newIsAi).length;
    const hasAiAfter = unaffectedAiCount + transitionsToAi > 0;

    if (!hadAiBefore && hasAiAfter) {
      const seatsNeeded = await this.countStudentsWhoHaveNotUsedAiInClass(classId);
      if (seatsNeeded > 0) {
        const available = await this.educatorService.availableTokens(educatorId);
        if (available < seatsNeeded) {
          this.logger.warn(
            `[recalculateSeats] classId=${classId} educatorId=${educatorId} — ` +
              `insufficient tokens (need ${seatsNeeded}, have ${available}). ` +
              `Skipping AI transition for this class; is_ai unchanged.`,
          );
          return;
        }
        await this.educatorService.updateToken(educatorId, seatsNeeded);
        this.logger.log(
          `[recalculateSeats] classId=${classId} educatorId=${educatorId} — deducted ${seatsNeeded} seat(s) (Manikin→AI transition)`,
        );
      }
      await this.applyIsAiFlips(transitions);
    } else if (hadAiBefore && !hasAiAfter) {
      await this.applyIsAiFlips(transitions);
      const refundSimId = transitions.find((t) => t.oldIsAi && !t.newIsAi)?.simulationId;
      if (refundSimId) {
        const refund = await this.calculateRefundableSeats(classId, refundSimId, true);
        if (refund > 0) {
          await this.educatorService.releaseTokens(educatorId, refund);
          this.logger.log(
            `[recalculateSeats] classId=${classId} educatorId=${educatorId} — refunded ${refund} seat(s) (AI→Manikin transition)`,
          );
        }
      }
    } else {
      await this.applyIsAiFlips(transitions);
      this.logger.log(
        `[recalculateSeats] classId=${classId} — flipped ${transitions.length} is_ai flag(s), no net seat delta`,
      );
    }
  }

  private async applyIsAiFlips(
    transitions: Array<{ id: string; newIsAi: boolean }>,
  ): Promise<void> {
    for (const t of transitions) {
      await this.dataSource.connection.query(
        `UPDATE class_simulations SET is_ai = $1, updated_at = now() WHERE id = $2`,
        [t.newIsAi, t.id],
      );
    }
  }
}
