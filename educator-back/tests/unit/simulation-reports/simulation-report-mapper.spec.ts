import {
  mapRowToReportDetail,
  mapRowToReportFields,
  mapRowToReportListEntry,
} from 'src/common/utils/simulation-report.util';
import type { ReportDetailRow } from 'src/common/interfaces';

const detailRow = (): ReportDetailRow =>
  ({
    reportId: 'report-1787129912644',
    userId: 'LIN-4RJR',
    studentCode: 'LIN-4RJR-CODE',
    key: 'DELL',
    studentName: 'Ava Thompson',
    studentClass: 'Line Test',
    scenarioId: 'cardiac-arrest-101',
    scenarioTitle: 'Post-Op Cardiac Assessment',
    transcriptId: 'tr_8f14e45fceea167a',
    scenarioStartTime: new Date('2026-08-19T08:47:49.913Z'),
    scenarioEndTime: new Date('2026-08-19T08:58:14.637Z'),
    totalTimeSeconds: 622,
    mode: 'Assessment',
    score: 78.5,
    performanceLabel: 'Proficient',
    scoreJson: { overallScore: 78.5, overallLabel: 'Proficient' },
    createdAt: new Date('2026-08-19T08:58:20.000Z'),
    summary: 'Assessment completed',
    summaryEntries: [{ title: 'Vitals checked', category: 'vitals' }],
    summaryByCategory: { actions: [{ title: 'Elevate legs', category: 'actions' }] },
    feedback: 'Good SBAR handover.',
    commonActionTracker: { actionLog: [{ label: 'Hand hygiene', timestampSimMs: 1000 }] },
    communicationAssessment: { rubrics: { overallSummary: 'Clear' } },
    rubricsSummary: 'Completed 5 of 7 required actions.',
    rubricsTotal: 12,
    debriefReflection: 'Check allergies first.',
    actionScores: { 'Actions & Interventions': { weight: 30, score: 66.67 } },
    actionSummary: { totalMandatory: 5, completedMandatory: 3 },
    mandatoryActions: [{ title: 'Hand hygiene', isCorrect: true }],
    optionalActions: [{ title: 'Elevate legs', isOptional: true }],
    distractorActions: [{ title: 'Give oral fluids', isCorrect: false }],
  }) as ReportDetailRow;

describe('simulation report mappers', () => {
  it('pins the list entry shape', () => {
    expect(mapRowToReportListEntry(detailRow())).toMatchInlineSnapshot(`
      {
        "createdAt": "2026-08-19T08:58:20.000Z",
        "id": "report-1787129912644",
        "key": "DELL",
        "mode": "Assessment",
        "performanceLabel": "Proficient",
        "scenarioEndTime": "2026-08-19T08:58:14.637Z",
        "scenarioId": "cardiac-arrest-101",
        "scenarioStartTime": "2026-08-19T08:47:49.913Z",
        "scenarioTitle": "Post-Op Cardiac Assessment",
        "score": 78.5,
        "scoreJson": {
          "overallLabel": "Proficient",
          "overallScore": 78.5,
        },
        "studentClass": "Line Test",
        "studentName": "Ava Thompson",
        "student_id": "LIN-4RJR-CODE",
        "totalTimeSeconds": 622,
        "transcriptId": "tr_8f14e45fceea167a",
        "userId": "LIN-4RJR",
      }
    `);
  });

  it('pins the detail shape', () => {
    expect(mapRowToReportDetail(detailRow())).toMatchInlineSnapshot(`
      {
        "actionScores": {
          "Actions & Interventions": {
            "score": 66.67,
            "weight": 30,
          },
        },
        "actionSummary": {
          "completedMandatory": 3,
          "totalMandatory": 5,
        },
        "commonActionTracker": {
          "actionLog": [
            {
              "label": "Hand hygiene",
              "timestampSimMs": 1000,
            },
          ],
        },
        "communicationAssessment": {
          "rubrics": {
            "overallSummary": "Clear",
          },
        },
        "createdAt": "2026-08-19T08:58:20.000Z",
        "debriefReflection": "Check allergies first.",
        "distractorActions": [
          {
            "isCorrect": false,
            "title": "Give oral fluids",
          },
        ],
        "feedback": "Good SBAR handover.",
        "id": "report-1787129912644",
        "key": "DELL",
        "mandatoryActions": [
          {
            "isCorrect": true,
            "title": "Hand hygiene",
          },
        ],
        "mode": "Assessment",
        "optionalActions": [
          {
            "isOptional": true,
            "title": "Elevate legs",
          },
        ],
        "performanceLabel": "Proficient",
        "rubricsSummary": "Completed 5 of 7 required actions.",
        "rubricsTotal": 12,
        "scenarioEndTime": "2026-08-19T08:58:14.637Z",
        "scenarioId": "cardiac-arrest-101",
        "scenarioStartTime": "2026-08-19T08:47:49.913Z",
        "scenarioTitle": "Post-Op Cardiac Assessment",
        "score": 78.5,
        "scoreJson": {
          "overallLabel": "Proficient",
          "overallScore": 78.5,
        },
        "studentClass": "Line Test",
        "studentName": "Ava Thompson",
        "student_id": "LIN-4RJR-CODE",
        "summary": "Assessment completed",
        "summaryByCategory": {
          "actions": [
            {
              "category": "actions",
              "title": "Elevate legs",
            },
          ],
        },
        "summaryEntries": [
          {
            "category": "vitals",
            "title": "Vitals checked",
          },
        ],
        "totalTimeSeconds": 622,
        "transcriptId": "tr_8f14e45fceea167a",
        "userId": "LIN-4RJR",
      }
    `);
  });

  it('shares field mapping between list and detail', () => {
    const detail = mapRowToReportDetail(detailRow());
    expect(detail).toMatchObject(mapRowToReportListEntry(detailRow()));
  });

  it('omits null columns like a blob entry omits missing fields', () => {
    const row = {
      ...detailRow(),
      scenarioEndTime: null,
      totalTimeSeconds: null,
      score: null,
      feedback: null,
    } as ReportDetailRow;
    const entry = mapRowToReportDetail(row);
    expect(entry).not.toHaveProperty('scenarioEndTime');
    expect(entry).not.toHaveProperty('totalTimeSeconds');
    expect(entry).not.toHaveProperty('score');
    expect(entry).not.toHaveProperty('feedback');
  });

  it('never reads report_data', () => {
    const row = detailRow();
    Object.defineProperty(row, 'reportData', {
      enumerable: true,
      get: () => {
        throw new Error('reportData was read');
      },
    });
    expect(() => mapRowToReportListEntry(row)).not.toThrow();
    expect(() => mapRowToReportDetail(row)).not.toThrow();
  });

  describe('mapRowToReportFields', () => {
    it('maps every typed column under the field name callers already use', () => {
      expect(mapRowToReportFields(detailRow())).toEqual({
        id: 'report-1787129912644',
        userId: 'LIN-4RJR',
        student_id: 'LIN-4RJR-CODE',
        key: 'DELL',
        studentName: 'Ava Thompson',
        studentClass: 'Line Test',
        scenarioId: 'cardiac-arrest-101',
        scenarioTitle: 'Post-Op Cardiac Assessment',
        transcriptId: 'tr_8f14e45fceea167a',
        scenarioStartTime: '2026-08-19T08:47:49.913Z',
        scenarioEndTime: '2026-08-19T08:58:14.637Z',
        totalTimeSeconds: 622,
        mode: 'Assessment',
        score: 78.5,
        overallScore: 78.5,
        performanceLabel: 'Proficient',
        scoreJson: { overallScore: 78.5, overallLabel: 'Proficient' },
        createdAt: '2026-08-19T08:58:20.000Z',
        summary: 'Assessment completed',
        summaryEntries: [{ title: 'Vitals checked', category: 'vitals' }],
        summaryByCategory: { actions: [{ title: 'Elevate legs', category: 'actions' }] },
        feedback: 'Good SBAR handover.',
        commonActionTracker: { actionLog: [{ label: 'Hand hygiene', timestampSimMs: 1000 }] },
        communicationAssessment: { rubrics: { overallSummary: 'Clear' } },
        rubricsSummary: 'Completed 5 of 7 required actions.',
        rubricsTotal: 12,
        debriefReflection: 'Check allergies first.',
        actionScores: { 'Actions & Interventions': { weight: 30, score: 66.67 } },
        actionSummary: { totalMandatory: 5, completedMandatory: 3 },
        mandatoryActions: [{ title: 'Hand hygiene', isCorrect: true }],
        optionalActions: [{ title: 'Elevate legs', isOptional: true }],
        distractorActions: [{ title: 'Give oral fluids', isCorrect: false }],
      });
    });

    it('takes overallScore from score_json.overallScore when the score column is null', () => {
      const row = { ...detailRow(), score: null, scoreJson: { overallScore: 64 } };
      expect(mapRowToReportFields(row).overallScore).toBe(64);
    });

    it('takes the performance label from score_json.overallLabel before the column', () => {
      const row = {
        ...detailRow(),
        performanceLabel: 'Needs Improvement',
        scoreJson: { overallLabel: 'Exceptional' },
      };
      expect(mapRowToReportFields(row).performanceLabel).toBe('Exceptional');
    });

    it('falls back to the performance_label column', () => {
      const row = { ...detailRow(), performanceLabel: 'Needs Improvement', scoreJson: {} };
      expect(mapRowToReportFields(row).performanceLabel).toBe('Needs Improvement');
    });

    it('omits score and label when neither source has one', () => {
      const row = { ...detailRow(), score: null, performanceLabel: null, scoreJson: null };
      const fields = mapRowToReportFields(row);
      expect(fields).not.toHaveProperty('overallScore');
      expect(fields).not.toHaveProperty('performanceLabel');
    });

    it('never reads report_data', () => {
      const row = detailRow();
      Object.defineProperty(row, 'reportData', {
        enumerable: true,
        get: () => {
          throw new Error('reportData was read');
        },
      });
      expect(() => mapRowToReportFields(row)).not.toThrow();
    });
  });
});
