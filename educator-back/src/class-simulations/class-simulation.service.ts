import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, MoreThanOrEqual } from 'typeorm';
import { ClassSimulation } from './entity/class-simulation.entity';
import { Class } from 'src/class/entity/class.entity';
import { Simulation } from 'src/simulations/entity/simulation.entity';
import { Student } from 'src/students/entity/students.entity';
import { AssignClassSimulationDto, UpdateClassSimulationDto } from './dto/class-simulation.dto';
import { BlobScenario, BlobUnit, MappedSimulation, ServiceResponse } from 'src/common/types';
import { ErrorTypes } from 'src/common/utils/messages';
import { ClassSimulationConstants } from './class-simulation.constant';
import { TutorPatientService } from 'src/common/utils/tutor-patient.service';
import { ClassConstants } from 'src/class/classes.constants';
import { EducatorsService } from 'src/educators/educators.service';
import { Educator } from 'src/educators/entity/educator.entity';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { NotificationsConstants } from 'src/notifications/notifications.constants';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ClassSimulationService implements OnModuleInit {
  private readonly logger = new Logger(ClassSimulationService.name);
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

  private async requiresAiSeats(simulation: Simulation, scenario: BlobScenario): Promise<boolean> {
    if (
      this.isAiCategoryLabel(simulation.class) ||
      this.isAiCategoryLabel(simulation.department) ||
      this.isAiCategoryLabel(scenario.class) ||
      this.isAiCategoryLabel(scenario.department)
    ) {
      return true;
    }
    if (simulation.avatarEnabled || scenario.avatarEnabled) {
      return true;
    }

    const unitId = (simulation.unit_id ?? scenario.unitId ?? '').trim();
    if (!unitId) return false;

    const rows: unknown = await this.dataSource.query(
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

    const units = (await this.tutorPatientService.getUnits()) as BlobUnit[];
    const unit = units.find((item) => String(item.id).trim() === unitId);
    if (unit && this.isAiCategoryLabel(unit.category)) {
      return true;
    }

    return false;
  }

  private getDueReminderWindowDays(): number {
    const configured = this.configService.get<string>('NOTIFICATION_DUE_REMINDER_DAYS');
    const parsed = Number(configured);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
    return NotificationsConstants.DEFAULTS.DUE_DATE_REMINDER_DAYS;
  }

  private parseDueDate(rawDate?: string): Date | null {
    if (!rawDate) return null;
    const trimmed = rawDate.trim();
    const mmddyyyy = /^(\d{2})-(\d{2})-(\d{4})$/;
    const match = trimmed.match(mmddyyyy);
    if (match) {
      const month = Number(match[1]);
      const day = Number(match[2]);
      const year = Number(match[3]);
      const parsed = new Date(year, month - 1, day);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
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

  constructor(
    private readonly educatorService: EducatorsService,
    @InjectRepository(ClassSimulation)
    private readonly repo: Repository<ClassSimulation>,
    @InjectRepository(Class)
    private readonly classRepo: Repository<Class>,
    @InjectRepository(Simulation)
    private readonly simulationRepo: Repository<Simulation>,
    private readonly dataSource: DataSource,
    private readonly tutorPatientService: TutorPatientService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.dataSource.query(`
      ALTER TABLE class_simulations
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS is_ai BOOLEAN DEFAULT false
    `);
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS simulation_reports (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        student_id UUID NOT NULL,
        student_name VARCHAR NOT NULL,
        scenario_id VARCHAR NOT NULL,
        report_data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        UNIQUE (student_id, scenario_id)
      )
    `);
  }

  private async getBlobData(): Promise<[BlobScenario[], BlobUnit[]]> {
    return Promise.all([
      this.tutorPatientService.getAllScenariosDirect() as Promise<BlobScenario[]>,
      this.tutorPatientService.getUnits() as Promise<BlobUnit[]>,
    ]);
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
    };
  }

  private buildSimulationFromScenario(
    simulationId: string,
    scenario: BlobScenario,
  ): Partial<Simulation> {
    return {
      id: simulationId,
      title: scenario.title || simulationId,
      unit_id: scenario.unitId ?? null,
      difficulty: scenario.difficulty,
      avatarId: scenario.avatarId,
      contextId: scenario.contextId,
      learnerLevel: scenario.learnerLevel,
      department: scenario.department,
      description: scenario.description,
      learningObjective: scenario.learningObjective,
      class: scenario.class,
      disabled: scenario.disabled ?? false,
      status: scenario.status,
      actions: scenario.actions,
      patientData: scenario.patientData,
      expectedActions: scenario.expectedActions,
      historyPrompts: scenario.historyPrompts,
      assessmentGuidance: scenario.assessmentGuidance,
      assessmentNarrativeExpected: scenario.assessmentNarrativeExpected,
      learningObjectiveCard: scenario.learningObjectiveCard,
      phases: scenario.phases,
      availableMedications: scenario.availableMedications,
      grading: scenario.grading,
      requiresProductSetup: scenario.requiresProductSetup ?? false,
      aiPatientData: scenario.aiPatientData,
      preBriefPdf: scenario.preBriefPdf,
      enableStudentBriefing: scenario.enableStudentBriefing ?? false,
      studentBriefing: scenario.studentBriefing,
      sbar: scenario.sbar,
      orders: scenario.orders,
      actionCategories: scenario.actionCategories,
      language: scenario.language,
      voice: scenario.voice,
      ethnicity: scenario.ethnicity,
      age: scenario.age,
      actionGroupName: scenario.actionGroupName,
      actionGroupDescription: scenario.actionGroupDescription,
    };
  }

  private async syncSimulationFromBlob(
    simulationId: string,
    scenario: BlobScenario,
  ): Promise<void> {
    const existing = await this.simulationRepo.findOne({ where: { id: simulationId } });
    if (existing) {
      return;
    }

    const simData = this.buildSimulationFromScenario(simulationId, scenario);
    const desiredUnitId = (simData.unit_id ?? '').trim() || `unmapped-${simulationId}`;
    const unitExists: Array<{ '1': number }> = await this.simulationRepo.manager.query(
      `SELECT 1 FROM simulation_library WHERE unit_id = $1 LIMIT 1`,
      [desiredUnitId],
    );
    if (!unitExists || unitExists.length === 0) {
      await this.simulationRepo.manager.query(
        `INSERT INTO simulation_library (unit_id, name, status, category, created_at, updated_at)
         VALUES ($1, $2, $3, $4, now(), now())`,
        [desiredUnitId, scenario.title || desiredUnitId, 'ACTIVE', scenario.department || null],
      );
    }
    simData.unit_id = desiredUnitId;

    try {
      await this.simulationRepo.save(simData);
    } catch {
      // Swallow sync errors and let assign() return a deterministic validation error
      // based on whether the simulation row exists after sync attempt.
    }
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

      const scenarios = (await this.tutorPatientService.getScenarios()) as BlobScenario[];
      const matchedScenario = scenarios.find(
        (scenario) => String(scenario.id).trim() === simulationId,
      );

      if (!matchedScenario) {
        return {
          success: false,
          message: ClassSimulationConstants.MESSAGES.SIMULATION_NOT_FOUND,
          type: ErrorTypes.NOT_FOUND,
        };
      }

      await this.syncSimulationFromBlob(simulationId, matchedScenario);

      const syncedSimulation = await this.simulationRepo.findOne({ where: { id: simulationId } });
      if (!syncedSimulation) {
        return {
          success: false,
          message:
            'Simulation could not be synced to the database for this assignment. Check unit mapping in simulation_library.',
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      const today = new Date().toISOString().split('T')[0];

      const existing = await this.repo.findOne({
        where: {
          class_id: dto.class_id,
          simulation_id: simulationId,
          is_active: true,
          end_date: MoreThanOrEqual(today),
        },
      });
      if (existing) {
        return {
          success: false,
          message: ClassSimulationConstants.MESSAGES.ALREADY_ASSIGNED,
          type: ErrorTypes.BAD_REQUEST,
        };
      }

      const isAiSimulation = await this.requiresAiSeats(syncedSimulation, matchedScenario);
      let tokensToReduce = 0;
      if (isAiSimulation) {
        const existingAiSimCount = await this.repo.count({
          where: { class_id: dto.class_id, is_active: true, is_ai: true },
        });
        if (existingAiSimCount === 0) {
          const activeStudentsCount = await this.repo.manager.count(Student, {
            where: { class: { id: dto.class_id }, is_active: true },
          });
          tokensToReduce = activeStudentsCount;

          if (Number(educator.tokens) < tokensToReduce) {
            return {
              success: false,
              message: ClassConstants.VALIDATION.INSUFFICIENT_TOKENS,
              type: ErrorTypes.BAD_REQUEST,
            };
          }
        }
      }
      const record = this.repo.create({
        ...dto,
        simulation_id: simulationId,
        is_ai: isAiSimulation,
      });
      await this.educatorService.updateToken(educator.id, tokensToReduce);
      const saved = await this.repo.save(record);

      const className = classExists.class_name ?? dto.class_id;
      const simulationTitle = matchedScenario.title || simulationId;
      void this.notificationsGateway.notifySimulationAssigned(
        educator.id,
        dto.class_id,
        className,
        simulationId,
        simulationTitle,
      );

      const educatorDetails = await this.educatorService.findById(educator.id);
      const adminId = educatorDetails.success ? educatorDetails.data?.admin?.id : undefined;
      if (adminId) {
        const educatorName =
          educatorDetails.data?.full_name?.trim() || educatorDetails.data?.email || educator.id;
        void this.notificationsGateway.notifyAdminSimulationAssigned(
          adminId,
          educator.id,
          educatorName,
          dto.class_id,
          className,
          simulationId,
          simulationTitle,
        );
      }

      if (this.shouldSendDueReminder(dto.due_date)) {
        void this.notificationsGateway.notifyEducatorSimulationDueDateReminder(
          educator.id,
          simulationId,
          simulationTitle,
          dto.class_id,
          className,
          dto.due_date ?? '',
        );
      }

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

  async findByClass(class_id: string): Promise<ServiceResponse<MappedSimulation[]>> {
    const [data, [scenarios, units]] = await Promise.all([
      this.repo.find({ where: { class_id, is_active: true }, order: { created_at: 'DESC' } }),
      this.getBlobData(),
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
      this.getBlobData(),
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
      this.getBlobData(),
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
      this.getBlobData(),
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
      this.getBlobData(),
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
    id: string,
    dto: UpdateClassSimulationDto,
  ): Promise<ServiceResponse<ClassSimulation>> {
    const record = await this.repo.findOne({ where: { id, is_active: true } });
    if (!record) {
      return {
        success: false,
        message: ClassSimulationConstants.MESSAGES.NOT_FOUND,
        type: ErrorTypes.NOT_FOUND,
      };
    }
    Object.assign(record, { ...dto });
    const saved = await this.repo.save(record);

    if (this.shouldSendDueReminder(saved.due_date)) {
      const classData = await this.classRepo.findOne({
        where: { id: saved.class_id },
        relations: ['educator'],
      });
      const simulationData = await this.simulationRepo.findOne({
        where: { id: saved.simulation_id },
      });
      const educatorId = classData?.educator?.id;
      if (educatorId) {
        void this.notificationsGateway.notifyEducatorSimulationDueDateReminder(
          educatorId,
          saved.simulation_id,
          simulationData?.title || saved.simulation_id,
          saved.class_id,
          classData?.class_name || saved.class_id,
          saved.due_date || '',
        );
      }
    }

    return {
      success: true,
      message: ClassSimulationConstants.MESSAGES.UPDATED,
      data: saved,
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

    const updated = await this.repo
      .createQueryBuilder()
      .update()
      .set({ is_active: false, deleted_at: new Date() })
      .where('id = :id AND is_active = true', { id })
      .execute();

    if ((updated.affected ?? 0) === 0) {
      return { success: true, message: ClassSimulationConstants.MESSAGES.REMOVED, data: null };
    }

    if (seatsToRefund > 0 && educatorId) {
      await this.educatorService.releaseTokens(educatorId, seatsToRefund);
      this.logger.log(`[remove] Released ${seatsToRefund} seat(s) to educator ${educatorId}`);
    }

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
    for (const sim of aiSims) {
      const used = await this.studentHasUsedSimulation(
        student.id,
        student.student_id,
        sim.simulation_id,
      );
      if (used) {
        this.logger.log(
          `[refundUnusedSeatsForStudent] studentId=${student.id} classId=${classId} — used sim ${sim.simulation_id}, no refund`,
        );
        return;
      }
    }

    this.logger.log(
      `[refundUnusedSeatsForStudent] studentId=${student.id} classId=${classId} — no AI sim used, refund 1`,
    );
    await this.educatorService.releaseTokens(educatorId, 1);
  }

  private async studentHasUsedSimulation(
    studentUuid: string,
    studentExternalCode: string | null | undefined,
    simulationId: string,
  ): Promise<boolean> {
    const rows: Array<{ exists: string }> = await this.dataSource.query(
      `SELECT EXISTS(SELECT 1 FROM simulation_reports WHERE student_id = $1 AND scenario_id = $2)::text AS exists`,
      [studentUuid, simulationId],
    );
    if (rows[0]?.exists === 'true') return true;

    const code = studentExternalCode?.trim();
    if (code) {
      try {
        const blobReports = (await this.tutorPatientService.getReports()) as Array<{
          scenario_id?: string;
          scenarioId?: string;
          userId?: string;
          student_id?: string;
          studentId?: string;
        }>;
        const found = blobReports.some((r) => {
          const sid = (r.scenario_id ?? r.scenarioId ?? '').trim();
          const uid = (r.userId ?? r.student_id ?? r.studentId ?? '').trim();
          return sid === simulationId && uid === code;
        });
        if (found) return true;
      } catch (err) {
        this.logger.warn(
          `[studentHasUsedSimulation] Blob unavailable: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return false;
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
    const totalStudents = await this.repo.manager.count(Student, {
      where: { class: { id: classId }, is_active: true },
    });
    if (totalStudents === 0) return 0;

    const allAiSimIds = allActiveAiSims.map((s) => s.simulation_id);
    const usedIds = new Set<string>();

    // DB check against all AI sims in the class
    const dbUsed: Array<{ student_id: string }> = await this.dataSource.query(
      `SELECT DISTINCT sr.student_id
       FROM simulation_reports sr
       INNER JOIN students s ON s.id = sr.student_id
       WHERE sr.scenario_id = ANY($1) AND s.class_id = $2 AND s.is_active = true`,
      [allAiSimIds, classId],
    );
    for (const row of dbUsed) usedIds.add(row.student_id);

    // Blob check against all AI sims in the class
    try {
      const blobReports = (await this.tutorPatientService.getReports()) as Array<{
        scenario_id?: string;
        scenarioId?: string;
        userId?: string;
        student_id?: string;
        studentId?: string;
      }>;
      const blobCodes = [
        ...new Set(
          blobReports
            .filter((r) => allAiSimIds.includes((r.scenario_id ?? r.scenarioId ?? '').trim()))
            .map((r) => (r.userId ?? r.student_id ?? r.studentId ?? '').trim())
            .filter((c) => c.length > 0),
        ),
      ];
      if (blobCodes.length > 0) {
        const blobStudents: Array<{ id: string }> = await this.dataSource.query(
          `SELECT id FROM students WHERE student_id = ANY($1) AND class_id = $2 AND is_active = true`,
          [blobCodes, classId],
        );
        for (const s of blobStudents) usedIds.add(s.id);
      }
    } catch (err) {
      this.logger.warn(
        `[calculateRefundableSeats] Blob unavailable, using DB only: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const usedStudents = usedIds.size;
    const refundable = Math.max(0, totalStudents - usedStudents);
    this.logger.log(
      `[calculateRefundableSeats] simId=${simulationId} classId=${classId} total=${totalStudents} usedAny=${usedStudents} refundable=${refundable}`,
    );
    return refundable;
  }
}
