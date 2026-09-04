import { computeTimelineAnalysis } from '@/modules/reports/timeline-analysis';

describe('Timeline Assessment - Unit Tests', () => {
  const formatSecondsToTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  describe('Timeline-assessed vs Completion-only Elements', () => {
    it('should evaluate timing for blocks with start and duration', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'Initial Assessment',
          sourceId: 'action.assessment',
          start: 0,
          duration: 2,
        },
      ];
      const actionsTimeline = [
        {
          title: 'Initial Assessment',
          timestamp: '2024-01-01T10:00:30Z',
          timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
        },
      ];
      const scenarioStartTime = '2024-01-01T10:00:00Z';

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
      );

      expect(result.timingDetails[0].withinTimeWindow).toBe(true);
      expect(result.timingDetails[0].actualTimeSeconds).toBe(30);
      expect(result.timingDetails[0].status).toBe('Completed on time');
    });

    it('should mark completion-only blocks without timing evaluation', () => {
      const timelineBlocks = [
        { id: 'b1', label: 'Documentation', sourceId: 'action.documentation' },
      ];
      const actionsTimeline = [
        {
          title: 'Documentation',
          timestamp: '2024-01-01T10:05:00Z',
          timestampValue: new Date('2024-01-01T10:05:00Z').getTime(),
        },
      ];
      const scenarioStartTime = '2024-01-01T10:00:00Z';

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
      );

      expect(result.timingDetails[0].completed).toBe(true);
      expect(result.timingDetails[0].status).toBe('Completed');
      expect(result.timingDetails[0].withinTimeWindow).toBeUndefined();
    });

    it('should distinguish between timed and untimed blocks in same scenario', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'Vitals Check',
          sourceId: 'action.vitals',
          start: 0,
          duration: 1,
        },
        { id: 'b2', label: 'Patient Education', sourceId: 'action.education' },
      ];
      const actionsTimeline = [
        {
          title: 'Vitals Check',
          timestamp: '2024-01-01T10:00:30Z',
          timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
        },
        {
          title: 'Patient Education',
          timestamp: '2024-01-01T10:05:00Z',
          timestampValue: new Date('2024-01-01T10:05:00Z').getTime(),
        },
      ];
      const scenarioStartTime = '2024-01-01T10:00:00Z';

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
      );

      expect(result.timingDetails[0].withinTimeWindow).toBeDefined();
      expect(result.timingDetails[1].withinTimeWindow).toBeUndefined();
      expect(result.completionRate).toBe(100);
    });
  });

  describe('Timing Data Capture', () => {
    it('should capture early completion timing', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'Assessment',
          sourceId: 'action.assessment',
          start: 2,
          duration: 2,
        },
      ];
      const actionsTimeline = [
        {
          title: 'Assessment',
          timestamp: '2024-01-01T10:00:30Z',
          timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
        },
      ];
      const scenarioStartTime = '2024-01-01T10:00:00Z';

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
      );

      expect(result.timingDetails[0].withinTimeWindow).toBe(false);
      expect(result.timingDetails[0].status).toBe('Completed too early');
      expect(result.timingDetails[0].actualTimeSeconds).toBe(30);
      expect(result.timingDetails[0].expectedStartSeconds).toBe(120);
    });

    it('should capture late completion timing', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'Intervention',
          sourceId: 'action.intervention',
          start: 0,
          duration: 1,
        },
      ];
      const actionsTimeline = [
        {
          title: 'Intervention',
          timestamp: '2024-01-01T10:02:00Z',
          timestampValue: new Date('2024-01-01T10:02:00Z').getTime(),
        },
      ];
      const scenarioStartTime = '2024-01-01T10:00:00Z';

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
      );

      expect(result.timingDetails[0].withinTimeWindow).toBe(false);
      expect(result.timingDetails[0].status).toBe('Completed too late');
      expect(result.timingDetails[0].actualTimeSeconds).toBe(120);
      expect(result.timingDetails[0].expectedEndSeconds).toBe(60);
    });

    it('should capture formatted time strings', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'Action',
          sourceId: 'action.test',
          start: 0,
          duration: 2,
        },
      ];
      const actionsTimeline = [
        {
          title: 'Action',
          timestamp: '2024-01-01T10:01:30Z',
          timestampValue: new Date('2024-01-01T10:01:30Z').getTime(),
        },
      ];
      const scenarioStartTime = '2024-01-01T10:00:00Z';

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
      );

      expect(result.timingDetails[0].actualTimeFormatted).toBe('1:30');
      expect(result.timingDetails[0].expectedStartFormatted).toBe('0:00');
      expect(result.timingDetails[0].expectedEndFormatted).toBe('2:00');
    });
  });

  describe('Order and Sequence Validation', () => {
    it('should detect prerequisite violations', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'Hand Hygiene',
          sourceId: 'action.hygiene',
          start: 0,
          duration: 1,
        },
        {
          id: 'b2',
          label: 'Patient Contact',
          sourceId: 'action.contact',
          start: 1,
          duration: 1,
          prerequisites: ['b1'],
        },
      ];
      const actionsTimeline = [
        {
          title: 'Patient Contact',
          timestamp: '2024-01-01T10:00:30Z',
          timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
        },
        {
          title: 'Hand Hygiene',
          timestamp: '2024-01-01T10:01:00Z',
          timestampValue: new Date('2024-01-01T10:01:00Z').getTime(),
        },
      ];
      const scenarioStartTime = '2024-01-01T10:00:00Z';

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
      );

      expect(result.sequenceViolations.length).toBeGreaterThan(0);
      expect(result.sequenceViolations[0].type).toBe('prerequisite_order_violation');
      expect(result.sequenceViolations[0].blockId).toBe('b2');
    });

    it('should detect followup violations', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'Assessment',
          sourceId: 'action.assessment',
          start: 0,
          duration: 1,
          followups: ['b2'],
        },
        {
          id: 'b2',
          label: 'Documentation',
          sourceId: 'action.documentation',
          start: 1,
          duration: 1,
        },
      ];
      const actionsTimeline = [
        {
          title: 'Documentation',
          timestamp: '2024-01-01T10:00:30Z',
          timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
        },
        {
          title: 'Assessment',
          timestamp: '2024-01-01T10:01:00Z',
          timestampValue: new Date('2024-01-01T10:01:00Z').getTime(),
        },
      ];
      const scenarioStartTime = '2024-01-01T10:00:00Z';

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
      );

      expect(result.sequenceViolations.length).toBeGreaterThan(0);
      expect(result.sequenceViolations[0].type).toBe('followup_order_violation');
    });

    it('should validate sequence chain order', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'Step 1',
          sourceId: 'action.step1',
          start: 0,
          duration: 1,
          sequenceChain: ['b1', 'b2', 'b3'],
        },
        {
          id: 'b2',
          label: 'Step 2',
          sourceId: 'action.step2',
          start: 1,
          duration: 1,
        },
        {
          id: 'b3',
          label: 'Step 3',
          sourceId: 'action.step3',
          start: 2,
          duration: 1,
        },
      ];
      const actionsTimeline = [
        {
          title: 'Step 2',
          timestamp: '2024-01-01T10:00:30Z',
          timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
        },
        {
          title: 'Step 1',
          timestamp: '2024-01-01T10:01:00Z',
          timestampValue: new Date('2024-01-01T10:01:00Z').getTime(),
        },
        {
          title: 'Step 3',
          timestamp: '2024-01-01T10:01:30Z',
          timestampValue: new Date('2024-01-01T10:01:30Z').getTime(),
        },
      ];
      const scenarioStartTime = '2024-01-01T10:00:00Z';

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
      );

      expect(result.sequenceViolations.length).toBeGreaterThan(0);
      expect(result.sequenceViolations[0].type).toBe('sequence_chain_violation');
    });

    it('should pass when prerequisites are met in correct order', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'PPE',
          sourceId: 'action.ppe',
          start: 0,
          duration: 1,
        },
        {
          id: 'b2',
          label: 'Assessment',
          sourceId: 'action.assessment',
          start: 1,
          duration: 1,
          prerequisites: ['b1'],
        },
      ];
      const actionsTimeline = [
        {
          title: 'PPE',
          timestamp: '2024-01-01T10:00:30Z',
          timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
        },
        {
          title: 'Assessment',
          timestamp: '2024-01-01T10:01:30Z',
          timestampValue: new Date('2024-01-01T10:01:30Z').getTime(),
        },
      ];
      const scenarioStartTime = '2024-01-01T10:00:00Z';

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
      );

      expect(result.sequenceViolations.length).toBe(0);
      expect(result.timingDetails[1].prerequisitesMet).toBe(true);
    });
  });

  describe('Omission Data Capture', () => {
    it('should identify missed blocks', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'Completed Action',
          sourceId: 'action.completed',
          start: 0,
          duration: 1,
        },
        {
          id: 'b2',
          label: 'Missed Action',
          sourceId: 'action.missed',
          start: 1,
          duration: 1,
        },
      ];
      const actionsTimeline = [
        {
          title: 'Completed Action',
          timestamp: '2024-01-01T10:00:30Z',
          timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
        },
      ];
      const scenarioStartTime = '2024-01-01T10:00:00Z';

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
      );

      expect(result.missedBlocks).toContain('Missed Action');
      expect(result.completedBlocks).toContain('Completed Action');
      expect(result.completionRate).toBe(50);
    });

    it('should mark missed blocks with appropriate status', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'Not Done',
          sourceId: 'action.notdone',
          start: 0,
          duration: 1,
        },
      ];
      const actionsTimeline: unknown[] = [];
      const scenarioStartTime = '2024-01-01T10:00:00Z';

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
      );

      expect(result.timingDetails[0].completed).toBe(false);
      expect(result.timingDetails[0].status).toBe('Not completed');
    });

    it('should calculate correct completion rate with omissions', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'Action 1',
          sourceId: 'action.1',
          start: 0,
          duration: 1,
        },
        {
          id: 'b2',
          label: 'Action 2',
          sourceId: 'action.2',
          start: 1,
          duration: 1,
        },
        {
          id: 'b3',
          label: 'Action 3',
          sourceId: 'action.3',
          start: 2,
          duration: 1,
        },
        {
          id: 'b4',
          label: 'Action 4',
          sourceId: 'action.4',
          start: 3,
          duration: 1,
        },
      ];
      const actionsTimeline = [
        {
          title: 'Action 1',
          timestamp: '2024-01-01T10:00:30Z',
          timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
        },
        {
          title: 'Action 3',
          timestamp: '2024-01-01T10:02:30Z',
          timestampValue: new Date('2024-01-01T10:02:30Z').getTime(),
        },
      ];
      const scenarioStartTime = '2024-01-01T10:00:00Z';

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
      );

      expect(result.completionRate).toBe(50);
      expect(result.completedBlocks.length).toBe(2);
      expect(result.missedBlocks.length).toBe(2);
    });
  });

  describe('Compliance Rate Calculations', () => {
    it('should calculate timing compliance rate correctly', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'On Time',
          sourceId: 'action.ontime',
          start: 0,
          duration: 1,
        },
        {
          id: 'b2',
          label: 'Late',
          sourceId: 'action.late',
          start: 0,
          duration: 1,
        },
        {
          id: 'b3',
          label: 'Early',
          sourceId: 'action.early',
          start: 2,
          duration: 1,
        },
      ];
      const actionsTimeline = [
        {
          title: 'On Time',
          timestamp: '2024-01-01T10:00:30Z',
          timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
        },
        {
          title: 'Late',
          timestamp: '2024-01-01T10:02:00Z',
          timestampValue: new Date('2024-01-01T10:02:00Z').getTime(),
        },
        {
          title: 'Early',
          timestamp: '2024-01-01T10:00:30Z',
          timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
        },
      ];
      const scenarioStartTime = '2024-01-01T10:00:00Z';

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
      );

      expect(result.timingComplianceRate).toBe(33); // 1 out of 3 on time
    });

    it('should calculate sequence compliance rate correctly', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'First',
          sourceId: 'action.first',
          start: 0,
          duration: 1,
        },
        {
          id: 'b2',
          label: 'Second',
          sourceId: 'action.second',
          start: 1,
          duration: 1,
          prerequisites: ['b1'],
        },
        {
          id: 'b3',
          label: 'Third',
          sourceId: 'action.third',
          start: 2,
          duration: 1,
          prerequisites: ['b2'],
        },
      ];
      const actionsTimeline = [
        {
          title: 'Second',
          timestamp: '2024-01-01T10:00:30Z',
          timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
        },
        {
          title: 'First',
          timestamp: '2024-01-01T10:01:00Z',
          timestampValue: new Date('2024-01-01T10:01:00Z').getTime(),
        },
        {
          title: 'Third',
          timestamp: '2024-01-01T10:02:00Z',
          timestampValue: new Date('2024-01-01T10:02:00Z').getTime(),
        },
      ];
      const scenarioStartTime = '2024-01-01T10:00:00Z';

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
      );

      expect(result.sequenceComplianceRate).toBeLessThan(100);
      expect(result.sequenceViolations.length).toBeGreaterThan(0);
    });
  });

  describe('Patient Data Block Handling', () => {
    it('should mark patient data blocks for AI analysis', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'Chief Complaint',
          sourceId: 'patient.chiefComplaint',
          start: 0,
          duration: 2,
        },
      ];
      const actionsTimeline: unknown[] = [];
      const scenarioStartTime = '2024-01-01T10:00:00Z';

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
      );

      expect(result.patientDataBlocks.length).toBe(1);
      expect(result.patientDataBlocks[0].patientField).toBe('chiefcomplaint');
      expect(result.timingDetails[0].requiresAIAnalysis).toBe(true);
      expect(result.timingDetails[0].status).toBe('Pending AI Analysis');
    });

    it('should skip patient data blocks in sequence validation', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'History',
          sourceId: 'patient.history',
          start: 0,
          duration: 1,
        },
        {
          id: 'b2',
          label: 'Assessment',
          sourceId: 'action.assessment',
          start: 1,
          duration: 1,
          prerequisites: ['b1'],
        },
      ];
      const actionsTimeline = [
        {
          title: 'Assessment',
          timestamp: '2024-01-01T10:01:30Z',
          timestampValue: new Date('2024-01-01T10:01:30Z').getTime(),
        },
      ];
      const scenarioStartTime = '2024-01-01T10:00:00Z';

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
      );

      // Should not create sequence violation for patient data prerequisite
      const assessmentViolations = result.sequenceViolations.filter((v) => v.blockId === 'b2');
      expect(assessmentViolations.length).toBe(0);
    });
  });

  describe('Vitals Block Handling', () => {
    it('should detect vitals from summaryByCategory', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'Heart Rate',
          sourceId: 'vitals.heartrate',
          start: 0,
          duration: 1,
        },
      ];
      const actionsTimeline: unknown[] = [];
      const scenarioStartTime = '2024-01-01T10:00:00Z';
      const summaryByCategory = {
        vitals: {
          'Heart Rate': [
            {
              value: '80',
              timestamp: '2024-01-01T10:00:30Z',
              timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
            },
          ],
        },
      };

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
        summaryByCategory,
      );

      expect(result.completedBlocks).toContain('Heart Rate');
      expect(result.timingDetails[0].completed).toBe(true);
    });

    it('should detect verbalization of vitals', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'Blood Pressure',
          sourceId: 'vitals.bloodpressure',
          start: 0,
          duration: 1,
        },
      ];
      const actionsTimeline: unknown[] = [];
      const scenarioStartTime = '2024-01-01T10:00:00Z';
      const summaryByCategory = {
        vitals: {
          'Blood Pressure': [
            {
              value: '120/80',
              timestamp: '2024-01-01T10:00:30Z',
              timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
            },
          ],
        },
      };
      const conversationMessages = [
        {
          speaker: 'student',
          text: 'Blood pressure is 120 over 80',
          timestamp: '2024-01-01T10:00:35Z',
        },
      ];

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
        summaryByCategory,
        conversationMessages,
      );

      expect(result.timingDetails[0].verbalized).toBe(true);
      expect(result.timingDetails[0].completionSource).toBe('summary-verbalized');
    });
  });

  describe('PPE Block Handling', () => {
    it('should detect PPE from commonActionTracker', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'Gloves',
          sourceId: 'ppe.gloves',
          start: 0,
          duration: 1,
        },
      ];
      const actionsTimeline: unknown[] = [];
      const scenarioStartTime = '2024-01-01T10:00:00Z';
      const commonActionTracker = [
        {
          label: 'Gloves',
          timestamp: '10:00:30 AM',
          timestampValue: new Date('2024-01-01T10:00:30Z').getTime(),
        },
      ];

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
        undefined,
        commonActionTracker,
      );

      expect(result.completedBlocks).toContain('Gloves');
      expect(result.timingDetails[0].completionSource).toBe('ppe');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty timeline blocks', () => {
      const result = computeTimelineAnalysis([], [], '2024-01-01T10:00:00Z', formatSecondsToTime);

      expect(result.completedBlocks).toEqual([]);
      expect(result.missedBlocks).toEqual([]);
      expect(result.completionRate).toBe(0);
    });

    it('should handle missing scenario start time', () => {
      const timelineBlocks = [
        {
          id: 'b1',
          label: 'Action',
          sourceId: 'action.test',
          start: 0,
          duration: 1,
        },
      ];
      const actionsTimeline = [{ title: 'Action', timestamp: '2024-01-01T10:00:30Z' }];

      const result = computeTimelineAnalysis(actionsTimeline, timelineBlocks);

      expect(result.timingDetails[0].completed).toBe(true);
      expect(result.timingDetails[0].withinTimeWindow).toBeUndefined();
    });

    it('should handle blocks without timing windows', () => {
      const timelineBlocks = [{ id: 'b1', label: 'Flexible Action', sourceId: 'action.flexible' }];
      const actionsTimeline = [
        {
          title: 'Flexible Action',
          timestamp: '2024-01-01T10:05:00Z',
          timestampValue: new Date('2024-01-01T10:05:00Z').getTime(),
        },
      ];
      const scenarioStartTime = '2024-01-01T10:00:00Z';

      const result = computeTimelineAnalysis(
        actionsTimeline,
        timelineBlocks,
        scenarioStartTime,
        formatSecondsToTime,
      );

      expect(result.timingDetails[0].completed).toBe(true);
      expect(result.timingDetails[0].status).toBe('Completed');
    });
  });
});
