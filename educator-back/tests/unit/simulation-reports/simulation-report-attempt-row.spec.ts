import { buildAttemptRow } from 'src/common/utils/simulation-report.util';
import type { SimulationReportEntry } from 'src/common/interfaces';

const STUDENT_UUID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const generatedReport = (): SimulationReportEntry => ({
  id: 'report-1787129912644',
  key: 'DELL',
  userId: 'LIN-4RJR',
  studentName: 'Ava Thompson',
  student_id: 'LIN-4RJR-CODE',
  studentClass: 'Line Test',
  scenarioId: 'cardiac-arrest-101',
  scenarioTitle: 'Post-Op Cardiac Assessment',
  transcriptId: 'tr_8f14e45fceea167a',
  scenarioStartTime: '2026-08-19T08:47:49.913Z',
  scenarioEndTime: '2026-08-19T08:58:14.637Z',
  totalTimeSeconds: 622,
  commonActionTracker: { actionLog: [{ label: 'Hand hygiene', timestampSimMs: 1000 }] },
  mode: 'Assessment',
  score: 78.5,
  performanceLabel: 'Proficient',
  scoreJson: { overallScore: 78.5, overallLabel: 'Proficient' },
  summary: 'Assessment completed',
  summaryEntries: [{ title: 'Vitals checked', category: 'vitals' }],
  summaryByCategory: { actions: [{ title: 'Elevate legs', category: 'actions' }] },
  feedback: 'Good SBAR handover.',
  communicationAssessment: { rubrics: { overallSummary: 'Clear' } },
  rubricsSummary: 'Completed 5 of 7 required actions.',
  rubricsTotal: 12,
  debriefReflection: 'Check allergies first.',
  actionScores: { 'Actions & Interventions': { weight: 30, score: 66.67 } },
  actionSummary: { totalMandatory: 5, completedMandatory: 3 },
  mandatoryActions: [{ title: 'Hand hygiene', isCorrect: true }],
  optionalActions: [{ title: 'Elevate legs', isOptional: true }],
  distractorActions: [{ title: 'Give oral fluids', isCorrect: false }],
  createdAt: '2026-08-19T08:58:20.000Z',
});

describe('buildAttemptRow', () => {
  it('does not set report_data; the database default supplies it', () => {
    const row = buildAttemptRow(generatedReport(), STUDENT_UUID);

    expect(row).not.toHaveProperty('reportData');
  });

  it('maps the renamed fields: id → report_id, entry student_id (Student Code) → student_code', () => {
    const row = buildAttemptRow(generatedReport(), STUDENT_UUID);

    expect(row.reportId).toBe('report-1787129912644');
    expect(row.studentCode).toBe('LIN-4RJR-CODE');
    expect(row.studentId).toBe(STUDENT_UUID);
  });

  it('fills every scalar column from the generated report', () => {
    const row = buildAttemptRow(generatedReport(), STUDENT_UUID);
    const data = generatedReport();

    expect(row).toMatchObject({
      key: data.key,
      userId: data.userId,
      studentName: data.studentName,
      studentClass: data.studentClass,
      scenarioId: data.scenarioId,
      scenarioTitle: data.scenarioTitle,
      transcriptId: data.transcriptId,
      totalTimeSeconds: data.totalTimeSeconds,
      mode: data.mode,
      score: data.score,
      performanceLabel: data.performanceLabel,
      summary: data.summary,
      feedback: data.feedback,
      rubricsSummary: data.rubricsSummary,
      rubricsTotal: data.rubricsTotal,
      debriefReflection: data.debriefReflection,
    });
    expect(row.scenarioStartTime?.toISOString()).toBe(data.scenarioStartTime);
    expect(row.scenarioEndTime?.toISOString()).toBe(data.scenarioEndTime);
  });

  it('fills every jsonb column from the generated report', () => {
    const row = buildAttemptRow(generatedReport(), STUDENT_UUID);
    const data = generatedReport();

    expect(row.scoreJson).toEqual(data.scoreJson);
    expect(row.summaryEntries).toEqual(data.summaryEntries);
    expect(row.summaryByCategory).toEqual(data.summaryByCategory);
    expect(row.commonActionTracker).toEqual(data.commonActionTracker);
    expect(row.communicationAssessment).toEqual(data.communicationAssessment);
    expect(row.actionScores).toEqual(data.actionScores);
    expect(row.actionSummary).toEqual(data.actionSummary);
    expect(row.mandatoryActions).toEqual(data.mandatoryActions);
    expect(row.optionalActions).toEqual(data.optionalActions);
    expect(row.distractorActions).toEqual(data.distractorActions);
  });

  it('fills the typed columns that sorts and transcript/report-id lookups read', () => {
    const row = buildAttemptRow(generatedReport(), STUDENT_UUID);

    expect(row.mode).toBe('Assessment');
    expect(row.score).toBe(78.5);
    expect(row.totalTimeSeconds).toBe(622);
    expect(row.transcriptId).toBe('tr_8f14e45fceea167a');
    expect(row.reportId).toBe('report-1787129912644');
  });

  it('starts unread', () => {
    const row = buildAttemptRow(generatedReport(), STUDENT_UUID);

    expect(row.viewedAt).toBeNull();
    expect(row.viewedBy).toBeNull();
  });

  it('stores null for fields the generated report omits', () => {
    const row = buildAttemptRow({ id: 'report-1', transcriptId: 'tr-1' }, STUDENT_UUID);

    expect(row).toMatchObject({
      studentName: null,
      scenarioId: null,
      scenarioStartTime: null,
      score: null,
      scoreJson: null,
      mandatoryActions: null,
    });
  });
});
