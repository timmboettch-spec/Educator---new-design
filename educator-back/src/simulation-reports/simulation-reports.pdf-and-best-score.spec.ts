import { SimulationReportsService } from './simulation-reports.service';
import { ErrorTypes } from 'src/common/utils/messages';
import type { SimulationReportRow } from 'src/common/interfaces';

type Internals = Record<string, unknown>;

describe('SimulationReportsService PDF and best Assessment score', () => {
  const scoreRow = (
    mode: string,
    score: number | null,
    scoreJson: Record<string, unknown> | null = null,
  ): Record<string, unknown> => ({ mode, score, scoreJson });

  function buildService(overrides: Internals = {}): {
    service: SimulationReportsService;
    internals: Internals;
  } {
    const service = Object.create(SimulationReportsService.prototype) as SimulationReportsService;
    const internals = service as unknown as Internals;
    internals.logger = { warn: jest.fn(), log: jest.fn(), debug: jest.fn(), error: jest.fn() };
    for (const [key, value] of Object.entries(overrides)) {
      Object.defineProperty(service, key, { value, configurable: true, writable: true });
    }
    return { service, internals };
  }

  describe('buildReportPdf', () => {
    it('shows the score_json fallback score and the time column, like the report screen', () => {
      const { service } = buildService();
      const rows = [
        {
          scenarioId: 'scn-1',
          score: null,
          scoreJson: { overallScore: 88 },
          totalTimeSeconds: 754,
          createdAt: new Date('2026-09-01T10:00:00.000Z'),
        },
      ] as unknown as SimulationReportRow[];

      const text = service.buildReportPdf('Student', 'S-1', rows).toString('utf-8');

      expect(text).toContain('Scenario: scn-1');
      expect(text).toContain('Score: 88');
      expect(text).toContain('Time: 754s');
    });

    it('prefers the score column over score_json', () => {
      const { service } = buildService();
      const rows = [
        { scenarioId: 's', score: 70, scoreJson: { overallScore: 10 }, totalTimeSeconds: null },
      ] as unknown as SimulationReportRow[];

      const text = service.buildReportPdf('Student', 'S-1', rows).toString('utf-8');

      expect(text).toContain('Score: 70');
      expect(text).toContain('Time: -s');
    });
  });

  describe('best Assessment score', () => {
    const student = { id: 'stu-1' };
    const find = (service: SimulationReportsService): Promise<number | null> =>
      (
        service as unknown as Internals & {
          findBestAssessmentScore: (s: string, st: unknown) => Promise<number | null>;
        }
      ).findBestAssessmentScore('scn', student);

    it('returns the highest score across all Assessment Attempts and ignores practice', async () => {
      const findScoreRowsByStudentAndScenario = jest
        .fn()
        .mockResolvedValue([
          scoreRow('Assessment', 60),
          scoreRow('Practice', 100),
          scoreRow('Assessment', null, { overallScore: 88 }),
          scoreRow('Assessment', 75),
        ]);
      const { service } = buildService({ reportRepo: { findScoreRowsByStudentAndScenario } });

      expect(await find(service)).toBe(88);
      expect(findScoreRowsByStudentAndScenario).toHaveBeenCalledWith('stu-1', 'scn');
    });

    it('returns null when there are only practice Attempts', async () => {
      const { service } = buildService({
        reportRepo: {
          findScoreRowsByStudentAndScenario: jest
            .fn()
            .mockResolvedValue([scoreRow('Practice', 90)]),
        },
      });

      expect(await find(service)).toBeNull();
    });
  });

  describe('resyncLmsGrade', () => {
    const dto = { studentId: 'stu-1', scenarioId: 'scn' };

    function buildResync(rows: unknown[]): {
      service: SimulationReportsService;
      submitGradePassback: jest.Mock;
    } {
      const submitGradePassback = jest
        .fn()
        .mockResolvedValue({ success: true, message: 'ok', data: {} });
      const { service } = buildService({
        reportRepo: { findScoreRowsByStudentAndScenario: jest.fn().mockResolvedValue(rows) },
        studentRepo: { findOne: jest.fn().mockResolvedValue({ id: 'stu-1', class: { id: 'c1' } }) },
        canManageClassLmsGrades: jest.fn().mockResolvedValue(true),
        submitGradePassback,
      });
      return { service, submitGradePassback };
    }

    it('pushes the best non-practice score from Postgres', async () => {
      const { service, submitGradePassback } = buildResync([
        scoreRow('Assessment', 60),
        scoreRow('Assessment', 92),
        scoreRow('Practice', 100),
      ]);

      await service.resyncLmsGrade({} as never, 'c1', dto);

      expect(submitGradePassback).toHaveBeenCalledWith('stu-1', 'scn', 92, undefined, true);
    });

    it('fails with a bad request when there is no Assessment score', async () => {
      const { service, submitGradePassback } = buildResync([scoreRow('Practice', 100)]);

      const result = await service.resyncLmsGrade({} as never, 'c1', dto);

      expect(result.success).toBe(false);
      expect(result.type).toBe(ErrorTypes.BAD_REQUEST);
      expect(submitGradePassback).not.toHaveBeenCalled();
    });
  });
});
