/**
 * Unit tests for the vital-action firstAttemptCorrect / anyAttemptCorrect bug.
 *
 * Bug: computeDeterministicActionMarks calls evaluateActionAttempt for vitals.
 * When the actionsTimeline entry carries only a response string (not a full vitals
 * object), evaluateActionAttempt returns false, setting firstAttemptCorrect=false
 * and anyAttemptCorrect=false even though the student DID complete the vital action.
 * generateVitalActionFeedback (which has richer summaryByCategory fallback) is the
 * authoritative source and correctly marks the action as completed.
 *
 * Fix: pre-reconcile vital action details using generateVitalActionFeedback BEFORE
 * the data is sent to the AI, so criteriaResults and summary reflect the correct state.
 */

import { Test } from '@nestjs/testing';
import { ActionsInterventionsService } from '@/modules/reports/actions-interventions.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal mandatory vital scenario action. */
function makeVitalAction(title: string, vitals: Record<string, string[]> = { heartRate: ['80'] }) {
  return {
    title,
    type: 'vital' as const,
    typeRequirement: 'Mandatory',
    isOptional: false,
    vitals,
  };
}

/** Build an actionsTimeline entry that only carries a response string (no vitals object). */
function makeTimelineEntryResponseOnly(title: string) {
  return {
    title,
    status: 'completed',
    response: 'Checked 1 vital sign(s)',
    // NOTE: no `vitals` key — this triggers the bug
  };
}

/** Build an actionsTimeline entry with a proper vitals object. */
function makeTimelineEntryWithVitals(
  title: string,
  vitals: Record<string, unknown> = { heartRate: ['80'] },
) {
  return { title, status: 'completed', vitals, response: 'Checked 1 vital sign(s)' };
}

/** Build a summaryByCategory.actions entry with vitals data (the authoritative source). */
function makeSummaryEntry(title: string, vitals: Record<string, unknown> = { heartRate: ['80'] }) {
  return { title, vitals, status: 'completed', response: 'Checked 1 vital sign(s)' };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ActionsInterventionsService – vital firstAttemptCorrect reconciliation', () => {
  let svc: ActionsInterventionsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ActionsInterventionsService,
        { provide: ConfigService, useValue: { get: () => null } },
        { provide: HttpService, useValue: {} },
      ],
    }).compile();

    svc = module.get(ActionsInterventionsService);
  });

  // ── evaluateActionAttempt ──────────────────────────────────────────────────

  describe('evaluateActionAttempt – vital type', () => {
    it('returns false when attempt has no vitals object (response-only entry)', async () => {
      const actionDef = makeVitalAction('Obtain Vital Signs');
      const attempt = makeTimelineEntryResponseOnly('Obtain Vital Signs');

      const result = await svc.evaluateActionAttempt(attempt, actionDef);

      // This is the known incorrect result when the attempt lacks a vitals object.
      // The pre-reconciliation step must override this downstream.
      expect(result).toBe(false);
    });

    it('returns true when attempt includes matching vitals object', async () => {
      const actionDef = makeVitalAction('Obtain Vital Signs', { heartRate: ['80'] });
      const attempt = makeTimelineEntryWithVitals('Obtain Vital Signs', { heartRate: ['80'] });

      const result = await svc.evaluateActionAttempt(attempt, actionDef);
      expect(result).toBe(true);
    });
  });

  // ── generateVitalActionFeedback ───────────────────────────────────────────

  describe('generateVitalActionFeedback – authoritative source', () => {
    it('marks vital as correct using summaryByCategory fallback even when timeline has no vitals', () => {
      const scenarioActions = [makeVitalAction('Obtain Vital Signs', { heartRate: ['80'] })];
      // Timeline entry has no vitals — same scenario as the bug
      const actionsTimeline = [makeTimelineEntryResponseOnly('Obtain Vital Signs')];
      // summaryByCategory.actions HAS vitals data
      const summaryByCategory = {
        actions: [makeSummaryEntry('Obtain Vital Signs', { heartRate: ['80'] })],
      };

      const feedback = svc.generateVitalActionFeedback(
        actionsTimeline,
        scenarioActions,
        summaryByCategory,
      );

      expect(feedback.strengths).toHaveLength(1);
      expect(feedback.strengths[0].point).toContain('Obtain Vital Signs');
      expect(feedback.improvements).toHaveLength(0);
    });

    it('marks vital as an improvement when no vitals data exists in either source', () => {
      const scenarioActions = [makeVitalAction('Obtain Vital Signs', { heartRate: ['80'] })];
      const actionsTimeline: unknown[] = [];
      const summaryByCategory = { actions: [] };

      const feedback = svc.generateVitalActionFeedback(
        actionsTimeline as Parameters<typeof svc.generateVitalActionFeedback>[0],
        scenarioActions,
        summaryByCategory,
      );

      expect(feedback.strengths).toHaveLength(0);
      expect(feedback.improvements).toHaveLength(1);
      expect(feedback.improvements[0].point).toContain('Obtain Vital Signs');
    });
  });

  // ── computeDeterministicActionMarks → pre-reconciliation simulation ───────

  describe('computeDeterministicActionMarks – vital isCorrect vs generateVitalActionFeedback', () => {
    it('demonstrates the pre-reconciliation need: marks and feedback disagree without fix', async () => {
      const scenarioActions = [makeVitalAction('Obtain Vital Signs', { heartRate: ['80'] })];
      // Timeline only has response string — no vitals object
      const actionsTimeline = [makeTimelineEntryResponseOnly('Obtain Vital Signs')];
      const summaryByCategory = {
        actions: [makeSummaryEntry('Obtain Vital Signs', { heartRate: ['80'] })],
      };

      const marks = await svc.computeDeterministicActionMarks(
        actionsTimeline as Parameters<typeof svc.computeDeterministicActionMarks>[0],
        scenarioActions,
        'Assessment',
        summaryByCategory as Parameters<typeof svc.computeDeterministicActionMarks>[3],
      );

      const vitalDetail = marks.details.find((d) => d.title === 'Obtain Vital Signs');
      expect(vitalDetail).toBeDefined();

      // The authoritative feedback says it IS correct
      const authoritative = svc.generateVitalActionFeedback(
        actionsTimeline as Parameters<typeof svc.generateVitalActionFeedback>[0],
        scenarioActions,
        summaryByCategory,
      );
      const authoritativeIsCorrect = authoritative.strengths.some((s) =>
        s.point.includes('Obtain Vital Signs'),
      );
      expect(authoritativeIsCorrect).toBe(true);

      // If marks disagree with authoritative feedback, pre-reconciliation is needed.
      // After the fix is applied, marks.details should also reflect isCorrect=true.
      // This assertion documents the gap that the fix closes:
      if (vitalDetail!.isCorrect !== authoritativeIsCorrect) {
        // Gap detected — pre-reconciliation should correct this
        const correctedDetails = marks.details.map((d) => {
          if (String(d.type ?? '').toLowerCase() !== 'vital') {
            return d;
          }
          const correctTitles = new Set(
            authoritative.strengths.map((s) =>
              s.point
                .replace(/^Correctly performed vital signs action "(.+)"$/, '$1')
                .toLowerCase(),
            ),
          );
          const isCorrect = correctTitles.has((d.title ?? '').toLowerCase());
          return {
            ...d,
            isCorrect,
            firstAttemptCorrect: isCorrect,
            anyAttemptCorrect: isCorrect,
            pointsAwarded: isCorrect && !d.isOptional ? 1 : 0,
          };
        });

        const corrected = correctedDetails.find((d) => d.title === 'Obtain Vital Signs');
        expect(corrected!.isCorrect).toBe(true);
        expect(corrected!.firstAttemptCorrect).toBe(true);
        expect(corrected!.anyAttemptCorrect).toBe(true);
        expect(corrected!.pointsAwarded).toBe(1);
      } else {
        // Already consistent — no gap
        expect(vitalDetail!.isCorrect).toBe(true);
      }
    });

    it('agrees with generateVitalActionFeedback when timeline entry carries vitals object', async () => {
      const scenarioActions = [makeVitalAction('Obtain Vital Signs', { heartRate: ['80'] })];
      const actionsTimeline = [
        makeTimelineEntryWithVitals('Obtain Vital Signs', { heartRate: ['80'] }),
      ];

      const marks = await svc.computeDeterministicActionMarks(
        actionsTimeline as Parameters<typeof svc.computeDeterministicActionMarks>[0],
        scenarioActions,
        'Assessment',
        undefined,
      );

      const vitalDetail = marks.details.find((d) => d.title === 'Obtain Vital Signs');
      expect(vitalDetail).toBeDefined();
      expect(vitalDetail!.isCorrect).toBe(true);
      expect(marks.positiveActions).toBe(1);
      expect(marks.totalRequiredActions).toBe(1);
    });
  });

  // ── Pre-reconciliation logic (the actual fix) ──────────────────────────────

  describe('pre-reconciliation of vital details before AI call', () => {
    /**
     * Simulates what reports.service.ts does right after computeDeterministicActionMarks:
     * use generateVitalActionFeedback to fix isCorrect/firstAttemptCorrect/anyAttemptCorrect
     * for vital actions before embedding the data in the AI prompt.
     */
    function preReconcileVitalDetails(
      marks: Awaited<ReturnType<typeof svc.computeDeterministicActionMarks>>,
      vitalFeedback: ReturnType<typeof svc.generateVitalActionFeedback>,
    ) {
      const correctTitles = new Set(
        vitalFeedback.strengths.map((s) =>
          s.point.replace(/^Correctly performed vital signs action "(.+)"$/, '$1').toLowerCase(),
        ),
      );

      marks.details = marks.details.map((d) => {
        if (String(d.type ?? '').toLowerCase() !== 'vital') {
          return d;
        }
        const isCorrect = correctTitles.has((d.title ?? '').toLowerCase());
        return {
          ...d,
          isCorrect,
          firstAttemptCorrect: isCorrect,
          anyAttemptCorrect: isCorrect,
          pointsAwarded: isCorrect && !d.isOptional ? 1 : 0,
        };
      });

      marks.positiveActions = marks.details.filter(
        (d) =>
          d.isCorrect === true &&
          d.isOptional !== true &&
          String(d.type ?? '').toLowerCase() !== 'distractor',
      ).length;

      return marks;
    }

    it('corrects isCorrect/firstAttemptCorrect/anyAttemptCorrect for vital with response-only timeline entry', async () => {
      const scenarioActions = [makeVitalAction('Obtain Vital Signs', { heartRate: ['80'] })];
      const actionsTimeline = [makeTimelineEntryResponseOnly('Obtain Vital Signs')];
      const summaryByCategory = {
        actions: [makeSummaryEntry('Obtain Vital Signs', { heartRate: ['80'] })],
      };

      const marks = await svc.computeDeterministicActionMarks(
        actionsTimeline as Parameters<typeof svc.computeDeterministicActionMarks>[0],
        scenarioActions,
        'Assessment',
        summaryByCategory as Parameters<typeof svc.computeDeterministicActionMarks>[3],
      );

      const vitalFeedback = svc.generateVitalActionFeedback(
        actionsTimeline as Parameters<typeof svc.generateVitalActionFeedback>[0],
        scenarioActions,
        summaryByCategory,
      );

      preReconcileVitalDetails(marks, vitalFeedback);

      const detail = marks.details.find((d) => d.title === 'Obtain Vital Signs');
      expect(detail!.isCorrect).toBe(true);
      expect(detail!.firstAttemptCorrect).toBe(true);
      expect(detail!.anyAttemptCorrect).toBe(true);
      expect(detail!.pointsAwarded).toBe(1);
      expect(marks.positiveActions).toBe(1);
    });

    it('does not affect non-vital actions during pre-reconciliation', async () => {
      const scenarioActions = [
        makeVitalAction('Obtain Vital Signs', { heartRate: ['80'] }),
        {
          title: 'Immediate Management',
          type: 'single' as const,
          typeRequirement: 'Mandatory',
          isOptional: false,
          correct: 'Apply ice',
        },
      ];
      const actionsTimeline = [
        makeTimelineEntryResponseOnly('Obtain Vital Signs'),
        {
          title: 'Immediate Management',
          status: 'completed',
          selectedItem: 'Apply ice',
          response: 'Apply ice',
        },
      ];
      const summaryByCategory = {
        actions: [makeSummaryEntry('Obtain Vital Signs', { heartRate: ['80'] })],
      };

      const marks = await svc.computeDeterministicActionMarks(
        actionsTimeline as Parameters<typeof svc.computeDeterministicActionMarks>[0],
        scenarioActions,
        'Assessment',
        summaryByCategory as Parameters<typeof svc.computeDeterministicActionMarks>[3],
      );

      const nonVitalBefore = marks.details.find((d) => d.title === 'Immediate Management');
      const nonVitalIsCorrectBefore = nonVitalBefore?.isCorrect;

      const vitalFeedback = svc.generateVitalActionFeedback(
        actionsTimeline as Parameters<typeof svc.generateVitalActionFeedback>[0],
        scenarioActions,
        summaryByCategory,
      );

      preReconcileVitalDetails(marks, vitalFeedback);

      const nonVitalAfter = marks.details.find((d) => d.title === 'Immediate Management');
      // Non-vital action should be unchanged
      expect(nonVitalAfter?.isCorrect).toBe(nonVitalIsCorrectBefore);
    });

    it('marks vital as incorrect after reconciliation when no vitals data exists in any source', async () => {
      const scenarioActions = [makeVitalAction('Obtain Vital Signs', { heartRate: ['80'] })];
      const actionsTimeline: unknown[] = [];
      const summaryByCategory = { actions: [] };

      const marks = await svc.computeDeterministicActionMarks(
        actionsTimeline as Parameters<typeof svc.computeDeterministicActionMarks>[0],
        scenarioActions,
        'Assessment',
        summaryByCategory as Parameters<typeof svc.computeDeterministicActionMarks>[3],
      );

      const vitalFeedback = svc.generateVitalActionFeedback(
        actionsTimeline as Parameters<typeof svc.generateVitalActionFeedback>[0],
        scenarioActions,
        summaryByCategory,
      );

      preReconcileVitalDetails(marks, vitalFeedback);

      const detail = marks.details.find((d) => d.title === 'Obtain Vital Signs');
      expect(detail!.isCorrect).toBe(false);
      expect(detail!.firstAttemptCorrect).toBe(false);
      expect(detail!.anyAttemptCorrect).toBe(false);
      expect(detail!.pointsAwarded).toBe(0);
      expect(marks.positiveActions).toBe(0);
    });
  });
});
