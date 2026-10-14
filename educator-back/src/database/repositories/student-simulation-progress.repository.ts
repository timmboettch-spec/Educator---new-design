import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import {
  ClassSimulation,
  SimulationReport,
  SimulationV2,
  Student,
  StudentSimulationProgress,
} from 'src/database/entities';
import { RecordSubmittedAttemptInput, RecordSubmittedAttemptResult } from 'src/common/interfaces';
import { ReportModeType } from 'src/common/constants/simulation-report.constants';
import {
  SimulationAttemptConstants,
  SimulationProgressStatus,
} from 'src/common/constants/simulation-progress.constants';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { SIMULATION_PROGRESS_MSG } from 'src/common/messages/simulation-progress.message';
import { canForfeitSimulation } from 'src/common/utils/simulation-progress.util';
import { nowUtc, toUtcIsoString } from 'src/common/utils/dayjs.utils';
import { formatSecondsAsClock } from 'src/common/utils/simulation-report.util';

@Injectable()
export class StudentSimulationProgressRepository {
  constructor(
    @InjectRepository(StudentSimulationProgress)
    private readonly repo: Repository<StudentSimulationProgress>,
  ) {}

  /** One student's progress on one Simulation, or null when they haven't started it. */
  async findByStudentAndSimulation(
    studentId: string,
    simulationId: string,
  ): Promise<StudentSimulationProgress | null> {
    return this.repo.findOne({ where: { studentId, simulationId } });
  }

  /** A student's progress rows across a set of Simulations; Simulations never started have no row. */
  async findByStudentAndSimulationIds(
    studentId: string,
    simulationIds: string[],
  ): Promise<StudentSimulationProgress[]> {
    if (simulationIds.length === 0) {
      return [];
    }
    return this.repo.find({ where: { studentId, simulationId: In(simulationIds) } });
  }

  /**
   * One student's progress on the Simulation whose business `id` is `scenarioId` (what Reports and
   * assignments store), or null when they haven't started it.
   */
  async findByStudentAndScenarioId(
    studentId: string,
    scenarioId: string,
  ): Promise<StudentSimulationProgress | null> {
    return this.repo.findOne({
      where: { studentId, simulation: { id: scenarioId } },
      relations: { simulation: true },
    });
  }

  /**
   * A student's progress rows across Simulations given by business `id`, in one query, with the
   * `simulation` relation loaded so callers can match rows back to their `id`.
   */
  async findByStudentAndScenarioIds(
    studentId: string,
    scenarioIds: string[],
  ): Promise<StudentSimulationProgress[]> {
    if (scenarioIds.length === 0) {
      return [];
    }
    return this.repo.find({
      where: { studentId, simulation: { id: In(scenarioIds) } },
      relations: { simulation: true },
    });
  }

  /**
   * Records one graded Attempt atomically: locks the student's progress row, re-checks status and
   * limit, inserts the Report with its attempt number, bumps the mode's count (completing the
   * Simulation on the last Assessment Attempt) and refreshes the student's profile stats. Any
   * failure rolls all of it back. A transcript that already has an Attempt returns that Attempt
   * and changes nothing.
   *
   * @throws ConflictException when the Simulation is Forfeited or Completed, or the Assessment
   *   limit is reached.
   */
  async recordSubmittedAttempt(
    input: RecordSubmittedAttemptInput,
  ): Promise<RecordSubmittedAttemptResult> {
    const { attempt } = input;
    const mode =
      attempt.mode === ReportModeType.PRACTICE
        ? ReportModeType.PRACTICE
        : ReportModeType.ASSESSMENT;
    const isAssessment = mode === ReportModeType.ASSESSMENT;

    return this.repo.manager.transaction(async (manager) => {
      const simulationId = await this.resolveSimulationId(manager, attempt.scenarioId);
      let progress = await this.lockProgress(manager, attempt.studentId, simulationId);
      if (!progress) {
        // First Attempt on this Simulation: record the assignment it was started under. Two
        // concurrent first submissions both reach the insert; the loser is a no-op and both then
        // queue on the row lock.
        const classSimulationId = await this.resolveClassSimulationId(
          manager,
          attempt.studentId,
          attempt.scenarioId,
        );
        await manager
          .createQueryBuilder()
          .insert()
          .into(StudentSimulationProgress)
          .values({ studentId: attempt.studentId, simulationId, classSimulationId })
          .orIgnore()
          .execute();
        progress = await this.lockProgress(manager, attempt.studentId, simulationId);
      }
      if (!progress) {
        throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Simulation progress'));
      }

      const existing = attempt.transcriptId
        ? await manager.findOneBy(SimulationReport, { transcriptId: attempt.transcriptId })
        : null;
      if (existing) {
        return { report: existing, recorded: false };
      }

      this.assertOpenFor(progress, isAssessment);

      const currentCount = isAssessment
        ? progress.assessmentAttemptsCount
        : progress.practiceAttemptsCount;
      const insert = await manager
        .createQueryBuilder()
        .insert()
        .into(SimulationReport)
        .values({ ...attempt, mode, attemptNumber: currentCount + 1 })
        .orIgnore()
        .returning('id')
        .execute();
      const insertedId = (insert.raw as Array<{ id: string }>)[0]?.id;
      if (!insertedId) {
        // Not a transcript duplicate (checked above under the lock), so the attempt-number unique
        // rejected it: the limit was breached.
        throw new ConflictException(SIMULATION_PROGRESS_MSG.ASSESSMENT_ATTEMPT_LIMIT_REACHED);
      }
      const report = await manager.findOneByOrFail(SimulationReport, { id: insertedId });

      if (isAssessment) {
        const assessmentAttemptsCount = currentCount + 1;
        await manager.update(StudentSimulationProgress, progress.id, {
          assessmentAttemptsCount,
          ...(assessmentAttemptsCount >= SimulationAttemptConstants.MAX_ASSESSMENT_ATTEMPTS
            ? { status: SimulationProgressStatus.COMPLETED }
            : {}),
        });
      } else {
        await manager.update(StudentSimulationProgress, progress.id, {
          practiceAttemptsCount: currentCount + 1,
        });
      }

      await this.refreshStudentStats(manager, report);
      return { report, recorded: true };
    });
  }

  /**
   * Forfeits a Simulation for a student: locks the progress row and, only while it is
   * `in_progress` with at least one and fewer than Max Attempts Assessment Attempts, sets it
   * `forfeited`. Writes no Report.
   *
   * @throws ConflictException (FORFEIT_NOT_ALLOWED) when the rule isn't met, including when the
   *   student never started the Simulation.
   */
  async forfeit(studentId: string, scenarioId: string): Promise<StudentSimulationProgress> {
    return this.repo.manager.transaction(async (manager) => {
      const simulationId = await this.resolveSimulationId(manager, scenarioId);
      const progress = await manager
        .getRepository(StudentSimulationProgress)
        .createQueryBuilder('p')
        .setLock('pessimistic_write')
        .where('p.student_id = :studentId AND p.simulation_id = :simulationId', {
          studentId,
          simulationId,
        })
        .getOne();

      if (!progress || !canForfeitSimulation(progress)) {
        throw new ConflictException(SIMULATION_PROGRESS_MSG.FORFEIT_NOT_ALLOWED);
      }

      progress.status = SimulationProgressStatus.FORFEITED;
      progress.forfeitedAt = nowUtc().toDate();
      await manager.update(StudentSimulationProgress, progress.id, {
        status: progress.status,
        forfeitedAt: progress.forfeitedAt,
      });
      return progress;
    });
  }

  /** The Simulation's uuid PK for the business `id` Reports and assignments store. */
  private async resolveSimulationId(
    manager: EntityManager,
    scenarioId: string | null,
  ): Promise<string> {
    const simulation = scenarioId
      ? await manager.findOne(SimulationV2, {
          where: { id: scenarioId },
          select: { simulationId: true },
        })
      : null;
    if (!simulation) {
      throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Simulation'));
    }
    return simulation.simulationId;
  }

  /**
   * The `class_simulations.id` of the assignment behind a student's first Attempt: their class's
   * assignment of this Simulation, preferring an active, then the newest, one.
   */
  private async resolveClassSimulationId(
    manager: EntityManager,
    studentId: string,
    scenarioId: string | null,
  ): Promise<string> {
    const student = await manager.findOne(Student, {
      where: { id: studentId },
      select: { class_id: true },
    });
    const assignment =
      student?.class_id && scenarioId
        ? await manager.findOne(ClassSimulation, {
            where: { class_id: student.class_id, simulation_id: scenarioId },
            order: { is_active: 'DESC', created_at: 'DESC' },
            select: { id: true },
          })
        : null;
    if (!assignment) {
      throw new NotFoundException(ERROR_MSG.DB.NOT_FOUND('Class simulation'));
    }
    return assignment.id;
  }

  private async lockProgress(
    manager: EntityManager,
    studentId: string,
    simulationId: string,
  ): Promise<StudentSimulationProgress | null> {
    return manager
      .getRepository(StudentSimulationProgress)
      .createQueryBuilder('p')
      .setLock('pessimistic_write')
      .where('p.student_id = :studentId AND p.simulation_id = :simulationId', {
        studentId,
        simulationId,
      })
      .getOne();
  }

  private assertOpenFor(progress: StudentSimulationProgress, isAssessment: boolean): void {
    if (progress.status === SimulationProgressStatus.FORFEITED) {
      throw new ConflictException(SIMULATION_PROGRESS_MSG.ASSESSMENT_FORFEITED);
    }
    if (progress.status === SimulationProgressStatus.COMPLETED) {
      throw new ConflictException(SIMULATION_PROGRESS_MSG.SIMULATION_COMPLETED);
    }
    if (
      isAssessment &&
      progress.assessmentAttemptsCount >= SimulationAttemptConstants.MAX_ASSESSMENT_ATTEMPTS
    ) {
      throw new ConflictException(SIMULATION_PROGRESS_MSG.ASSESSMENT_ATTEMPT_LIMIT_REACHED);
    }
  }

  /** Recomputes the `students` profile stats from every stored Attempt, inside the caller's transaction. */
  private async refreshStudentStats(
    manager: EntityManager,
    report: SimulationReport,
  ): Promise<void> {
    const totals = await manager
      .getRepository(SimulationReport)
      .createQueryBuilder('sr')
      .select('COUNT(*)', 'attemptCount')
      .addSelect('COALESCE(SUM(sr.total_time_seconds), 0)', 'totalSeconds')
      .where('sr.student_id = :studentId', { studentId: report.studentId })
      .getRawOne<{ attemptCount: string; totalSeconds: string }>();
    const attemptCount = Number(totals?.attemptCount ?? 0);
    const totalSeconds = Number(totals?.totalSeconds ?? 0);

    await manager.update(Student, report.studentId, {
      sims_completed: String(attemptCount),
      time_spent: formatSecondsAsClock(totalSeconds),
      time_remaining: formatSecondsAsClock(
        Math.max(0, SimulationAttemptConstants.TOTAL_ALLOCATED_SECONDS - totalSeconds),
      ),
      attempt: attemptCount,
      score: report.score ?? undefined,
      submission_date: toUtcIsoString(report.createdAt),
    });
  }
}
