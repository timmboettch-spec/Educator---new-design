import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  ClassSimulation,
  SimulationReport,
  SimulationV2,
  Student,
  StudentSimulationProgress,
} from 'src/database/entities';
import { StudentSimulationProgressRepository } from 'src/database/repositories/student-simulation-progress.repository';
import { ReportModeType } from 'src/common/constants/simulation-report.constants';
import {
  SimulationAttemptConstants,
  SimulationProgressStatus,
} from 'src/common/constants/simulation-progress.constants';
import { ERROR_MSG } from 'src/common/messages/error.message';
import { SIMULATION_PROGRESS_MSG } from 'src/common/messages/simulation-progress.message';
import type { AttemptRowInput } from 'src/common/interfaces';

const MAX = SimulationAttemptConstants.MAX_ASSESSMENT_ATTEMPTS;
const STUDENT_ID = 'student-uuid';
const SCENARIO_ID = 'sim-business-id';
const SIMULATION_PK = 'simulation-uuid';
const CLASS_SIMULATION_ID = 'class-simulation-uuid';

interface ProgressState {
  id: string;
  status: SimulationProgressStatus;
  assessmentAttemptsCount: number;
  practiceAttemptsCount: number;
  forfeitedAt?: Date | null;
}

const progressState = (overrides: Partial<ProgressState> = {}): ProgressState => ({
  id: 'progress-1',
  status: SimulationProgressStatus.IN_PROGRESS,
  assessmentAttemptsCount: 0,
  practiceAttemptsCount: 0,
  ...overrides,
});

const attempt = (mode: ReportModeType, overrides: Partial<AttemptRowInput> = {}): AttemptRowInput =>
  ({
    studentId: STUDENT_ID,
    scenarioId: SCENARIO_ID,
    transcriptId: 'transcript-1',
    mode,
    score: 80,
    ...overrides,
  }) as AttemptRowInput;

/**
 * A fake `EntityManager` standing in for the database. It records every write so tests can assert
 * what the transaction did, and what it did not do after a rejection.
 */
function buildManager(options: {
  progress: ProgressState | null;
  simulation?: { simulationId: string } | null;
  /** The student's class assignment of the Simulation; `null` when the class has none. */
  classSimulation?: { id: string } | null;
  existingByTranscript?: Record<string, unknown> | null;
  insertedReportId?: string | null;
  totals?: { attemptCount: string; totalSeconds: string };
}) {
  let progressInserted = false;
  const calls: { inserts: Array<{ entity: unknown; values: unknown }>; updates: unknown[][] } = {
    inserts: [],
    updates: [],
  };
  const insertedReport = {
    id: 'report-new',
    studentId: STUDENT_ID,
    score: 80,
    createdAt: new Date(),
  };

  const insertBuilder = (): Record<string, jest.Mock> => {
    const state: { entity?: unknown; values?: unknown } = {};
    const builder: Record<string, jest.Mock> = {};
    builder.insert = jest.fn(() => builder);
    builder.into = jest.fn((entity: unknown) => {
      state.entity = entity;
      return builder;
    });
    builder.values = jest.fn((values: unknown) => {
      state.values = values;
      return builder;
    });
    builder.orIgnore = jest.fn(() => builder);
    builder.returning = jest.fn(() => builder);
    builder.execute = jest.fn(() => {
      calls.inserts.push({ entity: state.entity, values: state.values });
      if (state.entity === StudentSimulationProgress) progressInserted = true;
      const insertedId =
        options.insertedReportId === undefined ? 'report-new' : options.insertedReportId;
      return Promise.resolve({
        raw: state.entity === SimulationReport && insertedId ? [{ id: insertedId }] : [],
      });
    });
    return builder;
  };

  const lockBuilder = (): Record<string, jest.Mock> => {
    const builder: Record<string, jest.Mock> = {};
    builder.setLock = jest.fn(() => builder);
    builder.where = jest.fn(() => builder);
    builder.getOne = jest.fn(() =>
      Promise.resolve(options.progress ?? (progressInserted ? progressState() : null)),
    );
    return builder;
  };

  const totalsBuilder = (): Record<string, jest.Mock> => {
    const builder: Record<string, jest.Mock> = {};
    builder.select = jest.fn(() => builder);
    builder.addSelect = jest.fn(() => builder);
    builder.where = jest.fn(() => builder);
    builder.getRawOne = jest.fn(() =>
      Promise.resolve(options.totals ?? { attemptCount: '1', totalSeconds: '90' }),
    );
    return builder;
  };

  const manager = {
    findOne: jest.fn((entity: unknown) => {
      if (entity === SimulationV2) {
        return Promise.resolve(
          options.simulation === undefined ? { simulationId: SIMULATION_PK } : options.simulation,
        );
      }
      if (entity === Student) return Promise.resolve({ class_id: 'class-1' });
      return Promise.resolve(
        options.classSimulation === undefined
          ? { id: CLASS_SIMULATION_ID }
          : options.classSimulation,
      );
    }),
    findOneBy: jest.fn(() => Promise.resolve(options.existingByTranscript ?? null)),
    findOneByOrFail: jest.fn(() => Promise.resolve(insertedReport)),
    createQueryBuilder: jest.fn(insertBuilder),
    getRepository: jest.fn((entity: unknown) => ({
      createQueryBuilder: jest.fn(() =>
        entity === StudentSimulationProgress ? lockBuilder() : totalsBuilder(),
      ),
    })),
    update: jest.fn((...args: unknown[]) => {
      calls.updates.push(args);
      return Promise.resolve({});
    }),
  };
  return { manager, calls, insertedReport };
}

function buildRepository(manager: unknown): {
  repository: StudentSimulationProgressRepository;
  typeormRepo: Record<string, jest.Mock | { transaction: jest.Mock }>;
} {
  const typeormRepo = {
    manager: { transaction: jest.fn((work: (m: unknown) => unknown) => work(manager)) },
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  return {
    repository: new StudentSimulationProgressRepository(typeormRepo as never),
    typeormRepo: typeormRepo as never,
  };
}

const progressUpdate = (
  calls: ReturnType<typeof buildManager>['calls'],
): Record<string, unknown> | undefined =>
  calls.updates.find((args) => args[0] === StudentSimulationProgress)?.[2] as
    Record<string, unknown> | undefined;

const reportInsert = (calls: ReturnType<typeof buildManager>['calls']): unknown =>
  calls.inserts.find((insert) => insert.entity === SimulationReport)?.values;

const conflictMessage = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ConflictException) return error.message;
    throw error;
  }
  throw new Error('Expected a ConflictException');
};

describe('StudentSimulationProgressRepository (mocked database)', () => {
  describe('recordSubmittedAttempt', () => {
    it('on the first Attempt resolves the Simulation PK and class assignment and upserts the progress row', async () => {
      const { manager, calls } = buildManager({ progress: null });
      const { repository } = buildRepository(manager);

      await repository.recordSubmittedAttempt({ attempt: attempt(ReportModeType.ASSESSMENT) });

      expect(manager.findOne).toHaveBeenCalledWith(SimulationV2, {
        where: { id: SCENARIO_ID },
        select: { simulationId: true },
      });
      expect(manager.findOne).toHaveBeenCalledWith(ClassSimulation, {
        where: { class_id: 'class-1', simulation_id: SCENARIO_ID },
        order: { is_active: 'DESC', created_at: 'DESC' },
        select: { id: true },
      });
      expect(calls.inserts[0]).toEqual({
        entity: StudentSimulationProgress,
        values: {
          studentId: STUDENT_ID,
          simulationId: SIMULATION_PK,
          classSimulationId: CLASS_SIMULATION_ID,
        },
      });
      expect(calls.inserts[1].entity).toBe(SimulationReport);
    });

    it('does not look up the class assignment when the progress row already exists', async () => {
      const { manager } = buildManager({ progress: progressState({ assessmentAttemptsCount: 1 }) });
      const { repository } = buildRepository(manager);

      await repository.recordSubmittedAttempt({ attempt: attempt(ReportModeType.ASSESSMENT) });

      expect(manager.findOne).not.toHaveBeenCalledWith(ClassSimulation, expect.anything());
    });

    it("refuses a first Attempt when the student's class has no assignment of the Simulation", async () => {
      const { manager, calls } = buildManager({ progress: null, classSimulation: null });
      const { repository } = buildRepository(manager);

      await expect(
        repository.recordSubmittedAttempt({ attempt: attempt(ReportModeType.ASSESSMENT) }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(calls.inserts).toEqual([]);
    });

    it('numbers the Report count + 1 for its mode and increments that count', async () => {
      const { manager, calls } = buildManager({
        progress: progressState({ assessmentAttemptsCount: 1 }),
      });
      const { repository } = buildRepository(manager);

      const result = await repository.recordSubmittedAttempt({
        attempt: attempt(ReportModeType.ASSESSMENT),
      });

      expect(result.recorded).toBe(true);
      expect(reportInsert(calls)).toMatchObject({
        mode: ReportModeType.ASSESSMENT,
        attemptNumber: 2,
      });
      expect(progressUpdate(calls)).toEqual({ assessmentAttemptsCount: 2 });
    });

    it('marks the Simulation completed when the last Assessment Attempt is recorded', async () => {
      const { manager, calls } = buildManager({
        progress: progressState({ assessmentAttemptsCount: MAX - 1 }),
      });
      const { repository } = buildRepository(manager);

      await repository.recordSubmittedAttempt({ attempt: attempt(ReportModeType.ASSESSMENT) });

      expect(reportInsert(calls)).toMatchObject({ attemptNumber: MAX });
      expect(progressUpdate(calls)).toEqual({
        assessmentAttemptsCount: MAX,
        status: SimulationProgressStatus.COMPLETED,
      });
    });

    it('counts Practice Attempts without a limit and never completes', async () => {
      const { manager, calls } = buildManager({
        progress: progressState({ assessmentAttemptsCount: MAX, practiceAttemptsCount: 9 }),
      });
      const { repository } = buildRepository(manager);

      await repository.recordSubmittedAttempt({ attempt: attempt(ReportModeType.PRACTICE) });

      expect(reportInsert(calls)).toMatchObject({ attemptNumber: 10 });
      expect(progressUpdate(calls)).toEqual({ practiceAttemptsCount: 10 });
    });

    it('treats a null mode as Assessment and stores the resolved mode', async () => {
      const { manager, calls } = buildManager({ progress: progressState() });
      const { repository } = buildRepository(manager);

      await repository.recordSubmittedAttempt({ attempt: attempt(null as never) });

      expect(reportInsert(calls)).toMatchObject({ mode: ReportModeType.ASSESSMENT });
    });

    it('refreshes the student stats from every stored Attempt in the same transaction', async () => {
      const { manager, calls, insertedReport } = buildManager({
        progress: progressState(),
        totals: { attemptCount: '3', totalSeconds: '3725' },
      });
      const { repository } = buildRepository(manager);

      await repository.recordSubmittedAttempt({ attempt: attempt(ReportModeType.ASSESSMENT) });

      const studentUpdate = calls.updates.find((args) => args[0] === Student);
      expect(studentUpdate?.[1]).toBe(STUDENT_ID);
      expect(studentUpdate?.[2]).toMatchObject({
        sims_completed: '3',
        attempt: 3,
        time_spent: '01:02:05',
        time_remaining: '398:57:55',
        score: insertedReport.score,
      });
    });

    it('returns the existing Attempt for a duplicate transcript and writes nothing', async () => {
      const existing = { id: 'report-old' };
      const { manager, calls } = buildManager({
        progress: progressState({ status: SimulationProgressStatus.COMPLETED }),
        existingByTranscript: existing,
      });
      const { repository } = buildRepository(manager);

      const result = await repository.recordSubmittedAttempt({
        attempt: attempt(ReportModeType.ASSESSMENT),
      });

      expect(result).toEqual({ report: existing, recorded: false });
      expect(calls.updates).toEqual([]);
      expect(calls.inserts).toEqual([]);
    });

    it.each([
      [SimulationProgressStatus.FORFEITED, 1, SIMULATION_PROGRESS_MSG.ASSESSMENT_FORFEITED],
      [SimulationProgressStatus.COMPLETED, MAX, SIMULATION_PROGRESS_MSG.SIMULATION_COMPLETED],
    ])(
      'rejects both modes when %s with a 409 and writes nothing more',
      async (status, count, key) => {
        for (const mode of [ReportModeType.ASSESSMENT, ReportModeType.PRACTICE]) {
          const { manager, calls } = buildManager({
            progress: progressState({ status, assessmentAttemptsCount: count }),
          });
          const { repository } = buildRepository(manager);

          expect(
            await conflictMessage(repository.recordSubmittedAttempt({ attempt: attempt(mode) })),
          ).toBe(key);
          expect(calls.updates).toEqual([]);
          expect(calls.inserts).toEqual([]);
        }
      },
    );

    it('rejects an Assessment past Max Attempts with ASSESSMENT_ATTEMPT_LIMIT_REACHED', async () => {
      const { manager, calls } = buildManager({
        progress: progressState({ assessmentAttemptsCount: MAX }),
      });
      const { repository } = buildRepository(manager);

      expect(
        await conflictMessage(
          repository.recordSubmittedAttempt({ attempt: attempt(ReportModeType.ASSESSMENT) }),
        ),
      ).toBe(SIMULATION_PROGRESS_MSG.ASSESSMENT_ATTEMPT_LIMIT_REACHED);
      expect(calls.updates).toEqual([]);
    });

    it('maps an insert swallowed by the attempt-number unique to ASSESSMENT_ATTEMPT_LIMIT_REACHED', async () => {
      const { manager, calls } = buildManager({
        progress: progressState(),
        insertedReportId: null,
      });
      const { repository } = buildRepository(manager);

      expect(
        await conflictMessage(
          repository.recordSubmittedAttempt({ attempt: attempt(ReportModeType.ASSESSMENT) }),
        ),
      ).toBe(SIMULATION_PROGRESS_MSG.ASSESSMENT_ATTEMPT_LIMIT_REACHED);
      expect(calls.updates).toEqual([]);
    });

    it('rejects an unknown Simulation with a not-found error before writing', async () => {
      const { manager, calls } = buildManager({ progress: progressState(), simulation: null });
      const { repository } = buildRepository(manager);

      await expect(
        repository.recordSubmittedAttempt({ attempt: attempt(ReportModeType.ASSESSMENT) }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(calls.inserts).toEqual([]);
    });

    it('propagates a failure after the Report insert so the transaction callback aborts (rollback)', async () => {
      const { manager, calls } = buildManager({ progress: progressState() });
      manager.update.mockImplementation((entity: unknown) =>
        entity === Student ? Promise.reject(new Error('injected failure')) : Promise.resolve({}),
      );
      const { repository, typeormRepo } = buildRepository(manager);

      await expect(
        repository.recordSubmittedAttempt({ attempt: attempt(ReportModeType.ASSESSMENT) }),
      ).rejects.toThrow('injected failure');

      // The whole write set ran inside one transaction callback, so rejecting it rolls it all back.
      expect((typeormRepo.manager as { transaction: jest.Mock }).transaction).toHaveBeenCalledTimes(
        1,
      );
      expect(calls.inserts.length).toBeGreaterThan(0);
    });
  });

  describe('forfeit', () => {
    it.each([1, MAX - 1])(
      'forfeits with %i Assessment Attempts and writes no Report',
      async (used) => {
        const { manager, calls } = buildManager({
          progress: progressState({ assessmentAttemptsCount: used }),
        });
        const { repository } = buildRepository(manager);

        const result = await repository.forfeit(STUDENT_ID, SCENARIO_ID);

        expect(result.status).toBe(SimulationProgressStatus.FORFEITED);
        expect(progressUpdate(calls)).toMatchObject({ status: SimulationProgressStatus.FORFEITED });
        expect(progressUpdate(calls)?.forfeitedAt).toBeInstanceOf(Date);
        expect(calls.inserts).toEqual([]);
      },
    );

    it.each([
      ['no progress row (never started)', null],
      ['zero Assessment Attempts', progressState({ practiceAttemptsCount: 4 })],
      ['Max Attempts used', progressState({ assessmentAttemptsCount: MAX })],
      [
        'already Completed',
        progressState({ status: SimulationProgressStatus.COMPLETED, assessmentAttemptsCount: MAX }),
      ],
      [
        'already Forfeited',
        progressState({ status: SimulationProgressStatus.FORFEITED, assessmentAttemptsCount: 1 }),
      ],
    ])('refuses with 409 FORFEIT_NOT_ALLOWED and writes nothing: %s', async (_label, progress) => {
      const { manager, calls } = buildManager({ progress });
      const { repository } = buildRepository(manager);

      expect(await conflictMessage(repository.forfeit(STUDENT_ID, SCENARIO_ID))).toBe(
        SIMULATION_PROGRESS_MSG.FORFEIT_NOT_ALLOWED,
      );
      expect(calls.updates).toEqual([]);
      expect(calls.inserts).toEqual([]);
    });

    it('rejects an unknown Simulation with a not-found error', async () => {
      const { manager } = buildManager({ progress: null, simulation: null });
      const { repository } = buildRepository(manager);

      await expect(repository.forfeit(STUDENT_ID, SCENARIO_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('reads', () => {
    it('finds one progress row through the Simulation business id', async () => {
      const { repository, typeormRepo } = buildRepository({});
      (typeormRepo.findOne as jest.Mock).mockResolvedValue({ id: 'p' });

      expect(await repository.findByStudentAndScenarioId(STUDENT_ID, SCENARIO_ID)).toEqual({
        id: 'p',
      });
      expect(typeormRepo.findOne).toHaveBeenCalledWith({
        where: { studentId: STUDENT_ID, simulation: { id: SCENARIO_ID } },
        relations: { simulation: true },
      });
    });

    it('finds progress for several Simulations in one query, and none for an empty list', async () => {
      const { repository, typeormRepo } = buildRepository({});
      (typeormRepo.find as jest.Mock).mockResolvedValue([{ id: 'p' }]);

      expect(await repository.findByStudentAndScenarioIds(STUDENT_ID, ['a', 'b'])).toEqual([
        { id: 'p' },
      ]);
      expect(typeormRepo.find).toHaveBeenCalledTimes(1);
      expect(await repository.findByStudentAndScenarioIds(STUDENT_ID, [])).toEqual([]);
      expect(typeormRepo.find).toHaveBeenCalledTimes(1);
    });
  });
});
