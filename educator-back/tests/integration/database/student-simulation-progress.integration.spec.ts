import { getMetadataArgsStorage, In, QueryRunner, Repository } from 'typeorm';
import { SimulationReport, StudentSimulationProgress } from '../../../src/database/entities';
import { StudentSimulationProgressRepository } from '../../../src/database/repositories/student-simulation-progress.repository';
import { AddStudentSimulationProgress1791525620523 } from '../../../src/database/migrations/1791525620523-AddStudentSimulationProgress';
import { ReportModeType } from '../../../src/common/constants/simulation-report.constants';
import {
  SimulationAttemptConstants,
  SimulationProgressStatus,
} from '../../../src/common/constants';

const MAX = SimulationAttemptConstants.MAX_ASSESSMENT_ATTEMPTS;
const STUDENT_ID = 'student-uuid';
const SIMULATION_ID = 'simulation-uuid';
const OTHER_SIMULATION_ID = 'other-simulation-uuid';
const CLASS_SIMULATION_ID = 'class-simulation-uuid';

/** Every SQL statement the migration's `up` sends, captured by a mocked QueryRunner. */
const migrationUpSql = async (): Promise<string> => {
  const statements: string[] = [];
  const queryRunner = {
    query: jest.fn((sql: string) => {
      statements.push(sql);
      return Promise.resolve();
    }),
  } as unknown as QueryRunner;
  await new AddStudentSimulationProgress1791525620523().up(queryRunner);
  return statements.join('\n');
};

const checksOf = (target: unknown): Array<{ name?: string; expression?: string }> =>
  getMetadataArgsStorage().checks.filter((check) => check.target === target);

const uniquesOf = (target: unknown): Array<{ name?: string; columns?: unknown }> =>
  getMetadataArgsStorage().uniques.filter((unique) => unique.target === target);

const columnOptions = (propertyName: string) =>
  getMetadataArgsStorage().columns.find(
    (column) => column.target === StudentSimulationProgress && column.propertyName === propertyName,
  )?.options;

describe('student_simulation_progress schema (Integration)', () => {
  describe('CHECK definitions', () => {
    it('bounds assessment_attempts_count by MAX_ASSESSMENT_ATTEMPTS', async () => {
      const check = checksOf(StudentSimulationProgress).find(
        (c) => c.name === 'CHK_student_simulation_progress_assessment_attempts_range',
      );

      expect(check?.expression).toBe(`"assessment_attempts_count" BETWEEN 0 AND ${MAX}`);
      expect(await migrationUpSql()).toContain(
        `CONSTRAINT "CHK_student_simulation_progress_assessment_attempts_range" CHECK ("assessment_attempts_count" BETWEEN 0 AND ${MAX})`,
      );
    });

    it('bounds Assessment attempt_number by MAX_ASSESSMENT_ATTEMPTS', async () => {
      const check = checksOf(SimulationReport).find(
        (c) => c.name === 'CHK_simulation_reports_assessment_attempt_number_range',
      );

      expect(check?.expression).toBe(
        `"mode" <> '${ReportModeType.ASSESSMENT}' OR "attempt_number" IS NULL OR "attempt_number" BETWEEN 1 AND ${MAX}`,
      );
      expect(await migrationUpSql()).toContain(
        `ADD CONSTRAINT "CHK_simulation_reports_assessment_attempt_number_range" CHECK ("mode" <> '${ReportModeType.ASSESSMENT}' OR "attempt_number" IS NULL OR "attempt_number" BETWEEN 1 AND ${MAX})`,
      );
    });
  });

  describe('simulation_reports.attempt_number', () => {
    it('is a nullable column, so rows without an attempt_number stay unconstrained', async () => {
      const column = getMetadataArgsStorage().columns.find(
        (c) => c.target === SimulationReport && c.propertyName === 'attemptNumber',
      );

      expect(column?.options).toMatchObject({ name: 'attempt_number', nullable: true });
      expect(await migrationUpSql()).toContain(
        `ALTER TABLE "simulation_reports" ADD "attempt_number" integer`,
      );
    });

    it('is unique per student, scenario and mode (so another mode or scenario may reuse it)', async () => {
      const unique = uniquesOf(SimulationReport).find(
        (u) => u.name === 'UQ_simulation_reports_student_scenario_mode_attempt',
      );

      expect(unique?.columns).toEqual(['studentId', 'scenarioId', 'mode', 'attemptNumber']);
      expect(await migrationUpSql()).toContain(
        `UNIQUE ("student_id", "scenario_id", "mode", "attempt_number")`,
      );
    });
  });

  describe('student_simulation_progress constraints', () => {
    it('allows a Forfeit only after one Assessment Attempt', async () => {
      const check = checksOf(StudentSimulationProgress).find(
        (c) => c.name === 'CHK_student_simulation_progress_forfeit_needs_attempt',
      );

      expect(check?.expression).toBe('"forfeited_at" IS NULL OR "assessment_attempts_count" >= 1');
      expect(await migrationUpSql()).toContain(
        `CONSTRAINT "CHK_student_simulation_progress_forfeit_needs_attempt" CHECK ("forfeited_at" IS NULL OR "assessment_attempts_count" >= 1)`,
      );
    });

    it('declares one progress row per student and Simulation', async () => {
      const unique = uniquesOf(StudentSimulationProgress).find(
        (u) => u.name === 'UQ_student_simulation_progress_student_simulation',
      );

      expect(unique?.columns).toEqual(['studentId', 'simulationId']);
      expect(await migrationUpSql()).toContain(
        `CONSTRAINT "UQ_student_simulation_progress_student_simulation" UNIQUE ("student_id", "simulation_id")`,
      );
    });

    it('references students, simulations_v2 and class_simulations, and requires class_simulation_id', async () => {
      const sql = await migrationUpSql();

      expect(sql).toContain(`"class_simulation_id" uuid NOT NULL`);
      expect(sql).toContain(
        `FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE`,
      );
      expect(sql).toContain(
        `FOREIGN KEY ("simulation_id") REFERENCES "simulations_v2"("simulation_id")`,
      );
      expect(sql).toContain(
        `FOREIGN KEY ("class_simulation_id") REFERENCES "class_simulations"("id")`,
      );
    });

    it('defaults a new row to in_progress with zero counts', async () => {
      expect(columnOptions('status')?.default).toBe(SimulationProgressStatus.IN_PROGRESS);
      expect(columnOptions('practiceAttemptsCount')?.default).toBe(0);
      expect(columnOptions('assessmentAttemptsCount')?.default).toBe(0);
      expect(columnOptions('forfeitedAt')?.nullable).toBe(true);

      const sql = await migrationUpSql();
      expect(sql).toContain(`"practice_attempts_count" integer NOT NULL DEFAULT '0'`);
      expect(sql).toContain(`"assessment_attempts_count" smallint NOT NULL DEFAULT '0'`);
      expect(sql).toContain(
        `"status" "public"."simulation_progress_status_enum" NOT NULL DEFAULT '${SimulationProgressStatus.IN_PROGRESS}'`,
      );
    });
  });

  describe('StudentSimulationProgressRepository', () => {
    let ormRepo: { findOne: jest.Mock; find: jest.Mock };
    let repo: StudentSimulationProgressRepository;

    const progressRow = (overrides: Partial<StudentSimulationProgress> = {}) =>
      ({
        id: 'progress-1',
        studentId: STUDENT_ID,
        simulationId: SIMULATION_ID,
        classSimulationId: CLASS_SIMULATION_ID,
        status: SimulationProgressStatus.IN_PROGRESS,
        practiceAttemptsCount: 0,
        assessmentAttemptsCount: 0,
        forfeitedAt: null,
        ...overrides,
      }) as StudentSimulationProgress;

    beforeEach(() => {
      ormRepo = { findOne: jest.fn(), find: jest.fn() };
      repo = new StudentSimulationProgressRepository(
        ormRepo as unknown as Repository<StudentSimulationProgress>,
      );
    });

    it('finds one student’s progress on one Simulation, or null when not started', async () => {
      const row = progressRow({ assessmentAttemptsCount: 2 });
      ormRepo.findOne.mockImplementation(({ where }: { where: { simulationId: string } }) =>
        Promise.resolve(where.simulationId === SIMULATION_ID ? row : null),
      );

      const found = await repo.findByStudentAndSimulation(STUDENT_ID, SIMULATION_ID);
      const missing = await repo.findByStudentAndSimulation(STUDENT_ID, OTHER_SIMULATION_ID);

      expect(found?.assessmentAttemptsCount).toBe(2);
      expect(missing).toBeNull();
      expect(ormRepo.findOne).toHaveBeenCalledWith({
        where: { studentId: STUDENT_ID, simulationId: SIMULATION_ID },
      });
    });

    it('finds the rows for a set of Simulation ids and skips ones never started', async () => {
      ormRepo.find.mockResolvedValue([progressRow()]);

      const rows = await repo.findByStudentAndSimulationIds(STUDENT_ID, [
        SIMULATION_ID,
        OTHER_SIMULATION_ID,
      ]);

      expect(rows.map((row) => row.simulationId)).toEqual([SIMULATION_ID]);
      expect(ormRepo.find).toHaveBeenCalledWith({
        where: { studentId: STUDENT_ID, simulationId: In([SIMULATION_ID, OTHER_SIMULATION_ID]) },
      });
    });

    it('returns no rows for an empty set of Simulation ids', async () => {
      expect(await repo.findByStudentAndSimulationIds(STUDENT_ID, [])).toEqual([]);
      expect(ormRepo.find).not.toHaveBeenCalled();
    });
  });
});
