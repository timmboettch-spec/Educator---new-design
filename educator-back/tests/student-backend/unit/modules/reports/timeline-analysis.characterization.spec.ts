import { computeTimelineAnalysis } from '@/modules/reports/timeline-analysis';

/**
 * Characterization spec for `computeTimelineAnalysis`.
 *
 * Pins the CURRENT behaviour of the Timeline analysis engine so a typing-only refactor can prove it
 * changed nothing. Every assertion compares the function's complete result, which is serialized
 * into the AI report prompt. Where the current behaviour looks odd (e.g. a negative
 * `sequenceComplianceRate`) it is pinned as-is, not fixed — see the notes inline.
 */
describe('computeTimelineAnalysis - characterization', () => {
  const fmt = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  describe('action blocks', () => {
    it('matches an action, misses an unmatched one, and completes a match with no timing reference', () => {
      const blocks = [
        { id: 'a1', label: 'Wash Hands', sourceId: 'action.wash', start: 0, duration: 2 },
        { id: 'a2', label: 'Check Pulse', sourceId: 'action.pulse', start: 1, duration: 1 },
        { id: 'a3', label: 'Introduce Self', sourceId: 'action.intro' },
      ];
      const actions = [{ title: 'Wash Hands', elapsedSeconds: 30 }, { title: 'Introduce Self' }];

      const result = computeTimelineAnalysis(actions, blocks, undefined, fmt);

      expect(result).toEqual({
        completedBlocks: ['Wash Hands', 'Introduce Self'],
        missedBlocks: ['Check Pulse'],
        timingDetails: [
          {
            blockLabel: 'Wash Hands',
            blockId: 'a1',
            sourceId: 'action.wash',
            expectedStartSeconds: 0,
            expectedEndSeconds: 120,
            expectedStartFormatted: '0:00',
            expectedEndFormatted: '2:00',
            actualTimeSeconds: 30,
            actualTimeFormatted: '0:30',
            withinTimeWindow: true,
            status: 'Completed on time',
            completed: true,
            completionSource: 'action',
            prerequisites: [],
            followups: [],
            prerequisitesMet: true,
            followupsCorrect: true,
          },
          {
            blockLabel: 'Introduce Self',
            blockId: 'a3',
            sourceId: 'action.intro',
            actualTimeSeconds: null,
            status: 'Completed',
            completed: true,
            completionSource: 'action',
            prerequisites: [],
            followups: [],
          },
          {
            blockLabel: 'Check Pulse',
            blockId: 'a2',
            sourceId: 'action.pulse',
            completed: false,
            status: 'Not completed',
            prerequisites: [],
            followups: [],
          },
        ],
        completionRate: 67,
        timingComplianceRate: 100,
        sequenceComplianceRate: 100,
        sequenceViolations: [],
        patientDataBlocks: [],
      });
    });

    it('consumes each event once, earliest first, falls back to title, and defaults the time formatter to seconds', () => {
      const blocks = [
        { id: 'w1', title: 'Wash Hands', sourceId: 'action.wash', start: 0, duration: 2 },
        { id: 'w2', title: 'Wash Hands', sourceId: 'action.wash', start: 5, duration: 2 },
        { id: 'w3', title: 'Wash Hands', sourceId: 'action.wash', start: 10, duration: 1 },
      ];
      const actions = [
        { title: 'wash hands', elapsedSeconds: 400 },
        { title: 'Wash Hands', elapsedSeconds: 30 },
      ];

      const result = computeTimelineAnalysis(actions, blocks);

      expect(result).toEqual({
        completedBlocks: ['Wash Hands', 'Wash Hands'],
        missedBlocks: ['Wash Hands'],
        timingDetails: [
          {
            blockLabel: 'Wash Hands',
            blockId: 'w1',
            sourceId: 'action.wash',
            expectedStartSeconds: 0,
            expectedEndSeconds: 120,
            expectedStartFormatted: '0s',
            expectedEndFormatted: '120s',
            actualTimeSeconds: 30,
            actualTimeFormatted: '30s',
            withinTimeWindow: true,
            status: 'Completed on time',
            completed: true,
            completionSource: 'action',
            prerequisites: [],
            followups: [],
            prerequisitesMet: true,
            followupsCorrect: true,
          },
          {
            blockLabel: 'Wash Hands',
            blockId: 'w2',
            sourceId: 'action.wash',
            expectedStartSeconds: 300,
            expectedEndSeconds: 420,
            expectedStartFormatted: '300s',
            expectedEndFormatted: '420s',
            actualTimeSeconds: 400,
            actualTimeFormatted: '400s',
            withinTimeWindow: true,
            status: 'Completed on time',
            completed: true,
            completionSource: 'action',
            prerequisites: [],
            followups: [],
            prerequisitesMet: true,
            followupsCorrect: true,
          },
          {
            blockLabel: 'Wash Hands',
            blockId: 'w3',
            sourceId: 'action.wash',
            completed: false,
            status: 'Not completed',
            prerequisites: [],
            followups: [],
          },
        ],
        completionRate: 67,
        timingComplianceRate: 67,
        sequenceComplianceRate: 100,
        sequenceViolations: [],
        patientDataBlocks: [],
      });
    });

    it('prefers summaryByCategory.actions over the actions timeline when it is non-empty', () => {
      const blocks = [
        { id: 'p1', label: 'Alpha', sourceId: 'action.alpha', start: 0, duration: 5 },
      ];
      const expected = (actual: number, formatted: string) => ({
        completedBlocks: ['Alpha'],
        missedBlocks: [],
        timingDetails: [
          {
            blockLabel: 'Alpha',
            blockId: 'p1',
            sourceId: 'action.alpha',
            expectedStartSeconds: 0,
            expectedEndSeconds: 300,
            expectedStartFormatted: '0:00',
            expectedEndFormatted: '5:00',
            actualTimeSeconds: actual,
            actualTimeFormatted: formatted,
            withinTimeWindow: true,
            status: 'Completed on time',
            completed: true,
            completionSource: 'action',
            prerequisites: [],
            followups: [],
            prerequisitesMet: true,
            followupsCorrect: true,
          },
        ],
        completionRate: 100,
        timingComplianceRate: 100,
        sequenceComplianceRate: 100,
        sequenceViolations: [],
        patientDataBlocks: [],
      });

      const fromSummary = computeTimelineAnalysis(
        [{ title: 'Alpha', elapsedSeconds: 10 }],
        blocks,
        undefined,
        fmt,
        { actions: [{ title: 'Alpha', elapsedSeconds: 99 }] },
      );
      const fromTimeline = computeTimelineAnalysis(
        [{ title: 'Alpha', elapsedSeconds: 10 }],
        blocks,
        undefined,
        fmt,
        { actions: [] },
      );

      expect(fromSummary).toEqual(expected(99, '1:39'));
      expect(fromTimeline).toEqual(expected(10, '0:10'));
    });
  });

  describe('order blocks', () => {
    it('strips a trailing parenthetical from the title and reports early, late and missed orders', () => {
      const blocks = [
        {
          id: 'o1',
          label: 'Order Saline (500 mL)',
          sourceId: 'order.saline',
          start: 1,
          duration: 2,
        },
        { id: 'o2', label: 'Order Oxygen', sourceId: 'orders.oxygen', start: 0, duration: 1 },
        { id: 'o3', label: 'Order Labs (CBC) ', sourceId: 'order.labs', start: 10, duration: 2 },
        { id: 'o4', label: 'Order Chart', sourceId: 'order.chart', start: 0, duration: 1 },
      ];
      const summary = {
        orders: [
          { title: 'Order Saline', elapsedSeconds: 20 },
          { title: 'order labs', elapsedSeconds: 700 },
          { title: 'Order Chart', elapsedSeconds: 900 },
        ],
      };

      const result = computeTimelineAnalysis([], blocks, undefined, fmt, summary);

      expect(result).toEqual({
        completedBlocks: ['Order Labs (CBC) '],
        missedBlocks: ['Order Oxygen'],
        timingDetails: [
          {
            blockLabel: 'Order Oxygen',
            blockId: 'o2',
            sourceId: 'orders.oxygen',
            completed: false,
            status: 'Not completed',
            prerequisites: [],
            followups: [],
          },
          {
            blockLabel: 'Order Chart',
            blockId: 'o4',
            sourceId: 'order.chart',
            expectedStartSeconds: 0,
            expectedEndSeconds: 60,
            expectedStartFormatted: '0:00',
            expectedEndFormatted: '1:00',
            actualTimeSeconds: 900,
            actualTimeFormatted: '15:00',
            withinTimeWindow: false,
            status: 'Completed too late',
            completed: true,
            completionSource: 'order',
            prerequisites: [],
            followups: [],
            prerequisitesMet: true,
            followupsCorrect: true,
          },
          {
            blockLabel: 'Order Saline (500 mL)',
            blockId: 'o1',
            sourceId: 'order.saline',
            expectedStartSeconds: 60,
            expectedEndSeconds: 180,
            expectedStartFormatted: '1:00',
            expectedEndFormatted: '3:00',
            actualTimeSeconds: 20,
            actualTimeFormatted: '0:20',
            withinTimeWindow: false,
            status: 'Completed too early',
            completed: true,
            completionSource: 'order',
            prerequisites: [],
            followups: [],
            prerequisitesMet: true,
            followupsCorrect: true,
          },
          {
            blockLabel: 'Order Labs (CBC) ',
            blockId: 'o3',
            sourceId: 'order.labs',
            expectedStartSeconds: 600,
            expectedEndSeconds: 720,
            expectedStartFormatted: '10:00',
            expectedEndFormatted: '12:00',
            actualTimeSeconds: 700,
            actualTimeFormatted: '11:40',
            withinTimeWindow: true,
            status: 'Completed on time',
            completed: true,
            completionSource: 'order',
            prerequisites: [],
            followups: [],
            prerequisitesMet: true,
            followupsCorrect: true,
          },
        ],
        completionRate: 25,
        timingComplianceRate: 25,
        sequenceComplianceRate: 100,
        sequenceViolations: [],
        patientDataBlocks: [],
      });
    });
  });

  describe('vital blocks', () => {
    it('resolves the new vital.{actionId}.{vitalKey} format from action vitals', () => {
      const blocks = [
        {
          id: 'v1',
          label: 'Record Heart Rate',
          sourceId: 'vital.act1.heartRate',
          start: 1,
          duration: 2,
        },
        {
          id: 'v2',
          label: 'Record BP',
          sourceId: 'vital.act1.bloodPressure',
          start: 0,
          duration: 1,
        },
        {
          id: 'v3',
          label: 'Record Glucose',
          sourceId: 'vital.act1.glucose',
          start: 0,
          duration: 5,
        },
      ];
      const summary = {
        actions: [
          { title: 'Admission', elapsedSeconds: 5 },
          {
            title: 'Vitals Round',
            elapsedSeconds: 10,
            vitals: {
              hr: [{ elapsedSeconds: 50 }, { elapsedSeconds: 85 }, { elapsedSeconds: 200 }],
              glucose: [{ elapsedSeconds: 250 }],
            },
          },
          { title: 'Untimed Vitals', vitals: { bp: [], HeartRate: [{}] } },
        ],
      };

      const result = computeTimelineAnalysis([], blocks, undefined, fmt, summary);

      expect(result).toEqual({
        completedBlocks: ['Record Glucose'],
        missedBlocks: ['Record BP'],
        timingDetails: [
          {
            blockLabel: 'Record BP',
            blockId: 'v2',
            sourceId: 'vital.act1.bloodPressure',
            completed: false,
            status: 'Not completed',
            prerequisites: [],
            followups: [],
          },
          {
            blockLabel: 'Record Glucose',
            blockId: 'v3',
            sourceId: 'vital.act1.glucose',
            expectedStartSeconds: 0,
            expectedEndSeconds: 300,
            expectedStartFormatted: '0:00',
            expectedEndFormatted: '5:00',
            actualTimeSeconds: 250,
            actualTimeFormatted: '4:10',
            withinTimeWindow: true,
            status: 'Completed on time',
            completed: true,
            completionSource: 'summary',
            prerequisites: [],
            followups: [],
            prerequisitesMet: true,
            followupsCorrect: true,
          },
          {
            blockLabel: 'Record Heart Rate',
            blockId: 'v1',
            sourceId: 'vital.act1.heartRate',
            expectedStartSeconds: 60,
            expectedEndSeconds: 180,
            expectedStartFormatted: '1:00',
            expectedEndFormatted: '3:00',
            actualTimeSeconds: 50,
            actualTimeFormatted: '0:50',
            withinTimeWindow: false,
            status: 'Completed too early',
            completed: true,
            completionSource: 'summary',
            prerequisites: [],
            followups: [],
            prerequisitesMet: true,
            followupsCorrect: true,
          },
        ],
        completionRate: 33,
        timingComplianceRate: 33,
        sequenceComplianceRate: 100,
        sequenceViolations: [],
        patientDataBlocks: [],
      });
    });

    it('resolves the old vitals.{type} format, consuming readings and flagging verbalized vitals', () => {
      const blocks = [
        {
          id: 'h1',
          label: 'Heart Rate Check',
          sourceId: 'vitals.heartRate',
          start: 0,
          duration: 2,
        },
        { id: 'b1', label: 'BP Check', sourceId: 'vitals.bloodPressure', start: 2, duration: 2 },
        {
          id: 'h2',
          label: 'Heart Rate Recheck',
          sourceId: 'vitals.heartrate',
          start: 5,
          duration: 1,
        },
        { id: 's1', label: 'SpO2 Check', sourceId: 'vitals.spo2', start: 0, duration: 1 },
      ];
      const summary = {
        vitals: {
          'Heart Rate': [{ elapsedSeconds: 400 }, { elapsedSeconds: 50 }],
          'Blood Pressure': [{ elapsedSeconds: 145 }, { elapsedSeconds: 110 }],
        },
      };
      const tracker = { actionLog: [{ text: 'Nurse asked about pulse' }] };

      const result = computeTimelineAnalysis([], blocks, undefined, fmt, summary, tracker);

      expect(result).toEqual({
        completedBlocks: ['Heart Rate Check'],
        missedBlocks: ['SpO2 Check'],
        timingDetails: [
          {
            blockLabel: 'Heart Rate Check',
            blockId: 'h1',
            sourceId: 'vitals.heartRate',
            expectedStartSeconds: 0,
            expectedEndSeconds: 120,
            expectedStartFormatted: '0:00',
            expectedEndFormatted: '2:00',
            actualTimeSeconds: 50,
            actualTimeFormatted: '0:50',
            withinTimeWindow: true,
            status: 'Completed on time',
            completed: true,
            completionSource: 'summary-verbalized',
            verbalized: true,
            prerequisites: [],
            followups: [],
            prerequisitesMet: true,
            followupsCorrect: true,
          },
          {
            blockLabel: 'SpO2 Check',
            blockId: 's1',
            sourceId: 'vitals.spo2',
            completed: false,
            status: 'Not completed',
            prerequisites: [],
            followups: [],
          },
          {
            blockLabel: 'BP Check',
            blockId: 'b1',
            sourceId: 'vitals.bloodPressure',
            expectedStartSeconds: 120,
            expectedEndSeconds: 240,
            expectedStartFormatted: '2:00',
            expectedEndFormatted: '4:00',
            actualTimeSeconds: 110,
            actualTimeFormatted: '1:50',
            withinTimeWindow: false,
            status: 'Completed too early',
            completed: true,
            completionSource: 'summary',
            prerequisites: [],
            followups: [],
            prerequisitesMet: true,
            followupsCorrect: true,
          },
          {
            blockLabel: 'Heart Rate Recheck',
            blockId: 'h2',
            sourceId: 'vitals.heartrate',
            expectedStartSeconds: 300,
            expectedEndSeconds: 360,
            expectedStartFormatted: '5:00',
            expectedEndFormatted: '6:00',
            actualTimeSeconds: 400,
            actualTimeFormatted: '6:40',
            withinTimeWindow: false,
            status: 'Completed too late',
            completed: true,
            completionSource: 'summary-verbalized',
            verbalized: true,
            prerequisites: [],
            followups: [],
            prerequisitesMet: true,
            followupsCorrect: true,
          },
        ],
        completionRate: 25,
        timingComplianceRate: 25,
        sequenceComplianceRate: 100,
        sequenceViolations: [],
        patientDataBlocks: [],
      });
    });

    it.each([
      ['message', { message: 'checked pulse' }, true],
      ['label', { label: 'Heart rate taken' }, true],
      ['no text at all', {}, false],
    ])(
      'detects verbalization from the log entry %s',
      (_name, entry: Record<string, string>, verbalized) => {
        const blocks = [
          { id: 'h', label: 'HR', sourceId: 'vitals.heartrate', start: 0, duration: 2 },
        ];
        const summary = { vitals: { 'Heart Rate': [{ elapsedSeconds: 50 }] } };

        const result = computeTimelineAnalysis([], blocks, undefined, fmt, summary, [entry]);

        expect(result).toEqual({
          completedBlocks: ['HR'],
          missedBlocks: [],
          timingDetails: [
            {
              blockLabel: 'HR',
              blockId: 'h',
              sourceId: 'vitals.heartrate',
              expectedStartSeconds: 0,
              expectedEndSeconds: 120,
              expectedStartFormatted: '0:00',
              expectedEndFormatted: '2:00',
              actualTimeSeconds: 50,
              actualTimeFormatted: '0:50',
              withinTimeWindow: true,
              status: 'Completed on time',
              completed: true,
              completionSource: verbalized ? 'summary-verbalized' : 'summary',
              ...(verbalized ? { verbalized: true } : {}),
              prerequisites: [],
              followups: [],
              prerequisitesMet: true,
              followupsCorrect: true,
            },
          ],
          completionRate: 100,
          timingComplianceRate: 100,
          sequenceComplianceRate: 100,
          sequenceViolations: [],
          patientDataBlocks: [],
        });
      },
    );
  });

  describe('PPE blocks', () => {
    it('matches don and doff entries and assigns repeated hand hygiene in chain order', () => {
      const blocks = [
        { id: 'd', label: 'Doff Gown', sourceId: 'ppe.gown', start: 7, duration: 2 },
        { id: 'h2', label: 'Hand Hygiene', sourceId: 'ppe.handHygiene', start: 6, duration: 2 },
        { id: 'g', label: 'Don Gown', sourceId: 'ppe.gown', start: 2, duration: 2 },
        { id: 'h1', label: 'Hand Hygiene', sourceId: 'ppe.handHygiene', start: 0, duration: 2 },
      ];
      const tracker = {
        actionLog: [
          { label: 'Hand hygiene performed', elapsedSeconds: 30 },
          { label: 'Gown donned', elapsedSeconds: 150 },
          { label: 'Hand hygiene performed', elapsedSeconds: 400 },
          { label: 'Gown doffed', elapsedSeconds: 450 },
        ],
      };

      const result = computeTimelineAnalysis([], blocks, undefined, fmt, undefined, tracker, [
        'h1',
        'g',
        'h2',
        'd',
      ]);

      const ppeDetail = (
        id: string,
        label: string,
        sourceId: string,
        start: number,
        end: number,
        actual: number,
        pre: string[],
        follow: string[],
      ) => ({
        blockLabel: label,
        blockId: id,
        sourceId,
        expectedStartSeconds: start,
        expectedEndSeconds: end,
        expectedStartFormatted: fmt(start),
        expectedEndFormatted: fmt(end),
        actualTimeSeconds: actual,
        actualTimeFormatted: fmt(actual),
        withinTimeWindow: true,
        status: 'Completed on time',
        completed: true,
        completionSource: 'ppe',
        prerequisites: pre,
        followups: follow,
        prerequisitesMet: true,
        followupsCorrect: true,
      });
      expect(result).toEqual({
        completedBlocks: ['Hand Hygiene', 'Don Gown', 'Hand Hygiene', 'Doff Gown'],
        missedBlocks: [],
        timingDetails: [
          ppeDetail('h1', 'Hand Hygiene', 'ppe.handHygiene', 0, 120, 30, [], ['g']),
          ppeDetail('g', 'Don Gown', 'ppe.gown', 120, 240, 150, ['h1'], ['h2']),
          ppeDetail('h2', 'Hand Hygiene', 'ppe.handHygiene', 360, 480, 400, ['g'], ['d']),
          ppeDetail('d', 'Doff Gown', 'ppe.gown', 420, 540, 450, ['h2'], []),
        ],
        completionRate: 100,
        timingComplianceRate: 100,
        sequenceComplianceRate: 100,
        sequenceViolations: [],
        patientDataBlocks: [],
      });
    });

    it('prefers the entry at or after the prerequisite completion time (log passed as a plain array)', () => {
      const blocks = [
        { id: 'g', label: 'Don Gown', sourceId: 'ppe.gown', start: 3, duration: 2 },
        { id: 'h', label: 'Hand Hygiene', sourceId: 'ppe.handHygiene', start: 5, duration: 2 },
      ];
      const log = [
        { label: 'Hand hygiene performed', elapsedSeconds: 20 },
        { label: 'Hand hygiene performed', elapsedSeconds: 300 },
        { label: 'Gown donned', elapsedSeconds: 200 },
      ];

      const result = computeTimelineAnalysis([], blocks, undefined, fmt, undefined, log, [
        'g',
        'h',
      ]);

      expect(result).toEqual({
        completedBlocks: ['Don Gown', 'Hand Hygiene'],
        missedBlocks: [],
        timingDetails: [
          {
            blockLabel: 'Don Gown',
            blockId: 'g',
            sourceId: 'ppe.gown',
            expectedStartSeconds: 180,
            expectedEndSeconds: 300,
            expectedStartFormatted: '3:00',
            expectedEndFormatted: '5:00',
            actualTimeSeconds: 200,
            actualTimeFormatted: '3:20',
            withinTimeWindow: true,
            status: 'Completed on time',
            completed: true,
            completionSource: 'ppe',
            prerequisites: [],
            followups: ['h'],
            prerequisitesMet: true,
            followupsCorrect: true,
          },
          {
            blockLabel: 'Hand Hygiene',
            blockId: 'h',
            sourceId: 'ppe.handHygiene',
            expectedStartSeconds: 300,
            expectedEndSeconds: 420,
            expectedStartFormatted: '5:00',
            expectedEndFormatted: '7:00',
            actualTimeSeconds: 300,
            actualTimeFormatted: '5:00',
            withinTimeWindow: true,
            status: 'Completed on time',
            completed: true,
            completionSource: 'ppe',
            prerequisites: ['g'],
            followups: [],
            prerequisitesMet: true,
            followupsCorrect: true,
          },
        ],
        completionRate: 100,
        timingComplianceRate: 100,
        sequenceComplianceRate: 100,
        sequenceViolations: [],
        patientDataBlocks: [],
      });
    });

    it('falls back to the earliest entry when none is at or after the prerequisite, producing chain, prerequisite-order and followup-order violations', () => {
      const blocks = [
        { id: 'g', label: 'Don Gown', sourceId: 'ppe.gown', start: 3, duration: 2 },
        { id: 'h', label: 'Hand Hygiene', sourceId: 'ppe.handHygiene', start: 5, duration: 2 },
      ];
      const tracker = {
        actionLog: [
          { label: 'Hand hygiene performed', elapsedSeconds: 20 },
          { label: 'Gown donned', elapsedSeconds: 200 },
        ],
      };

      const result = computeTimelineAnalysis([], blocks, undefined, fmt, undefined, tracker, [
        'g',
        'h',
      ]);

      // NOTE: sequenceComplianceRate is negative ((1 - 3) / 1 * 100) — pinned as current behaviour.
      expect(result).toEqual({
        completedBlocks: ['Don Gown'],
        missedBlocks: [],
        timingDetails: [
          {
            blockLabel: 'Don Gown',
            blockId: 'g',
            sourceId: 'ppe.gown',
            expectedStartSeconds: 180,
            expectedEndSeconds: 300,
            expectedStartFormatted: '3:00',
            expectedEndFormatted: '5:00',
            actualTimeSeconds: 200,
            actualTimeFormatted: '3:20',
            withinTimeWindow: true,
            status: 'Completed on time',
            completed: true,
            completionSource: 'ppe',
            prerequisites: [],
            followups: ['h'],
            prerequisitesMet: true,
            followupsCorrect: false,
          },
          {
            blockLabel: 'Hand Hygiene',
            blockId: 'h',
            sourceId: 'ppe.handHygiene',
            expectedStartSeconds: 300,
            expectedEndSeconds: 420,
            expectedStartFormatted: '5:00',
            expectedEndFormatted: '7:00',
            actualTimeSeconds: 20,
            actualTimeFormatted: '0:20',
            withinTimeWindow: false,
            status: 'Completed too early',
            completed: true,
            completionSource: 'ppe',
            prerequisites: ['g'],
            followups: [],
            prerequisitesMet: false,
            followupsCorrect: true,
          },
        ],
        completionRate: 50,
        timingComplianceRate: 50,
        sequenceComplianceRate: -200,
        sequenceViolations: [
          {
            blockId: 'h',
            blockLabel: 'Hand Hygiene',
            type: 'sequence_chain_violation',
            message: 'Completed out of sequence (before Don Gown)',
            expectedAfter: 'g',
            expectedAfterLabel: 'Don Gown',
            expectedTime: 200,
            actualTime: 20,
          },
          {
            blockId: 'g',
            blockLabel: 'Don Gown',
            type: 'followup_order_violation',
            followupId: 'h',
            followupLabel: 'Hand Hygiene',
            message: 'Followup block completed before this block',
            expectedTime: 200,
            actualTime: 20,
          },
          {
            blockId: 'h',
            blockLabel: 'Hand Hygiene',
            type: 'prerequisite_order_violation',
            prereqId: 'g',
            prereqLabel: 'Don Gown',
            message: 'Completed before prerequisite block',
            expectedTime: 200,
            actualTime: 20,
          },
        ],
        patientDataBlocks: [],
      });
    });

    it('consumes a matched PPE entry that has no timing reference without completing the block', () => {
      const blocks = [{ id: 'g', label: 'Don Gown', sourceId: 'ppe.gown', start: 0, duration: 2 }];
      const tracker = { actionLog: [{ label: 'Gown donned' }] };

      const result = computeTimelineAnalysis([], blocks, undefined, fmt, undefined, tracker);

      expect(result).toEqual({
        completedBlocks: [],
        missedBlocks: ['Don Gown'],
        timingDetails: [
          {
            blockLabel: 'Don Gown',
            blockId: 'g',
            sourceId: 'ppe.gown',
            completed: false,
            status: 'Not completed',
            prerequisites: [],
            followups: [],
          },
        ],
        completionRate: 0,
        timingComplianceRate: 0,
        sequenceComplianceRate: 100,
        sequenceViolations: [],
        patientDataBlocks: [],
      });
    });
  });

  describe('patient data blocks', () => {
    it('defers patient blocks to AI analysis and skips patient prerequisites in sequence validation', () => {
      const blocks = [
        {
          id: 'pd1',
          title: 'Ask Allergies',
          sourceId: 'Patient.Allergies',
          start: 1,
          duration: 2,
          prerequisites: ['e1'],
        },
        {
          id: 'e1',
          label: 'Examine',
          sourceId: 'action.exam',
          start: 0,
          duration: 5,
          prerequisites: ['pd1'],
        },
      ];
      const actions = [{ title: 'Examine', elapsedSeconds: 100 }];

      const result = computeTimelineAnalysis(actions, blocks, undefined, fmt);

      expect(result).toEqual({
        completedBlocks: ['Examine'],
        missedBlocks: [],
        timingDetails: [
          {
            blockLabel: 'Examine',
            blockId: 'e1',
            sourceId: 'action.exam',
            expectedStartSeconds: 0,
            expectedEndSeconds: 300,
            expectedStartFormatted: '0:00',
            expectedEndFormatted: '5:00',
            actualTimeSeconds: 100,
            actualTimeFormatted: '1:40',
            withinTimeWindow: true,
            status: 'Completed on time',
            completed: true,
            completionSource: 'action',
            prerequisites: ['pd1'],
            followups: [],
            prerequisitesMet: true,
            followupsCorrect: true,
          },
          {
            blockLabel: 'Ask Allergies',
            blockId: 'pd1',
            sourceId: 'Patient.Allergies',
            completed: false,
            status: 'Pending AI Analysis',
            requiresAIAnalysis: true,
            prerequisites: ['e1'],
            followups: [],
          },
        ],
        completionRate: 50,
        timingComplianceRate: 100,
        sequenceComplianceRate: 100,
        sequenceViolations: [],
        patientDataBlocks: [
          {
            blockLabel: 'Ask Allergies',
            blockId: 'pd1',
            sourceId: 'Patient.Allergies',
            patientField: 'allergies',
            expectedStartSeconds: 60,
            expectedEndSeconds: 180,
            prerequisites: ['e1'],
            followups: [],
            block: {
              id: 'pd1',
              title: 'Ask Allergies',
              sourceId: 'Patient.Allergies',
              start: 1,
              duration: 2,
              prerequisites: ['e1'],
              followups: [],
            },
          },
        ],
      });
    });
  });

  describe('sequence chain', () => {
    const actionBlock = (
      id: string,
      label: string,
      extra: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
      id,
      label,
      sourceId: `action.${label.toLowerCase()}`,
      start: 0,
      duration: 10,
      ...extra,
    });
    const doneDetail = (
      id: string,
      label: string,
      actual: number,
      pre: string[],
      follow: string[],
    ) => ({
      blockLabel: label,
      blockId: id,
      sourceId: `action.${label.toLowerCase()}`,
      expectedStartSeconds: 0,
      expectedEndSeconds: 600,
      expectedStartFormatted: '0:00',
      expectedEndFormatted: '10:00',
      actualTimeSeconds: actual,
      actualTimeFormatted: fmt(actual),
      withinTimeWindow: true,
      status: 'Completed on time',
      completed: true,
      completionSource: 'action',
      prerequisites: pre,
      followups: follow,
      prerequisitesMet: true,
      followupsCorrect: true,
    });

    it('replaces prerequisites and followups of chained blocks and leaves other blocks alone', () => {
      const blocks = [
        actionBlock('c1', 'First', { prerequisites: ['stale'], followups: ['stale2'] }),
        actionBlock('c2', 'Second', { prerequisites: ['stale'], followups: ['stale3'] }),
        actionBlock('c3', 'Third'),
        actionBlock('x', 'Outside', { prerequisites: ['c1'] }),
      ];
      const actions = [
        { title: 'First', elapsedSeconds: 10 },
        { title: 'Second', elapsedSeconds: 20 },
        { title: 'Third', elapsedSeconds: 30 },
        { title: 'Outside', elapsedSeconds: 40 },
      ];

      const result = computeTimelineAnalysis(
        actions,
        blocks,
        undefined,
        fmt,
        undefined,
        undefined,
        ['c1', 'c2', 'c3'],
      );

      expect(result).toEqual({
        completedBlocks: ['First', 'Second', 'Third', 'Outside'],
        missedBlocks: [],
        timingDetails: [
          doneDetail('c1', 'First', 10, [], ['c2']),
          doneDetail('c2', 'Second', 20, ['c1'], ['c3']),
          doneDetail('c3', 'Third', 30, ['c2'], []),
          doneDetail('x', 'Outside', 40, ['c1'], []),
        ],
        completionRate: 100,
        timingComplianceRate: 100,
        sequenceComplianceRate: 100,
        sequenceViolations: [],
        patientDataBlocks: [],
      });
    });

    it('reads the chain from a block when none is passed', () => {
      const blocks = [
        actionBlock('f1', 'Alpha'),
        actionBlock('f2', 'Beta', { sequenceChain: ['f1', 'f2'] }),
      ];
      const actions = [
        { title: 'Alpha', elapsedSeconds: 10 },
        { title: 'Beta', elapsedSeconds: 20 },
      ];

      const result = computeTimelineAnalysis(actions, blocks, undefined, fmt);

      expect(result).toEqual({
        completedBlocks: ['Alpha', 'Beta'],
        missedBlocks: [],
        timingDetails: [
          doneDetail('f1', 'Alpha', 10, [], ['f2']),
          doneDetail('f2', 'Beta', 20, ['f1'], []),
        ],
        completionRate: 100,
        timingComplianceRate: 100,
        sequenceComplianceRate: 100,
        sequenceViolations: [],
        patientDataBlocks: [],
      });
    });

    it('lets a passed chain win over a chain stored on a block', () => {
      const blocks = [
        actionBlock('f1', 'Alpha', { sequenceChain: ['f2', 'f1'] }),
        actionBlock('f2', 'Beta'),
      ];
      const actions = [
        { title: 'Alpha', elapsedSeconds: 10 },
        { title: 'Beta', elapsedSeconds: 20 },
      ];

      const result = computeTimelineAnalysis(
        actions,
        blocks,
        undefined,
        fmt,
        undefined,
        undefined,
        ['f1', 'f2'],
      );

      expect(result).toEqual({
        completedBlocks: ['Alpha', 'Beta'],
        missedBlocks: [],
        timingDetails: [
          doneDetail('f1', 'Alpha', 10, [], ['f2']),
          doneDetail('f2', 'Beta', 20, ['f1'], []),
        ],
        completionRate: 100,
        timingComplianceRate: 100,
        sequenceComplianceRate: 100,
        sequenceViolations: [],
        patientDataBlocks: [],
      });
    });
  });

  describe('missing prerequisite / followup violations', () => {
    it('reports missing prerequisites (deduplicated, known and unknown ids) and a missing followup', () => {
      const blocks = [
        {
          id: 'm1',
          label: 'Main Step',
          sourceId: 'action.main',
          start: 0,
          duration: 10,
          prerequisites: ['m0', 'm0', 'ghost'],
          followups: ['m2'],
        },
        { id: 'm0', label: 'Missed Prereq', sourceId: 'action.m0', start: 0, duration: 10 },
        { id: 'm2', title: 'Missed Followup', sourceId: 'action.m2', start: 0, duration: 10 },
      ];
      const actions = [{ title: 'Main Step', elapsedSeconds: 100 }];

      const result = computeTimelineAnalysis(actions, blocks, undefined, fmt);

      // NOTE: sequenceComplianceRate is negative ((1 - 3) / 1 * 100) — pinned as current behaviour.
      expect(result).toEqual({
        completedBlocks: ['Main Step'],
        missedBlocks: ['Missed Prereq', 'Missed Followup'],
        timingDetails: [
          {
            blockLabel: 'Main Step',
            blockId: 'm1',
            sourceId: 'action.main',
            expectedStartSeconds: 0,
            expectedEndSeconds: 600,
            expectedStartFormatted: '0:00',
            expectedEndFormatted: '10:00',
            actualTimeSeconds: 100,
            actualTimeFormatted: '1:40',
            withinTimeWindow: true,
            status: 'Completed on time',
            completed: true,
            completionSource: 'action',
            prerequisites: ['m0', 'm0', 'ghost'],
            followups: ['m2'],
            prerequisitesMet: false,
            followupsCorrect: false,
          },
          {
            blockLabel: 'Missed Prereq',
            blockId: 'm0',
            sourceId: 'action.m0',
            completed: false,
            status: 'Not completed',
            prerequisites: [],
            followups: [],
          },
          {
            blockLabel: 'Missed Followup',
            blockId: 'm2',
            sourceId: 'action.m2',
            completed: false,
            status: 'Not completed',
            prerequisites: [],
            followups: [],
          },
        ],
        completionRate: 33,
        timingComplianceRate: 33,
        sequenceComplianceRate: -200,
        sequenceViolations: [
          {
            blockId: 'm1',
            blockLabel: 'Main Step',
            type: 'missing_prerequisite',
            prereqId: 'm0',
            prereqLabel: 'Missed Prereq',
            message: 'Completed without prerequisite block',
          },
          {
            blockId: 'm1',
            blockLabel: 'Main Step',
            type: 'missing_prerequisite',
            prereqId: 'ghost',
            prereqLabel: 'ghost',
            message: 'Completed without prerequisite block',
          },
          {
            blockId: 'm1',
            blockLabel: 'Main Step',
            type: 'missing_followup',
            followupId: 'm2',
            followupLabel: 'Missed Followup',
            message: 'Followup block was not completed',
          },
        ],
        patientDataBlocks: [],
      });
    });
  });

  describe('defaults and optional inputs', () => {
    const emptyResult = {
      completedBlocks: [],
      missedBlocks: [],
      timingDetails: [],
      completionRate: 0,
      timingComplianceRate: 0,
      sequenceComplianceRate: 100,
      sequenceViolations: [],
      patientDataBlocks: [],
    };

    it('misses ppe, vital and vitals blocks when the tracker and summary are omitted or empty', () => {
      const blocks = [
        { id: 'p', label: 'Don Gown', sourceId: 'ppe.gown', start: 0, duration: 2 },
        { id: 'v', label: 'Rec HR', sourceId: 'vital.a.heartRate', start: 0, duration: 2 },
        { id: 'w', label: 'HR Check', sourceId: 'vitals.heartrate', start: 0, duration: 2 },
      ];
      const missed = (id: string, label: string, sourceId: string) => ({
        blockLabel: label,
        blockId: id,
        sourceId,
        completed: false,
        status: 'Not completed',
        prerequisites: [],
        followups: [],
      });
      const expected = {
        completedBlocks: [],
        missedBlocks: ['Don Gown', 'Rec HR', 'HR Check'],
        timingDetails: [
          missed('p', 'Don Gown', 'ppe.gown'),
          missed('v', 'Rec HR', 'vital.a.heartRate'),
          missed('w', 'HR Check', 'vitals.heartrate'),
        ],
        completionRate: 0,
        timingComplianceRate: 0,
        sequenceComplianceRate: 100,
        sequenceViolations: [],
        patientDataBlocks: [],
      };

      expect(computeTimelineAnalysis([], blocks)).toEqual(expected);
      expect(computeTimelineAnalysis([], blocks, undefined, fmt, {}, {}, [])).toEqual(expected);
    });

    it('ignores a chain of length one and an empty chain stored on a block', () => {
      const blocks = [
        {
          id: 'solo',
          label: 'Alpha',
          sourceId: 'action.alpha',
          start: 0,
          duration: 5,
          prerequisites: ['zz'],
          sequenceChain: [] as string[],
        },
      ];
      const actions = [{ title: 'Alpha', elapsedSeconds: 10 }];
      // NOTE: sequenceComplianceRate is 0 here ((1 - 1) / 1 * 100).
      const expected = {
        completedBlocks: ['Alpha'],
        missedBlocks: [],
        timingDetails: [
          {
            blockLabel: 'Alpha',
            blockId: 'solo',
            sourceId: 'action.alpha',
            expectedStartSeconds: 0,
            expectedEndSeconds: 300,
            expectedStartFormatted: '0:00',
            expectedEndFormatted: '5:00',
            actualTimeSeconds: 10,
            actualTimeFormatted: '0:10',
            withinTimeWindow: true,
            status: 'Completed on time',
            completed: true,
            completionSource: 'action',
            prerequisites: ['zz'],
            followups: [],
            prerequisitesMet: false,
            followupsCorrect: true,
          },
        ],
        completionRate: 100,
        timingComplianceRate: 100,
        sequenceComplianceRate: 0,
        sequenceViolations: [
          {
            blockId: 'solo',
            blockLabel: 'Alpha',
            type: 'missing_prerequisite',
            prereqId: 'zz',
            prereqLabel: 'zz',
            message: 'Completed without prerequisite block',
          },
        ],
        patientDataBlocks: [],
      };

      expect(computeTimelineAnalysis(actions, blocks, undefined, fmt)).toEqual(expected);
      expect(
        computeTimelineAnalysis(actions, blocks, undefined, fmt, undefined, undefined, ['solo']),
      ).toEqual(expected);
    });

    it('returns the empty result for empty inputs', () => {
      expect(computeTimelineAnalysis([], [])).toEqual(emptyResult);
    });

    it('returns the empty result when every optional input is undefined', () => {
      expect(
        computeTimelineAnalysis(
          undefined as never,
          undefined as never,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
        ),
      ).toEqual(emptyResult);
    });

    it('derives elapsed seconds from timestamps against the scenario start time, clamping at zero', () => {
      const blocks = [
        { id: 't1', label: 'Alpha', sourceId: 'action.alpha', start: 0, duration: 5 },
        { id: 't2', label: 'Beta', sourceId: 'action.beta', start: 0, duration: 5 },
        { id: 't3', label: 'Gamma', sourceId: 'action.gamma', start: 0, duration: 5 },
      ];
      const actions = [
        { title: 'Alpha', timestampValue: new Date('2024-01-01T10:01:00Z').getTime() },
        { title: 'Beta', timestamp: '2023-12-31T23:59:00Z' },
        { title: 'Gamma' },
      ];

      const result = computeTimelineAnalysis(actions, blocks, '2024-01-01T10:00:00Z', fmt);

      expect(result).toEqual({
        completedBlocks: ['Alpha', 'Beta', 'Gamma'],
        missedBlocks: [],
        timingDetails: [
          {
            blockLabel: 'Alpha',
            blockId: 't1',
            sourceId: 'action.alpha',
            expectedStartSeconds: 0,
            expectedEndSeconds: 300,
            expectedStartFormatted: '0:00',
            expectedEndFormatted: '5:00',
            actualTimeSeconds: 60,
            actualTimeFormatted: '1:00',
            withinTimeWindow: true,
            status: 'Completed on time',
            completed: true,
            completionSource: 'action',
            prerequisites: [],
            followups: [],
            prerequisitesMet: true,
            followupsCorrect: true,
          },
          {
            blockLabel: 'Beta',
            blockId: 't2',
            sourceId: 'action.beta',
            expectedStartSeconds: 0,
            expectedEndSeconds: 300,
            expectedStartFormatted: '0:00',
            expectedEndFormatted: '5:00',
            actualTimeSeconds: 0,
            actualTimeFormatted: '0:00',
            withinTimeWindow: true,
            status: 'Completed on time',
            completed: true,
            completionSource: 'action',
            prerequisites: [],
            followups: [],
            prerequisitesMet: true,
            followupsCorrect: true,
          },
          {
            blockLabel: 'Gamma',
            blockId: 't3',
            sourceId: 'action.gamma',
            actualTimeSeconds: null,
            status: 'Completed',
            completed: true,
            completionSource: 'action',
            prerequisites: [],
            followups: [],
          },
        ],
        completionRate: 100,
        timingComplianceRate: 100,
        sequenceComplianceRate: 100,
        sequenceViolations: [],
        patientDataBlocks: [],
      });
    });

    it('completes a completion-only block without timing when there is no scenario start time', () => {
      const blocks = [{ id: 'n1', label: 'Alpha', sourceId: 'action.alpha' }];
      const actions = [{ title: 'alpha', timestamp: '2024-01-01T10:01:00Z' }];

      const result = computeTimelineAnalysis(actions, blocks);

      expect(result).toEqual({
        completedBlocks: ['Alpha'],
        missedBlocks: [],
        timingDetails: [
          {
            blockLabel: 'Alpha',
            blockId: 'n1',
            sourceId: 'action.alpha',
            actualTimeSeconds: null,
            status: 'Completed',
            completed: true,
            completionSource: 'action',
            prerequisites: [],
            followups: [],
          },
        ],
        completionRate: 100,
        timingComplianceRate: 100,
        sequenceComplianceRate: 100,
        sequenceViolations: [],
        patientDataBlocks: [],
      });
    });

    it('formats a completion-only block with a time using the default seconds formatter', () => {
      const blocks = [{ id: 'n1', label: 'Alpha', sourceId: 'action.alpha' }];
      const actions = [{ title: 'alpha', elapsedSeconds: 45 }];

      const result = computeTimelineAnalysis(actions, blocks);

      expect(result.timingDetails).toEqual([
        {
          blockLabel: 'Alpha',
          blockId: 'n1',
          sourceId: 'action.alpha',
          actualTimeSeconds: 45,
          actualTimeFormatted: '45s',
          status: 'Completed',
          completed: true,
          completionSource: 'action',
          prerequisites: [],
          followups: [],
          prerequisitesMet: true,
          followupsCorrect: true,
        },
      ]);
    });
  });
});
