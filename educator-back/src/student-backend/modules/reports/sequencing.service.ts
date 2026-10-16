import { Injectable } from '@nestjs/common';

import { AiMessageRole } from '../../../common/constants';
import { AiGateway, type AiQuestionMatchingEvaluation } from '../../../common/interfaces';
import { LoggerService } from '../../../common/services';

import {
  type Scenario,
  type SequenceAssessmentMethod,
  type SequenceGroupDefinition,
  type SequenceItem,
} from 'src/common/interfaces/student-scenario.interface';

import { ActionsInterventionsService } from './actions-interventions.service';
import { type StudentSummary } from './timeline-timing.service';

const SEQUENCING_AI_TEMPERATURE = 0.2;
const SEQUENCING_AI_MAX_TOKENS = 2000;
// Tolerance for same-second events: elapsedSeconds is truncated to whole seconds
// while timestampValue has ms precision. Events within the same second (< 1000ms apart)
// should be treated as tied in order — matching the transcript UI's second-level display.
const SAME_SECOND_TOLERANCE_MS = 1000;

export interface TranscriptMessage {
  speaker?: string;
  text?: string;
  timestamp?: string;
  timestampValue?: number;
  elapsedSeconds?: number;
  [key: string]: unknown;
}
export interface SequencingEnrichedEntry {
  elapsedSeconds?: number;
  elapsedTimeFormatted: string;
  speaker?: string;
  text?: string;
  timestampValue?: number;
  timestamp?: string;
  [key: string]: unknown;
}
export interface SequencingResolvedEvent {
  ref: string;
  completed: boolean;
  completedAtSeconds?: number;
  orderValue?: number;
  source: 'transcript' | 'fieldUpdate' | 'actionTimeline' | 'none';
  evidence?: string;
  selectedEventId?: string;
  selectedEventTitle?: string;
}
export interface EventInstance {
  instanceId: string;
  ref: string;
  elapsedSeconds?: number;
  orderValue?: number;
  source: 'transcript' | 'fieldUpdate' | 'actionTimeline';
  evidence?: string;
  title?: string;
  originalId?: string;
}
export interface GroupScoringResult {
  id: string;
  label: string;
  type: 'overall' | 'group' | 'subgroup' | 'timing';
  passed: boolean;
  failedReasons: string[];
  studentPerformance?: string;
  rationale?: string;
}
export interface ConfigurationMatch {
  parentInstance: EventInstance;
  beforeInstances: EventInstance[];
  afterInstances: EventInstance[];
  allInstanceIds: string[];
}
export interface ConfigurationMatchFailure {
  reason:
    | 'parent_not_found'
    | 'parent_consumed'
    | 'before_item_missing'
    | 'after_item_missing'
    | 'ai_question_not_asked';
  failedRef?: string;
  failedLabel?: string;
  details?: string;
  consumeParentInstanceId?: string;
}
export interface SequencingParentResult {
  parentRef: string;
  parentLabel?: string;
  passed: boolean;
  assessmentPassed: boolean;
  beforePassed: boolean;
  afterPassed: boolean;
  orderPassed: boolean;
  timingPassed: boolean;
  afterTimingPassed?: boolean;
  failedReasons: string[];
  detailedContext?: {
    parentCompleted: boolean;
    parentCompletedAt?: string;
    beforeItems?: Array<{
      ref: string;
      label: string;
      completed: boolean;
      completedAt?: string;
      status: 'completed_on_time' | 'completed_late' | 'completed_early' | 'not_completed';
      issue?: string;
    }>;
    afterItems?: Array<{
      ref: string;
      label: string;
      completed: boolean;
      completedAt?: string;
      status: 'completed_on_time' | 'completed_late' | 'completed_early' | 'not_completed';
      issue?: string;
    }>;
    timingWindow?: {
      threshold: number;
      thresholdFormatted: string;
      allBeforeItemsInWindow: boolean;
      outOfWindowItems?: Array<{ ref: string; label: string; completedAt: string }>;
    };
    afterTimingWindow?: {
      threshold: number;
      thresholdFormatted: string;
      allAfterItemsInWindow: boolean;
      outOfWindowItems?: Array<{ ref: string; label: string; completedAt: string }>;
    };
  };
}
export interface SequencingEvaluationResult {
  score: number | null;
  summary: string;
  strengths: Array<{ point: string; example: string }>;
  weaknesses: Array<{ point: string; example: string }>;
  recommendations: string[];
  parentResults: SequencingParentResult[];
  groupResults?: GroupScoringResult[];
}

function getItemId(item: string | SequenceItem): string {
  return typeof item === 'string' ? item : item.id;
}
interface ResolvedGroupItem {
  ref: string;
  label: string;
  completed: boolean;
  completedAtSeconds?: number;
  orderValue?: number;
  instance?: EventInstance;
}

@Injectable()
export class SequencingService {
  constructor(
    private readonly aiGateway: AiGateway,
    private readonly actionsService: ActionsInterventionsService,
    private readonly logger: LoggerService,
  ) {}

  async evaluateSequencingPrioritization(
    scenario: Scenario | undefined,
    transcriptMessages: TranscriptMessage[],
    studentSummary: StudentSummary | undefined,
    summaryEntries: Array<Record<string, unknown>> | undefined,
    actionsTimeline: SequencingEnrichedEntry[] | undefined,
    scenarioStartTime?: string,
  ): Promise<SequencingEvaluationResult> {
    const sequenceGroups: SequenceGroupDefinition[] =
      ((scenario as unknown as Record<string, unknown>)
        ?.sequenceGroups as SequenceGroupDefinition[]) ?? [];
    const sequenceGroupsOrderMode: 'strict' | 'flexible' =
      ((scenario as unknown as Record<string, unknown>)?.sequenceGroupsOrderMode as
        'strict' | 'flexible') ?? 'strict';
    if (sequenceGroups.length === 0) {
      return {
        score: null,
        summary: 'No sequence groups configured for this scenario.',
        strengths: [],
        weaknesses: [],
        recommendations: ['None identified.'],
        parentResults: [],
        groupResults: [],
      };
    }
    const scenarioStartMs =
      typeof scenarioStartTime === 'string' && scenarioStartTime.trim().length > 0
        ? new Date(scenarioStartTime).getTime()
        : undefined;
    const studentMessages = transcriptMessages
      .filter((msg) => String(msg.speaker ?? '').toLowerCase() === 'student')
      .map((msg) => ({
        text: String(msg.text ?? '').trim(),
        elapsedSeconds: this.resolveElapsedSeconds(msg, scenarioStartMs),
        orderValue: this.resolveOrderValue(msg, scenarioStartMs),
      }))
      .filter((msg) => msg.text.length > 0)
      .sort(
        (a, b) =>
          (a.orderValue ?? Number.MAX_SAFE_INTEGER) - (b.orderValue ?? Number.MAX_SAFE_INTEGER),
      );
    const fieldEntries = this.collectFieldUpdateEntries(
      studentSummary,
      scenarioStartMs,
      summaryEntries,
    );
    const actionAttempts = this.collectActionAttempts(
      actionsTimeline,
      studentSummary,
      scenarioStartMs,
    );
    const questionAskedRequirements = this.collectQuestionAskedRequirementsFromGroups(
      scenario,
      sequenceGroups,
    );
    const aiEvaluationResults = await this.batchEvaluateQuestionAskedWithAI(
      questionAskedRequirements,
      studentMessages,
      scenario,
    );
    const allEventInstances = this.createEventInstances(
      studentMessages,
      fieldEntries,
      actionAttempts,
      scenario,
      aiEvaluationResults,
    );

    // Build set of all configured refs from sequencing groups
    const configuredRefs = new Set<string>();
    for (const group of sequenceGroups) {
      const refs = this.getAllItemRefsFromGroup(group);
      for (const ref of refs) {
        configuredRefs.add(ref);
      }
    }

    // Keep ALL event instances for overall sequence checking
    // Filter configured instances for item resolution and sorting to avoid consuming non-configured actions
    const filteredEventInstances = allEventInstances.filter((inst) => configuredRefs.has(inst.ref));

    this.logger.log(
      `[SEQ_GROUPS] Starting group-based evaluation with ${sequenceGroups.length} groups, mode: ${sequenceGroupsOrderMode}, total instances: ${allEventInstances.length}, configured refs: ${configuredRefs.size}`,
    );

    // Identify which refs appear in multiple groups
    const allRefs = new Map<string, number>(); // ref -> count
    for (const group of sequenceGroups) {
      const refs = this.getAllItemRefsFromGroup(group);
      for (const ref of refs) {
        allRefs.set(ref, (allRefs.get(ref) ?? 0) + 1);
      }
    }

    // Check if we have enough instances for refs that appear in multiple groups
    for (const [ref, expectedCount] of allRefs.entries()) {
      if (expectedCount > 1) {
        const instancesForRef = filteredEventInstances.filter((inst) => inst.ref === ref);
        if (instancesForRef.length < expectedCount) {
          this.logger.warn(
            `[SEQ_GROUPS] WARNING: Ref "${ref}" appears in ${expectedCount} groups but only ${instancesForRef.length} instance(s) found. Student should perform this action ${expectedCount} times.`,
          );
        } else {
          this.logger.log(
            `[SEQ_GROUPS] Ref "${ref}" appears in ${expectedCount} groups and has ${instancesForRef.length} instance(s) available.`,
          );
        }
      }
    }

    // Sort groups by median time of their UNIQUE (non-shared) instances to avoid ambiguity
    const groupsWithMedianTime = sequenceGroups.map((group, configIndex) => {
      const refs = this.getAllItemRefsFromGroup(group);
      const uniqueRefs = refs.filter((ref) => allRefs.get(ref) === 1); // Only non-shared refs
      const times: number[] = [];

      for (const ref of uniqueRefs) {
        const instances = filteredEventInstances.filter((inst) => inst.ref === ref);
        for (const inst of instances) {
          const time =
            inst.orderValue ??
            (inst.elapsedSeconds !== undefined
              ? inst.elapsedSeconds * 1000
              : Number.MAX_SAFE_INTEGER);
          if (time < Number.MAX_SAFE_INTEGER) {
            times.push(time);
          }
        }
      }

      // Use median time of unique instances, or mark as shared-only group
      let representativeTime: number;
      let hasUniqueItems: boolean;

      if (times.length > 0) {
        times.sort((a, b) => a - b);
        representativeTime = times[Math.floor(times.length / 2)];
        hasUniqueItems = true;
      } else {
        // No unique refs - mark for config-order fallback
        representativeTime = Number.MAX_SAFE_INTEGER;
        hasUniqueItems = false;
      }

      return {
        group,
        representativeTime,
        uniqueRefCount: uniqueRefs.length,
        hasUniqueItems,
        configIndex,
      };
    });

    // Check if any groups have no unique items
    const sharedOnlyGroups = groupsWithMedianTime.filter((g) => !g.hasUniqueItems);
    if (sharedOnlyGroups.length > 0) {
      this.logger.log(
        `[SEQ_GROUPS] Shared-item-only groups detected: ${sharedOnlyGroups.map((g) => g.group.label ?? g.group.id).join(', ')}. Using configuration-order assignment for these groups.`,
      );
    }

    // Sort groups for instance consumption order.
    // In STRICT mode: use config order so earlier-configured groups consume earlier instances.
    // In FLEXIBLE mode: use representative time so groups consume nearest matching instances.
    const sortedGroups = groupsWithMedianTime
      .sort((a, b) => {
        if (sequenceGroupsOrderMode === 'strict') {
          // Strict mode: use config order as the primary rule, BUT groups with no completed
          // unique items (representative time = MAX_SAFE_INTEGER) are sorted AFTER groups
          // that have actual activity. This prevents an empty/skipped group from consuming
          // shared instances that belong to a later group the student actually completed.
          const aEmpty = !a.hasUniqueItems;
          const bEmpty = !b.hasUniqueItems;
          if (aEmpty && !bEmpty) {
            return 1;
          } // a has no activity → goes after b
          if (!aEmpty && bEmpty) {
            return -1;
          } // b has no activity → goes after a
          // Both have (or both lack) unique items → preserve config order
          return a.configIndex - b.configIndex;
        }
        // Flexible: sort by representative time (earliest actual performance)
        if (a.hasUniqueItems && b.hasUniqueItems) {
          return a.representativeTime - b.representativeTime;
        }
        if (!a.hasUniqueItems && !b.hasUniqueItems) {
          return a.configIndex - b.configIndex;
        }
        // Mixed: unique-item groups first, shared-only after
        if (a.hasUniqueItems) {
          return -1;
        }
        return 1;
      })
      .map((g) => g.group);

    this.logger.log(
      `[SEQ_GROUPS] Resolved group order: ${sortedGroups.map((g) => g.label ?? g.id).join(' → ')}`,
    );

    // Build map of how many groups each ref appears in
    const refGroupCounts = new Map<string, number>();
    for (const group of sequenceGroups) {
      for (const ref of this.getAllItemRefsFromGroup(group)) {
        refGroupCounts.set(ref, (refGroupCounts.get(ref) ?? 0) + 1);
      }
    }

    // Track instance consumption per ref (allowing multiple groups to consume different instances)
    const instanceConsumptionByRef = new Map<string, Set<string>>();
    const resolvedItemsMap = new Map<string, ResolvedGroupItem>();

    for (const group of sortedGroups) {
      // Check if this group has timing constraints
      const hasTimingConstraints = this.groupHasTimingConstraints(group);

      if (hasTimingConstraints) {
        // For groups with timing constraints, resolve items as pairs to find valid combinations
        this.resolveGroupWithTimingConstraints(
          group,
          filteredEventInstances,
          instanceConsumptionByRef,
          resolvedItemsMap,
          refGroupCounts,
          scenario,
          aiEvaluationResults,
        );
      } else {
        // For groups without timing constraints, resolve ALL refs (direct + subgroup) using a
        // single `item:` namespace. Subgroup items share the same instance pool as direct items.
        // The occurrence index comes from position in getAllItemRefsFromGroup order.
        const allRefOcc = new Map<string, number>();
        const resolveRef = (scopedKey: string, ref: string, context: string, minTime?: number) => {
          if (resolvedItemsMap.has(scopedKey)) {
            return;
          }
          const consumedForRef = instanceConsumptionByRef.get(ref) ?? new Set<string>();
          const item = this.resolveItemFromInstances(
            ref,
            filteredEventInstances,
            consumedForRef,
            scenario,
            aiEvaluationResults,
            minTime,
          );
          resolvedItemsMap.set(scopedKey, item);
          if (item.instance) {
            consumedForRef.add(item.instance.instanceId);
            instanceConsumptionByRef.set(ref, consumedForRef);
            this.logger.log(
              `[SEQ_GROUPS] Group "${group.label ?? group.id}" [${context}] resolved ref "${ref}" → instance ${item.instance.instanceId} at ${item.completedAtSeconds}s (minTime=${minTime ?? 0}ms)`,
            );
          } else {
            this.logger.log(
              `[SEQ_GROUPS] Group "${group.label ?? group.id}" [${context}] resolved ref "${ref}" → NOT COMPLETED`,
            );
          }
          return item;
        };

        if (group.mode === 'strict') {
          // For STRICT groups: walk childOrder in sequence, passing minTime so that a
          // late-but-correct attempt is preferred over an early-but-wrong one.
          let currentMinTime = 0;
          const children = this.getOrderedChildren(group);
          for (const child of children) {
            if (child.type === 'item') {
              const occ = allRefOcc.get(child.ref) ?? 0;
              allRefOcc.set(child.ref, occ + 1);
              const scopedKey = `${group.id}:item:${child.ref}:${occ}`;
              const item = resolveRef(scopedKey, child.ref, `strict occ#${occ}`, currentMinTime);
              if (item?.instance) {
                const t =
                  item.orderValue ??
                  (item.completedAtSeconds !== undefined ? item.completedAtSeconds * 1000 : 0);
                currentMinTime = Math.max(currentMinTime, t);
              }
            } else {
              // Subgroup items share the same minTime progression
              for (const ref of child.subgroup.items.map(getItemId)) {
                const occ = allRefOcc.get(ref) ?? 0;
                allRefOcc.set(ref, occ + 1);
                const scopedKey = `${group.id}:item:${ref}:${occ}`;
                const item = resolveRef(
                  scopedKey,
                  ref,
                  `strict sg:${child.subgroup.id} occ#${occ}`,
                  currentMinTime,
                );
                if (item?.instance) {
                  const t =
                    item.orderValue ??
                    (item.completedAtSeconds !== undefined ? item.completedAtSeconds * 1000 : 0);
                  currentMinTime = Math.max(currentMinTime, t);
                }
              }
            }
          }
          // Resolve any refs from getAllItemRefsFromGroup not covered by childOrder (no ordering constraint).
          // IMPORTANT: build the set of refs already covered by childOrder FIRST so we don't
          // create a second resolution attempt for refs that were already resolved above
          // (e.g. a subgroup item like ppe.handHygiene that is already in childOrder via its
          // subgroup — if we let the extra loop run for occ=1 it would steal a second instance).
          const childOrderCoveredRefs = new Set<string>();
          for (const child of children) {
            if (child.type === 'item') {
              childOrderCoveredRefs.add(child.ref);
            } else {
              for (const ref of child.subgroup.items.map(getItemId)) {
                childOrderCoveredRefs.add(ref);
              }
            }
          }
          for (const ref of this.getAllItemRefsFromGroup(group)) {
            if (childOrderCoveredRefs.has(ref)) {
              // Already handled in the childOrder walk above — skip to avoid consuming
              // an extra instance that belongs to another group.
              continue;
            }
            const occ = allRefOcc.get(ref) ?? 0;
            allRefOcc.set(ref, occ + 1);
            resolveRef(`${group.id}:item:${ref}:${occ}`, ref, `strict extra occ#${occ}`);
          }
        } else {
          // FLEXIBLE groups: resolve in getAllItemRefsFromGroup order, no ordering constraint
          for (const ref of this.getAllItemRefsFromGroup(group)) {
            const occ = allRefOcc.get(ref) ?? 0;
            allRefOcc.set(ref, occ + 1);
            resolveRef(`${group.id}:item:${ref}:${occ}`, ref, `occ#${occ}`);
          }
        }
      }
    }

    const groupResults: GroupScoringResult[] = [];
    const parentResults: SequencingParentResult[] = [];

    // Build map of which group(s) each ref belongs to
    const refToGroupsMap = new Map<string, string[]>();
    for (const group of sequenceGroups) {
      for (const ref of this.getAllItemRefsFromGroup(group)) {
        const existingGroups = refToGroupsMap.get(ref) ?? [];
        if (!existingGroups.includes(group.id)) {
          existingGroups.push(group.id);
        }
        refToGroupsMap.set(ref, existingGroups);
      }
    }

    // Track which groups were interrupted
    const interruptedGroups = new Map<
      string,
      { interruptingAction: string; interruptingGroup: string }
    >();

    // Flatten instanceConsumptionByRef to get all consumed instance IDs
    const allConsumedInstanceIds = new Set<string>();
    for (const consumedSet of instanceConsumptionByRef.values()) {
      for (const instanceId of consumedSet) {
        allConsumedInstanceIds.add(instanceId);
      }
    }

    const overallResult = this.evaluateOverallGroupOrder(
      sequenceGroups,
      sequenceGroupsOrderMode,
      resolvedItemsMap,
      scenario,
      allEventInstances,
      configuredRefs,
      refToGroupsMap,
      interruptedGroups,
      allConsumedInstanceIds,
    );
    groupResults.push(overallResult);
    parentResults.push(this.groupResultToParentResult(overallResult));

    for (const group of sequenceGroups) {
      const groupResult = this.evaluateGroup(
        group,
        resolvedItemsMap,
        scenario,
        sequenceGroups,
        allEventInstances,
        configuredRefs,
        refToGroupsMap,
        interruptedGroups,
      );
      groupResults.push(groupResult);
      parentResults.push(this.groupResultToParentResult(groupResult));
      if (group.subgroups && group.subgroups.length > 0) {
        for (const subgroup of group.subgroups) {
          const sgOccurrences = this.getSubgroupItemOccurrences(group).get(subgroup.id) ?? [];
          const sgResult = this.evaluateSubgroup(
            subgroup,
            group,
            resolvedItemsMap,
            scenario,
            sgOccurrences,
          );
          groupResults.push(sgResult);
          parentResults.push(this.groupResultToParentResult(sgResult));
        }
      }
      const timingResults = this.evaluateTimingConstraints(group, resolvedItemsMap, scenario);
      for (const tr of timingResults) {
        groupResults.push(tr);
        parentResults.push(this.groupResultToParentResult(tr));
      }
    }

    const totalPoints = groupResults.length;
    const passedPoints = groupResults.filter((r) => r.passed).length;
    const score = totalPoints > 0 ? Number(((passedPoints / totalPoints) * 100).toFixed(2)) : null;
    const strengths: Array<{ point: string; example: string }> = [];
    const weaknesses: Array<{ point: string; example: string }> = [];

    // Separate overall result from individual group/subgroup results
    const overallResults = groupResults.filter((r) => r.type === 'overall');
    const groupAndSubgroupResults = groupResults.filter(
      (r) => r.type === 'group' || r.type === 'subgroup',
    );
    const timingResults = groupResults.filter((r) => r.type === 'timing');

    // Add overall results first
    overallResults.forEach((result) => {
      const userFriendlyMessage = this.getUserFriendlyMessage(result, sequenceGroups, scenario);
      if (result.passed) {
        strengths.push({
          point: userFriendlyMessage.point,
          example: userFriendlyMessage.example,
        });
      } else {
        weaknesses.push({
          point: userFriendlyMessage.point,
          example: userFriendlyMessage.example,
        });
      }
    });

    // Add individual group/subgroup results
    groupAndSubgroupResults.forEach((result) => {
      const userFriendlyMessage = this.getUserFriendlyMessage(result, sequenceGroups, scenario);
      if (result.passed) {
        strengths.push({
          point: userFriendlyMessage.point,
          example: userFriendlyMessage.example,
        });
      } else {
        weaknesses.push({
          point: userFriendlyMessage.point,
          example: userFriendlyMessage.example,
        });
      }
    });

    // Add timing results
    timingResults.forEach((result) => {
      const userFriendlyMessage = this.getUserFriendlyMessage(result, sequenceGroups, scenario);
      if (result.passed) {
        strengths.push({
          point: userFriendlyMessage.point,
          example: userFriendlyMessage.example,
        });
      } else {
        weaknesses.push({
          point: userFriendlyMessage.point,
          example: userFriendlyMessage.example,
        });
      }
    });
    const recommendations: string[] = [];
    if (weaknesses.length > 0) {
      if (weaknesses.some((w) => w.example.includes('order') || w.example.includes('before'))) {
        recommendations.push('Ensure all steps are performed in the correct sequence.');
      }
      if (weaknesses.some((w) => w.example.includes('timing') || w.example.includes('minute'))) {
        recommendations.push('Pay close attention to timing requirements.');
      }
      if (recommendations.length === 0) {
        recommendations.push('Review the expected sequence of actions.');
      }
    } else {
      recommendations.push('Continue following the correct sequencing and timing.');
    }
    this.logger.log(`[SEQ_GROUPS] Complete: ${passedPoints}/${totalPoints} (${score}%)`);
    return {
      score,
      summary: `${passedPoints} of ${totalPoints} sequencing criteria passed.`,
      strengths,
      weaknesses,
      recommendations,
      parentResults,
      groupResults,
    };
  }

  private evaluateOverallGroupOrder(
    groups: SequenceGroupDefinition[],
    mode: 'strict' | 'flexible',
    resolvedItems: Map<string, ResolvedGroupItem>,
    scenario: Scenario | undefined,
    allEventInstances: EventInstance[],
    configuredRefs: Set<string>,
    refToGroupsMap: Map<string, string[]>,
    interruptedGroups?: Map<string, { interruptingAction: string; interruptingGroup: string }>,
    consumedInstanceIds?: Set<string>,
  ): GroupScoringResult {
    const label = `All Groups Overall (${mode === 'strict' ? 'Strict' : 'Flexible'})`;

    // Build time ranges for each group
    // IMPORTANT: Only use instances that were actually ASSIGNED to each group (via resolvedItems)
    // This prevents duplicate field updates (e.g., DOB in both Group A and Group E) from
    // incorrectly affecting time range calculations
    const groupTimeRanges: Array<{
      groupId: string;
      groupLabel: string;
      minTime: number;
      maxTime: number;
      hasCompletedItems: boolean;
      assignedInstanceIds: Set<string>; // Track which instances belong to this group
    }> = [];

    for (const group of groups) {
      const times: number[] = [];
      const assignedInstanceIds = new Set<string>();

      // Direct items
      const directOcc = new Map<string, number>();
      for (const ref of this.getAllItemRefsFromGroup(group)) {
        const occ = directOcc.get(ref) ?? 0;
        directOcc.set(ref, occ + 1);
        const r = resolvedItems.get(`${group.id}:item:${ref}:${occ}`);
        if (r?.completed && r.instance) {
          const t =
            r.orderValue ??
            (r.completedAtSeconds !== undefined ? r.completedAtSeconds * 1000 : undefined);
          if (t !== undefined) {
            times.push(t);
            assignedInstanceIds.add(r.instance.instanceId);
          }
        }
      }

      groupTimeRanges.push({
        groupId: group.id,
        groupLabel: group.label ?? group.id,
        minTime: times.length > 0 ? Math.min(...times) : Number.MAX_SAFE_INTEGER,
        maxTime: times.length > 0 ? Math.max(...times) : Number.MAX_SAFE_INTEGER,
        hasCompletedItems: times.length > 0,
        assignedInstanceIds,
      });

      this.logger.log(
        `[SEQ_GROUPS] Group "${group.label ?? group.id}" time range: ${times.length > 0 ? `${Math.min(...times)}ms - ${Math.max(...times)}ms` : 'NO COMPLETED ITEMS'}, assigned instances: [${Array.from(assignedInstanceIds).join(', ')}]`,
      );
    }

    // Collect ALL issues instead of returning on first issue
    const allFailures: string[] = [];

    // Check 1: Missing groups (groups with no completed items) - BOTH strict and flexible modes
    const incompleteGroups = groupTimeRanges.filter((g) => !g.hasCompletedItems);
    if (incompleteGroups.length > 0) {
      const missingGroupNames = incompleteGroups.map((g) => g.groupLabel).join(', ');
      if (mode === 'strict') {
        allFailures.push(
          `You did not complete any items from the following group${incompleteGroups.length > 1 ? 's' : ''}: ${missingGroupNames}. All groups must be attempted and completed in order.`,
        );
      } else {
        allFailures.push(
          `You did not complete any items from the following group${incompleteGroups.length > 1 ? 's' : ''}: ${missingGroupNames}. All groups must be attempted.`,
        );
      }
    }

    // Check 2: Interruptions and out-of-order issues (only check groups that have items)
    const completedGroups = groupTimeRanges.filter((g) => g.hasCompletedItems);

    for (let i = 0; i < completedGroups.length - 1; i++) {
      const current = completedGroups[i];
      const next = completedGroups[i + 1];

      // Find CONSUMED instances that happened while current group was in progress
      // but belong to a later group
      // Only check instances that were actually matched to groups (consumed)
      // This prevents duplicate occurrences from being flagged as interruptions
      const interruptingInstances = allEventInstances.filter((inst) => {
        // Only check consumed instances (instances that were actually matched to groups)
        if (consumedInstanceIds && !consumedInstanceIds.has(inst.instanceId)) {
          return false;
        }

        // CRITICAL FIX: Skip instances that were assigned to the current group
        // This prevents the same field (e.g., DOB in both Group A and Group E) from
        // being flagged as interrupting when it was legitimately used by the current group
        if (current.assignedInstanceIds.has(inst.instanceId)) {
          return false; // This instance belongs to current group, not an interruption
        }

        // Only check configured items
        if (!configuredRefs.has(inst.ref)) {
          return false;
        }

        const instTime =
          inst.orderValue ??
          (inst.elapsedSeconds !== undefined ? inst.elapsedSeconds * 1000 : undefined);

        if (instTime === undefined) {
          return false;
        }

        // Check if this instance belongs to a later group
        // Note: An item can belong to multiple groups, check if ANY of them are later
        const belongsToGroups = refToGroupsMap.get(inst.ref) ?? [];
        if (belongsToGroups.length === 0) {
          return false;
        }

        // Find the indices in the original groups array
        const currentGroupIndex = groups.findIndex((g) => g.id === current.groupId);

        // Check if item belongs to ANY group that comes after the current group
        const belongsToLaterGroup = belongsToGroups.some((groupId) => {
          const groupIndex = groups.findIndex((g) => g.id === groupId);
          return groupIndex > currentGroupIndex;
        });

        if (!belongsToLaterGroup) {
          return false;
        }

        // Instance happened after current group started but before current group finished
        if (instTime > current.minTime && instTime < current.maxTime) {
          return true; // Item from later group interrupted current group
        }

        return false;
      });

      if (interruptingInstances.length > 0) {
        const interruptingItem = interruptingInstances[0];
        const interruptingLabel =
          interruptingItem.title ?? this.resolveDisplayLabelForRef(interruptingItem.ref, scenario);

        // Find which group the interrupting item belongs to
        // If it belongs to multiple groups, find the FIRST group that comes after current group
        const belongsToGroups = refToGroupsMap.get(interruptingItem.ref) ?? [];
        const currentGroupIndex = groups.findIndex((g) => g.id === current.groupId);

        let interruptingGroupId: string | undefined;
        let minGroupIndex = Number.MAX_SAFE_INTEGER;

        for (const groupId of belongsToGroups) {
          const groupIndex = groups.findIndex((g) => g.id === groupId);
          if (groupIndex > currentGroupIndex && groupIndex < minGroupIndex) {
            minGroupIndex = groupIndex;
            interruptingGroupId = groupId;
          }
        }

        const interruptingGroup = groups.find((g) => g.id === interruptingGroupId);
        const interruptingGroupLabel =
          interruptingGroup?.label ?? interruptingGroup?.id ?? 'Unknown';

        // Record that this group was interrupted (for individual group evaluation)
        if (interruptedGroups) {
          interruptedGroups.set(current.groupId, {
            interruptingAction: interruptingLabel,
            interruptingGroup: interruptingGroupLabel,
          });
        }

        allFailures.push(
          `You started "${interruptingGroupLabel}" too early. The action "${interruptingLabel}" from "${interruptingGroupLabel}" was performed before all items in "${current.groupLabel}" were completed. You must finish all items in "${current.groupLabel}" before starting "${interruptingGroupLabel}".`,
        );

        // Skip checking simple overlap for this pair since we already reported interruption
        continue;
      }

      // Check for simple overlap (next group started before current finished) - only in STRICT mode
      if (mode === 'strict' && current.maxTime > next.minTime + SAME_SECOND_TOLERANCE_MS) {
        allFailures.push(
          `You started "${next.groupLabel}" too early. Some items from "${next.groupLabel}" were performed before all items in "${current.groupLabel}" were completed. Complete all items in "${current.groupLabel}" first, then proceed to "${next.groupLabel}".`,
        );
      }
    }

    // If there are any failures, return them all
    if (allFailures.length > 0) {
      return {
        id: 'overall_groups',
        label,
        type: 'overall',
        passed: false,
        failedReasons: allFailures,
        rationale:
          allFailures.length === 1
            ? allFailures[0]
            : `Multiple sequence violations: ${allFailures.length} issue${allFailures.length > 1 ? 's' : ''} found.`,
      };
    }

    return {
      id: 'overall_groups',
      label,
      type: 'overall',
      passed: true,
      failedReasons: [],
      studentPerformance: groupTimeRanges
        .filter((g) => g.hasCompletedItems)
        .sort((a, b) => a.minTime - b.minTime)
        .map((g) => g.groupLabel)
        .join(' → '),
      rationale: 'Grouped items were performed in appropriate sequence.',
    };
  }

  private evaluateGroup(
    group: SequenceGroupDefinition,
    resolvedItems: Map<string, ResolvedGroupItem>,
    scenario: Scenario | undefined,
    allGroups: SequenceGroupDefinition[],
    allEventInstances: EventInstance[],
    configuredRefs: Set<string>,
    refToGroupsMap: Map<string, string[]>,
    interruptedGroups: Map<string, { interruptingAction: string; interruptingGroup: string }>,
  ): GroupScoringResult {
    const groupLabel = group.label ?? group.id;
    const label = `${groupLabel} (${group.mode === 'strict' ? 'Strict' : 'Flexible'})`;

    // Check if all items were completed (required for both strict and flexible)
    // Only check group.items — subgroup items are a subset of group.items, not additional.
    const incompleteItems: string[] = [];

    const compDirectOcc = new Map<string, number>();
    for (const ref of group.items.map(getItemId)) {
      const occ = compDirectOcc.get(ref) ?? 0;
      compDirectOcc.set(ref, occ + 1);
      const r = resolvedItems.get(`${group.id}:item:${ref}:${occ}`);
      if (!r?.completed) {
        incompleteItems.push(this.resolveDisplayLabelForRef(ref, scenario));
      }
    }

    // Collect all failures
    const groupFailures: string[] = [];

    // Check if this group was interrupted
    const interruption = interruptedGroups.get(group.id);
    if (interruption) {
      groupFailures.push(
        `This group was interrupted by "${interruption.interruptingAction}" from "${interruption.interruptingGroup}". All items in a group must be completed before starting items from the next group.`,
      );
    }

    if (incompleteItems.length > 0) {
      groupFailures.push(
        `The following ${incompleteItems.length} item${incompleteItems.length > 1 ? 's were' : ' was'} not completed: ${incompleteItems.join(', ')}`,
      );
    }

    // If flexible mode, check if we have failures and return
    if (group.mode === 'flexible') {
      if (groupFailures.length > 0) {
        return {
          id: `group_${group.id}`,
          label,
          type: 'group',
          passed: false,
          failedReasons: groupFailures,
          rationale: `Group "${groupLabel}" has ${groupFailures.length} issue${groupFailures.length > 1 ? 's' : ''}.`,
        };
      }
      return {
        id: `group_${group.id}`,
        label,
        type: 'group',
        passed: true,
        failedReasons: [],
        rationale: 'Flexible sequence requirements in group were followed.',
      };
    }

    // Strict mode: check order violations
    const children = this.getOrderedChildren(group);
    if (children.length <= 1) {
      if (groupFailures.length > 0) {
        return {
          id: `group_${group.id}`,
          label,
          type: 'group',
          passed: false,
          failedReasons: groupFailures,
          rationale: `Group "${groupLabel}" has ${groupFailures.length} issue${groupFailures.length > 1 ? 's' : ''}.`,
        };
      }
      return {
        id: `group_${group.id}`,
        label,
        type: 'group',
        passed: true,
        failedReasons: [],
        rationale: 'All STRICT sequence requirements in group were followed.',
      };
    }

    const childTimeRanges: Array<{ childLabel: string; minTime: number; maxTime: number }> = [];
    // Use a SINGLE shared counter so subgroup item lookups continue from where direct items left off.
    // Subgroup items share the same `item:` instance pool as direct items.
    const sharedRefOcc = new Map<string, number>();
    for (const child of children) {
      if (child.type === 'item') {
        const occ = sharedRefOcc.get(child.ref) ?? 0;
        sharedRefOcc.set(child.ref, occ + 1);
        const r = resolvedItems.get(`${group.id}:item:${child.ref}:${occ}`);
        if (r?.completed) {
          const t =
            r.orderValue ??
            (r.completedAtSeconds !== undefined
              ? r.completedAtSeconds * 1000
              : Number.MAX_SAFE_INTEGER);
          childTimeRanges.push({ childLabel: r.label, minTime: t, maxTime: t });
        } else {
          childTimeRanges.push({
            childLabel: this.resolveDisplayLabelForRef(child.ref, scenario),
            minTime: Number.MAX_SAFE_INTEGER,
            maxTime: Number.MAX_SAFE_INTEGER,
          });
        }
      } else {
        const times: number[] = [];
        for (const ref of child.subgroup.items.map(getItemId)) {
          const occ = sharedRefOcc.get(ref) ?? 0;
          sharedRefOcc.set(ref, occ + 1);
          const r = resolvedItems.get(`${group.id}:item:${ref}:${occ}`);
          if (r?.completed) {
            const t =
              r.orderValue ??
              (r.completedAtSeconds !== undefined ? r.completedAtSeconds * 1000 : undefined);
            if (t !== undefined) {
              times.push(t);
            }
          }
        }
        childTimeRanges.push({
          childLabel: child.subgroup.label ?? child.subgroup.id,
          minTime: times.length > 0 ? Math.min(...times) : Number.MAX_SAFE_INTEGER,
          maxTime: times.length > 0 ? Math.max(...times) : Number.MAX_SAFE_INTEGER,
        });
      }
    }

    // Collect all order violations
    for (let i = 0; i < childTimeRanges.length - 1; i++) {
      const current = childTimeRanges[i];
      const next = childTimeRanges[i + 1];
      if (current.maxTime === Number.MAX_SAFE_INTEGER || next.minTime === Number.MAX_SAFE_INTEGER) {
        continue;
      }
      if (current.maxTime > next.minTime + SAME_SECOND_TOLERANCE_MS) {
        groupFailures.push(
          `"${next.childLabel}" was started before "${current.childLabel}" was completed.`,
        );
      }
    }

    // Return result based on collected failures
    if (groupFailures.length > 0) {
      return {
        id: `group_${group.id}`,
        label,
        type: 'group',
        passed: false,
        failedReasons: groupFailures,
        rationale: `Group "${groupLabel}" (STRICT) has ${groupFailures.length} issue${groupFailures.length > 1 ? 's' : ''}.`,
      };
    }
    return {
      id: `group_${group.id}`,
      label,
      type: 'group',
      passed: true,
      failedReasons: [],
      rationale: 'All STRICT sequence requirements in group were followed.',
    };
  }

  private evaluateSubgroup(
    subgroup: {
      id: string;
      label?: string;
      items: (string | SequenceItem)[];
      mode: 'strict' | 'flexible';
    },
    _parentGroup: SequenceGroupDefinition,
    resolvedItems: Map<string, ResolvedGroupItem>,
    scenario: Scenario | undefined,
    itemOccurrences: number[],
  ): GroupScoringResult {
    const subgroupLabel = subgroup.label ?? subgroup.id;
    const label = `${subgroupLabel} (${subgroup.mode === 'strict' ? 'Strict' : 'Flexible'})`;

    // Check if all items were completed (required for both strict and flexible)
    const itemRefs = subgroup.items.map(getItemId);
    const incompleteItems: string[] = [];

    for (let i = 0; i < itemRefs.length; i++) {
      const ref = itemRefs[i];
      const occ = itemOccurrences[i] ?? i;
      const r = resolvedItems.get(`${_parentGroup.id}:item:${ref}:${occ}`);
      if (!r?.completed) {
        incompleteItems.push(this.resolveDisplayLabelForRef(ref, scenario));
      }
    }

    // Collect all failures
    const subgroupFailures: string[] = [];

    if (incompleteItems.length > 0) {
      subgroupFailures.push(
        `The following ${incompleteItems.length} item${incompleteItems.length > 1 ? 's were' : ' was'} not completed: ${incompleteItems.join(', ')}`,
      );
    }

    // If flexible mode, check if we have failures and return
    if (subgroup.mode === 'flexible') {
      if (subgroupFailures.length > 0) {
        return {
          id: `subgroup_${subgroup.id}`,
          label,
          type: 'subgroup',
          passed: false,
          failedReasons: subgroupFailures,
          rationale: `Subgroup "${subgroupLabel}" has ${subgroupFailures.length} issue${subgroupFailures.length > 1 ? 's' : ''}.`,
        };
      }
      return {
        id: `subgroup_${subgroup.id}`,
        label,
        type: 'subgroup',
        passed: true,
        failedReasons: [],
        rationale: 'Flexible sequence requirements in subgroup were followed.',
      };
    }

    // Strict mode: check order violations
    if (itemRefs.length <= 1) {
      if (subgroupFailures.length > 0) {
        return {
          id: `subgroup_${subgroup.id}`,
          label,
          type: 'subgroup',
          passed: false,
          failedReasons: subgroupFailures,
          rationale: `Subgroup "${subgroupLabel}" has ${subgroupFailures.length} issue${subgroupFailures.length > 1 ? 's' : ''}.`,
        };
      }
      return {
        id: `subgroup_${subgroup.id}`,
        label,
        type: 'subgroup',
        passed: true,
        failedReasons: [],
        rationale: 'All STRICT sequence requirements in subgroup were followed.',
      };
    }

    const itemTimes: Array<{ ref: string; label: string; time: number }> = [];
    for (let i = 0; i < itemRefs.length; i++) {
      const ref = itemRefs[i];
      const occ = itemOccurrences[i] ?? i;
      const r = resolvedItems.get(`${_parentGroup.id}:item:${ref}:${occ}`);
      if (r?.completed) {
        const t =
          r.orderValue ??
          (r.completedAtSeconds !== undefined ? r.completedAtSeconds * 1000 : undefined);
        if (t !== undefined) {
          itemTimes.push({ ref, label: r.label, time: t });
        }
      }
    }

    // Collect all order violations
    for (let i = 0; i < itemTimes.length - 1; i++) {
      if (itemTimes[i].time > itemTimes[i + 1].time) {
        subgroupFailures.push(
          `"${itemTimes[i + 1].label}" was performed before "${itemTimes[i].label}".`,
        );
      }
    }

    // Return result based on collected failures
    if (subgroupFailures.length > 0) {
      return {
        id: `subgroup_${subgroup.id}`,
        label,
        type: 'subgroup',
        passed: false,
        failedReasons: subgroupFailures,
        studentPerformance: itemTimes.map((x) => x.label).join(' → '),
        rationale: `Subgroup "${subgroupLabel}" (STRICT) has ${subgroupFailures.length} issue${subgroupFailures.length > 1 ? 's' : ''}.`,
      };
    }
    return {
      id: `subgroup_${subgroup.id}`,
      label,
      type: 'subgroup',
      passed: true,
      failedReasons: [],
      studentPerformance: itemTimes.map((x) => x.label).join(' → '),
      rationale: 'All STRICT sequence requirements in subgroup were followed.',
    };
  }

  /**
   * Compute the occurrence index (into the parent group's `item:` pool) for each item
   * in every subgroup, by walking childOrder with a shared ref counter.
   * Subgroup items share the same instance pool as direct group items.
   */
  private getSubgroupItemOccurrences(group: SequenceGroupDefinition): Map<string, number[]> {
    const result = new Map<string, number[]>();
    const sharedRefOcc = new Map<string, number>();
    const children = this.getOrderedChildren(group);
    for (const child of children) {
      if (child.type === 'item') {
        const occ = sharedRefOcc.get(child.ref) ?? 0;
        sharedRefOcc.set(child.ref, occ + 1);
      } else {
        const sgOccs: number[] = [];
        for (const ref of child.subgroup.items.map(getItemId)) {
          const occ = sharedRefOcc.get(ref) ?? 0;
          sharedRefOcc.set(ref, occ + 1);
          sgOccs.push(occ);
        }
        result.set(child.subgroup.id, sgOccs);
      }
    }
    return result;
  }

  /**
   * Check if a group has any timing constraints
   */
  private groupHasTimingConstraints(group: SequenceGroupDefinition): boolean {
    // Check items in the group
    for (const item of group.items) {
      if (typeof item === 'object' && item.timing && item.timingReferenceItem) {
        return true;
      }
    }
    // Check items in subgroups
    if (group.subgroups) {
      for (const sg of group.subgroups) {
        for (const item of sg.items) {
          if (typeof item === 'object' && item.timing && item.timingReferenceItem) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Resolve items for a group with timing constraints by finding the best matching instance pairs
   */
  private resolveGroupWithTimingConstraints(
    group: SequenceGroupDefinition,
    allInstances: EventInstance[],
    instanceConsumptionByRef: Map<string, Set<string>>,
    resolvedItemsMap: Map<string, ResolvedGroupItem>,
    refGroupCounts: Map<string, number>,
    scenario: Scenario | undefined,
    aiEvaluationResults: Map<
      string,
      Array<{ matched: boolean; evidence?: string; timestamp?: number; orderValue?: number }>
    >,
  ): void {
    // Collect timing constraints in this group
    interface TimingConstraint {
      currentRef: string;
      referenceRef: string;
      thresholdSeconds: number;
    }
    const constraints: TimingConstraint[] = [];

    for (const item of group.items) {
      if (typeof item === 'object' && item.timing && item.timingReferenceItem) {
        if (item.timing.mode === 'withinMinutes') {
          constraints.push({
            currentRef: item.id,
            referenceRef: item.timingReferenceItem,
            thresholdSeconds: item.timing.withinMinutesFromStart * 60,
          });
        }
      }
    }
    if (group.subgroups) {
      for (const sg of group.subgroups) {
        for (const item of sg.items) {
          if (typeof item === 'object' && item.timing && item.timingReferenceItem) {
            if (item.timing.mode === 'withinMinutes') {
              constraints.push({
                currentRef: item.id,
                referenceRef: item.timingReferenceItem,
                thresholdSeconds: item.timing.withinMinutesFromStart * 60,
              });
            }
          }
        }
      }
    }

    if (constraints.length === 0) {
      this.logger.warn(
        `[SEQ_GROUPS] Group "${group.label ?? group.id}" marked as having timing constraints but none found`,
      );
      return;
    }

    // For each constraint, collect available instance pairs
    for (const constraint of constraints) {
      const scopedCurrentKey = `${group.id}:item:${constraint.currentRef}:0`;
      const scopedReferenceKey = `${group.id}:item:${constraint.referenceRef}:0`;

      // Skip if already resolved
      if (resolvedItemsMap.has(scopedCurrentKey) && resolvedItemsMap.has(scopedReferenceKey)) {
        continue;
      }

      // Get consumed instances for these refs
      const consumedCurrent =
        instanceConsumptionByRef.get(constraint.currentRef) ?? new Set<string>();

      // Handle subgroup references
      let referenceInstances: EventInstance[] = [];
      let consumedReference = new Set<string>();

      if (constraint.referenceRef.startsWith('subgroup:')) {
        const subgroupId = constraint.referenceRef.substring('subgroup:'.length);
        const subgroup = group.subgroups?.find((sg) => sg.id === subgroupId);

        if (subgroup) {
          // Collect instances from all items in the subgroup
          const subgroupItemRefs = subgroup.items.map((i) => (typeof i === 'string' ? i : i.id));

          this.logger.log(
            `[TIMING_MATCH] Group "${group.label ?? group.id}": Reference is subgroup "${subgroup.label}" with items: [${subgroupItemRefs.join(', ')}]`,
          );

          const allItemInstances: EventInstance[][] = [];

          for (const itemRef of subgroupItemRefs) {
            const itemConsumed = instanceConsumptionByRef.get(itemRef) ?? new Set<string>();
            const itemInstances = this.findAvailableInstances(
              itemRef,
              allInstances,
              itemConsumed,
              scenario,
              aiEvaluationResults,
            );
            allItemInstances.push(itemInstances);
            itemInstances.forEach((inst) => referenceInstances.push(inst));
            itemConsumed.forEach((id) => consumedReference.add(id));
          }

          // Check if ALL items in the subgroup have at least one instance
          const allItemsCompleted = allItemInstances.every((instances) => instances.length > 0);

          if (allItemsCompleted && referenceInstances.length > 0) {
            // All items completed - use the latest completion time from all subgroup items as the reference time
            referenceInstances.sort((a, b) => {
              const aTime = a.elapsedSeconds ?? 0;
              const bTime = b.elapsedSeconds ?? 0;
              return bTime - aTime; // Sort descending to get latest first
            });
            // Keep only the latest instance as the reference point
            referenceInstances = [referenceInstances[0]];
          } else {
            // Not all items in the subgroup were completed - clear instances to indicate failure
            this.logger.log(
              `[TIMING_MATCH] Group "${group.label ?? group.id}": Not all items in subgroup "${subgroup.label}" were completed`,
            );
            referenceInstances = [];
          }
        }
      } else {
        consumedReference =
          instanceConsumptionByRef.get(constraint.referenceRef) ?? new Set<string>();
        referenceInstances = this.findAvailableInstances(
          constraint.referenceRef,
          allInstances,
          consumedReference,
          scenario,
          aiEvaluationResults,
        );
      }

      this.logger.log(
        `[TIMING_MATCH] Group "${group.label ?? group.id}": Checking constraint "${constraint.currentRef}" within ${constraint.thresholdSeconds}s of "${constraint.referenceRef}"`,
      );
      this.logger.log(
        `[TIMING_MATCH] Already consumed for "${constraint.referenceRef}": [${Array.from(consumedReference).join(', ')}]`,
      );
      this.logger.log(
        `[TIMING_MATCH] Already consumed for "${constraint.currentRef}": [${Array.from(consumedCurrent).join(', ')}]`,
      );

      // Find all available instances for current ref
      const currentInstances = this.findAvailableInstances(
        constraint.currentRef,
        allInstances,
        consumedCurrent,
        scenario,
        aiEvaluationResults,
      );

      this.logger.log(
        `[TIMING_MATCH] Group "${group.label ?? group.id}": Found ${referenceInstances.length} reference instances [${referenceInstances.map((i) => `${i.instanceId}@${i.elapsedSeconds}s`).join(', ')}] and ${currentInstances.length} current instances [${currentInstances.map((i) => `${i.instanceId}@${i.elapsedSeconds}s`).join(', ')}]`,
      );

      // Find the best matching pair that satisfies the timing constraint
      let bestPair: { reference: EventInstance; current: EventInstance; score: number } | null =
        null;

      for (const refInst of referenceInstances) {
        for (const currInst of currentInstances) {
          const refTime = refInst.elapsedSeconds ?? 0;
          const currTime = currInst.elapsedSeconds ?? 0;
          const timeDiff = currTime - refTime;

          // Check if this pair satisfies the timing constraint
          if (timeDiff > 0 && timeDiff <= constraint.thresholdSeconds) {
            // Valid pair! Score by how close they are (prefer tighter timing)
            const score = constraint.thresholdSeconds - timeDiff;
            if (!bestPair || score > bestPair.score) {
              bestPair = { reference: refInst, current: currInst, score };
            }
          }
        }
      }

      // If we found a valid pair, use it. Otherwise fall back to earliest instances
      if (bestPair) {
        this.logger.log(
          `[TIMING_MATCH] Group "${group.label ?? group.id}": Found valid pair - reference@${bestPair.reference.elapsedSeconds}s, current@${bestPair.current.elapsedSeconds}s (timing satisfied)`,
        );

        // Resolve with the matched pair
        if (!resolvedItemsMap.has(scopedReferenceKey)) {
          resolvedItemsMap.set(scopedReferenceKey, {
            ref: constraint.referenceRef,
            label: this.resolveDisplayLabelForRef(constraint.referenceRef, scenario),
            completed: true,
            completedAtSeconds: bestPair.reference.elapsedSeconds,
            orderValue: bestPair.reference.orderValue,
            instance: bestPair.reference,
          });
          consumedReference.add(bestPair.reference.instanceId);
          instanceConsumptionByRef.set(constraint.referenceRef, consumedReference);
          this.logger.log(
            `[TIMING_MATCH] Marked ${bestPair.reference.instanceId} as consumed for "${constraint.referenceRef}"`,
          );
        }

        if (!resolvedItemsMap.has(scopedCurrentKey)) {
          resolvedItemsMap.set(scopedCurrentKey, {
            ref: constraint.currentRef,
            label: this.resolveDisplayLabelForRef(constraint.currentRef, scenario),
            completed: true,
            completedAtSeconds: bestPair.current.elapsedSeconds,
            orderValue: bestPair.current.orderValue,
            instance: bestPair.current,
          });
          consumedCurrent.add(bestPair.current.instanceId);
          instanceConsumptionByRef.set(constraint.currentRef, consumedCurrent);
          this.logger.log(
            `[TIMING_MATCH] Marked ${bestPair.current.instanceId} as consumed for "${constraint.currentRef}"`,
          );
        }
      } else {
        this.logger.log(
          `[TIMING_MATCH] Group "${group.label ?? group.id}": No valid pair found, using earliest available instances`,
        );

        // Fall back to earliest instances (will fail timing check)
        if (!resolvedItemsMap.has(scopedReferenceKey)) {
          const item = this.resolveItemFromInstances(
            constraint.referenceRef,
            allInstances,
            consumedReference,
            scenario,
            aiEvaluationResults,
          );
          resolvedItemsMap.set(scopedReferenceKey, item);
          if (item.instance) {
            consumedReference.add(item.instance.instanceId);
            instanceConsumptionByRef.set(constraint.referenceRef, consumedReference);
          }
        }

        if (!resolvedItemsMap.has(scopedCurrentKey)) {
          const item = this.resolveItemFromInstances(
            constraint.currentRef,
            allInstances,
            consumedCurrent,
            scenario,
            aiEvaluationResults,
          );
          resolvedItemsMap.set(scopedCurrentKey, item);
          if (item.instance) {
            consumedCurrent.add(item.instance.instanceId);
            instanceConsumptionByRef.set(constraint.currentRef, consumedCurrent);
          }
        }
      }

      // Log the final resolution
      const resolvedRef = resolvedItemsMap.get(scopedReferenceKey);
      const resolvedCurr = resolvedItemsMap.get(scopedCurrentKey);
      this.logger.log(
        `[SEQ_GROUPS] Group "${group.label ?? group.id}" resolved ref "${constraint.referenceRef}" → ${resolvedRef?.instance ? `instance ${resolvedRef.instance.instanceId} at ${resolvedRef.completedAtSeconds}s` : 'NOT COMPLETED'} (${instanceConsumptionByRef.get(constraint.referenceRef)?.size ?? 0}/${refGroupCounts.get(constraint.referenceRef) ?? 1} groups)`,
      );
      this.logger.log(
        `[SEQ_GROUPS] Group "${group.label ?? group.id}" resolved ref "${constraint.currentRef}" → ${resolvedCurr?.instance ? `instance ${resolvedCurr.instance.instanceId} at ${resolvedCurr.completedAtSeconds}s` : 'NOT COMPLETED'} (${instanceConsumptionByRef.get(constraint.currentRef)?.size ?? 0}/${refGroupCounts.get(constraint.currentRef) ?? 1} groups)`,
      );
    }

    // Resolve any remaining items in the group that don't have timing constraints.
    // All items (direct + subgroup) share the same `item:` namespace.
    const tcAllOcc = new Map<string, number>();
    for (const ref of this.getAllItemRefsFromGroup(group)) {
      const occ = tcAllOcc.get(ref) ?? 0;
      tcAllOcc.set(ref, occ + 1);
      const scopedKey = `${group.id}:item:${ref}:${occ}`;
      if (resolvedItemsMap.has(scopedKey)) {
        continue;
      }
      const consumedForRef = instanceConsumptionByRef.get(ref) ?? new Set<string>();
      const item = this.resolveItemFromInstances(
        ref,
        allInstances,
        consumedForRef,
        scenario,
        aiEvaluationResults,
      );
      resolvedItemsMap.set(scopedKey, item);
      if (item.instance) {
        consumedForRef.add(item.instance.instanceId);
        instanceConsumptionByRef.set(ref, consumedForRef);
        this.logger.log(
          `[SEQ_GROUPS] Group "${group.label ?? group.id}" resolved ref "${ref}" occ#${occ} → instance ${item.instance.instanceId} at ${item.completedAtSeconds}s`,
        );
      } else {
        this.logger.log(
          `[SEQ_GROUPS] Group "${group.label ?? group.id}" resolved ref "${ref}" occ#${occ} → NOT COMPLETED`,
        );
      }
    }
  }

  /**
   * Find all available (unconsumed) instances for a ref
   */
  private findAvailableInstances(
    ref: string,
    allInstances: EventInstance[],
    consumedInstanceIds: Set<string>,
    scenario: Scenario | undefined,
    _aiEvaluationResults: Map<
      string,
      Array<{ matched: boolean; evidence?: string; timestamp?: number; orderValue?: number }>
    >,
  ): EventInstance[] {
    const aliases = this.resolveRefAliases(ref, scenario);
    const normalizedAliases = aliases.map((a) => this.normalizeForMatch(a));
    const normalizedRef = this.normalizeForMatch(ref);

    // Check if this is an order-related ref (order. or medorder.)
    const isOrderRef = ref.startsWith('order.') || ref.startsWith('medorder.');

    const candidates = allInstances.filter((i) => {
      if (consumedInstanceIds.has(i.instanceId)) {
        return false;
      }

      // For order/medorder refs, enforce strict prefix matching
      // order.X should NOT match medorder.X even if they have overlapping aliases
      if (isOrderRef) {
        const instIsOrderRef = i.ref.startsWith('order.') || i.ref.startsWith('medorder.');
        if (instIsOrderRef) {
          // Both are order refs - extract the prefix and base ID
          const refPrefix = ref.split('.')[0]; // "order" or "medorder"
          const instPrefix = i.ref.split('.')[0]; // "order" or "medorder"
          const refBase = ref.substring(ref.indexOf('.') + 1); // "order_123"
          const instBase = i.ref.substring(i.ref.indexOf('.') + 1); // "order_123"

          this.logger.log(
            `[ORDER_MATCH] Checking ref="${ref}" (prefix:"${refPrefix}", base:"${refBase}") vs instance="${i.ref}" (prefix:"${instPrefix}", base:"${instBase}")`,
          );

          // Must have same prefix AND same base ID
          if (refPrefix === instPrefix && refBase === instBase) {
            this.logger.log(`[ORDER_MATCH] ✅ MATCH - Same prefix and base ID`);
            return true;
          }
          // Different prefixes - don't match even if base ID is same
          this.logger.log(
            `[ORDER_MATCH] ❌ NO MATCH - Different prefixes (${refPrefix} != ${instPrefix})`,
          );
          return false;
        }
      }

      // Standard alias matching for non-order refs
      const nr = this.normalizeForMatch(i.ref);
      return nr === normalizedRef || normalizedAliases.includes(nr);
    });

    // Sort by time (earliest first)
    return candidates.sort((a, b) => {
      const aTime =
        a.orderValue ?? (a.elapsedSeconds !== undefined ? a.elapsedSeconds * 1000 : Infinity);
      const bTime =
        b.orderValue ?? (b.elapsedSeconds !== undefined ? b.elapsedSeconds * 1000 : Infinity);
      return aTime - bTime;
    });
  }

  private evaluateTimingConstraints(
    group: SequenceGroupDefinition,
    resolvedItems: Map<string, ResolvedGroupItem>,
    scenario: Scenario | undefined,
  ): GroupScoringResult[] {
    const results: GroupScoringResult[] = [];
    for (const item of group.items) {
      const r = this.evaluateSingleItemTiming(item, group, resolvedItems, scenario);
      if (r) {
        results.push(r);
      }
    }
    if (group.subgroups) {
      for (const sg of group.subgroups) {
        for (const item of sg.items) {
          const r = this.evaluateSingleItemTiming(item, group, resolvedItems, scenario);
          if (r) {
            results.push(r);
          }
        }
      }
    }
    return results;
  }

  private evaluateSingleItemTiming(
    item: string | SequenceItem,
    group: SequenceGroupDefinition,
    resolvedItems: Map<string, ResolvedGroupItem>,
    scenario: Scenario | undefined,
  ): GroupScoringResult | null {
    if (typeof item === 'string') {
      return null;
    }
    const timing = item.timing;
    const referenceItemRef = item.timingReferenceItem;
    if (!timing || timing.mode !== 'withinMinutes' || !referenceItemRef) {
      return null;
    }
    const thresholdMinutes = timing.withinMinutesFromStart;
    const thresholdSeconds = thresholdMinutes * 60;
    const currentRef = item.id;
    const currentResolved = resolvedItems.get(`${group.id}:item:${currentRef}:0`);

    // Check if reference is a subgroup
    let referenceResolved: ResolvedGroupItem | undefined;
    let isSubgroupReference = false;
    let subgroupNotCompletedItems: string[] = [];

    if (referenceItemRef.startsWith('subgroup:')) {
      isSubgroupReference = true;
      const subgroupId = referenceItemRef.substring('subgroup:'.length);
      const subgroup = group.subgroups?.find((sg) => sg.id === subgroupId);

      if (subgroup) {
        // Get all items in the subgroup
        const subgroupItemRefs = subgroup.items.map((i) => (typeof i === 'string' ? i : i.id));
        const sgOccurrences = this.getSubgroupItemOccurrences(group).get(subgroupId) ?? [];
        const resolvedSubgroupItems = subgroupItemRefs.map((ref, idx) => ({
          ref,
          resolved: resolvedItems.get(`${group.id}:item:${ref}:${sgOccurrences[idx] ?? idx}`),
        }));

        // Check if ALL items in the subgroup are completed
        const allCompleted = resolvedSubgroupItems.every((item) => item.resolved?.completed);
        const completedItems = resolvedSubgroupItems.filter((item) => item.resolved?.completed);

        if (!allCompleted) {
          // Track which items were not completed
          subgroupNotCompletedItems = resolvedSubgroupItems
            .filter((item) => !item.resolved?.completed)
            .map(
              (item) => item.resolved?.label ?? this.resolveDisplayLabelForRef(item.ref, scenario),
            );
        }

        if (allCompleted && completedItems.length > 0) {
          // All items completed - use the last completed item's time as the subgroup completion time
          const lastCompletedTime = Math.max(
            ...completedItems.map((item) => item.resolved?.completedAtSeconds ?? 0),
          );
          referenceResolved = {
            ref: referenceItemRef,
            label: subgroup.label ?? `Subgroup ${subgroupId}`,
            completed: true,
            completedAtSeconds: lastCompletedTime,
          };
        } else {
          // Not all items were completed
          referenceResolved = {
            ref: referenceItemRef,
            label: subgroup.label ?? `Subgroup ${subgroupId}`,
            completed: false,
          };
        }
      }
    } else {
      referenceResolved = resolvedItems.get(`${group.id}:item:${referenceItemRef}:0`);
    }

    const currentLabel =
      currentResolved?.label ?? this.resolveDisplayLabelForRef(currentRef, scenario);
    const referenceLabel =
      referenceResolved?.label ?? this.resolveDisplayLabelForRef(referenceItemRef, scenario);
    const label = `Timing: "${currentLabel}" within ${thresholdMinutes} min of "${referenceLabel}"`;
    if (!currentResolved?.completed || !referenceResolved?.completed) {
      let failedReason: string;
      if (!currentResolved?.completed) {
        failedReason = `"${currentLabel}" was not completed.`;
      } else if (isSubgroupReference && subgroupNotCompletedItems.length > 0) {
        // Specific message for incomplete subgroup items
        const itemsList = subgroupNotCompletedItems.join(', ');
        failedReason = `Not all items in "${referenceLabel}" were completed. Missing: ${itemsList}`;
      } else {
        failedReason = `"${referenceLabel}" was not completed.`;
      }

      return {
        id: `timing_${currentRef}_${referenceItemRef}`,
        label,
        type: 'timing',
        passed: false,
        failedReasons: [failedReason],
        rationale: 'Cannot validate timing — required item not completed.',
      };
    }

    // Calculate time difference (current - reference)
    // Must be positive (current comes after reference) and within threshold
    const timeDiff =
      (currentResolved.completedAtSeconds ?? 0) - (referenceResolved.completedAtSeconds ?? 0);

    this.logger.log(
      `[TIMING_EVAL] Group "${group.label ?? group.id}": "${currentLabel}" (${currentResolved.completedAtSeconds}s) vs "${referenceLabel}" (${referenceResolved.completedAtSeconds}s) = ${timeDiff}s`,
    );

    // Check if current item was performed BEFORE the reference item
    if (timeDiff < 0) {
      return {
        id: `timing_${currentRef}_${referenceItemRef}`,
        label,
        type: 'timing',
        passed: false,
        failedReasons: [
          `"${currentLabel}" was performed BEFORE "${referenceLabel}". It must be performed AFTER "${referenceLabel}" and within ${this.formatSecondsToTime(thresholdSeconds)} minutes.`,
        ],
        rationale: `Timing violation: Item performed in wrong order (${this.formatSecondsToTime(Math.abs(timeDiff))} before reference item).`,
      };
    }

    // Check if time difference exceeds threshold
    if (timeDiff > thresholdSeconds) {
      return {
        id: `timing_${currentRef}_${referenceItemRef}`,
        label,
        type: 'timing',
        passed: false,
        failedReasons: [
          `"${currentLabel}" was performed ${this.formatSecondsToTime(timeDiff)} after "${referenceLabel}", exceeding the ${this.formatSecondsToTime(thresholdSeconds)} window.`,
        ],
        rationale: `Timing violation: ${this.formatSecondsToTime(timeDiff)} exceeds ${this.formatSecondsToTime(thresholdSeconds)} limit.`,
      };
    }
    return {
      id: `timing_${currentRef}_${referenceItemRef}`,
      label,
      type: 'timing',
      passed: true,
      failedReasons: [],
      rationale: 'Timing requirement met.',
    };
  }

  private getAllItemRefsFromGroup(group: SequenceGroupDefinition): string[] {
    return [
      ...group.items.map(getItemId),
      ...(group.subgroups ?? []).flatMap((sg) => sg.items.map(getItemId)),
    ];
  }

  private getOrderedChildren(group: SequenceGroupDefinition): Array<
    | { type: 'item'; ref: string }
    | {
        type: 'subgroup';
        subgroup: {
          id: string;
          label?: string;
          items: (string | SequenceItem)[];
          mode: 'strict' | 'flexible';
        };
      }
  > {
    const children: Array<
      | { type: 'item'; ref: string }
      | {
          type: 'subgroup';
          subgroup: {
            id: string;
            label?: string;
            items: (string | SequenceItem)[];
            mode: 'strict' | 'flexible';
          };
        }
    > = [];
    if (group.childOrder && group.childOrder.length > 0) {
      for (const orderId of group.childOrder) {
        if (orderId.startsWith('subgroup:')) {
          const sg = group.subgroups?.find((s) => s.id === orderId.substring('subgroup:'.length));
          if (sg) {
            children.push({ type: 'subgroup', subgroup: sg });
          }
        } else {
          if (group.items.some((i) => getItemId(i) === orderId)) {
            children.push({ type: 'item', ref: orderId });
          }
        }
      }
    } else {
      for (const item of group.items) {
        children.push({ type: 'item', ref: getItemId(item) });
      }
      if (group.subgroups) {
        for (const sg of group.subgroups) {
          children.push({ type: 'subgroup', subgroup: sg });
        }
      }
    }
    return children;
  }

  private resolveItemFromInstances(
    ref: string,
    allInstances: EventInstance[],
    consumedInstanceIds: Set<string>,
    scenario: Scenario | undefined,
    aiEvaluationResults: Map<
      string,
      Array<{ matched: boolean; evidence?: string; timestamp?: number; orderValue?: number }>
    >,
    minTime?: number,
  ): ResolvedGroupItem {
    const label = this.resolveDisplayLabelForRef(ref, scenario);
    const aliases = this.resolveRefAliases(ref, scenario);
    const normalizedAliases = aliases.map((a) => this.normalizeForMatch(a));
    const normalizedRef = this.normalizeForMatch(ref);

    // Check if this is an order-related ref (order. or medorder.)
    const isOrderRef = ref.startsWith('order.') || ref.startsWith('medorder.');

    const aiResult = aiEvaluationResults.get(ref);
    if (aiResult && aiResult.length > 0) {
      for (const occ of aiResult) {
        if (occ.matched) {
          const inst = allInstances.find((i) => {
            if (consumedInstanceIds.has(i.instanceId)) {
              return false;
            }

            // For order/medorder refs, enforce strict prefix matching
            if (isOrderRef) {
              const instIsOrderRef = i.ref.startsWith('order.') || i.ref.startsWith('medorder.');
              if (instIsOrderRef) {
                const refPrefix = ref.split('.')[0];
                const instPrefix = i.ref.split('.')[0];
                const refBase = ref.substring(ref.indexOf('.') + 1);
                const instBase = i.ref.substring(i.ref.indexOf('.') + 1);

                if (refPrefix !== instPrefix || refBase !== instBase) {
                  return false;
                }
              }
            }

            const nr = this.normalizeForMatch(i.ref);
            if (nr !== normalizedRef && !normalizedAliases.includes(nr)) {
              return false;
            }
            if (occ.timestamp !== undefined && i.elapsedSeconds !== undefined) {
              return Math.abs(i.elapsedSeconds - occ.timestamp) < 2;
            }
            return true;
          });
          if (inst) {
            return {
              ref,
              label,
              completed: true,
              completedAtSeconds: inst.elapsedSeconds,
              orderValue: inst.orderValue,
              instance: inst,
            };
          }
          return {
            ref,
            label,
            completed: true,
            completedAtSeconds: occ.timestamp,
            orderValue: occ.orderValue,
          };
        }
      }
    }
    const candidates = allInstances.filter((i) => {
      if (consumedInstanceIds.has(i.instanceId)) {
        return false;
      }

      // For order/medorder refs, enforce strict prefix matching
      if (isOrderRef) {
        const instIsOrderRef = i.ref.startsWith('order.') || i.ref.startsWith('medorder.');
        if (instIsOrderRef) {
          const refPrefix = ref.split('.')[0];
          const instPrefix = i.ref.split('.')[0];
          const refBase = ref.substring(ref.indexOf('.') + 1);
          const instBase = i.ref.substring(i.ref.indexOf('.') + 1);

          this.logger.log(
            `[RESOLVE_ITEM] Checking ref="${ref}" (prefix:"${refPrefix}", base:"${refBase}") vs instance="${i.instanceId}:${i.ref}" (prefix:"${instPrefix}", base:"${instBase}")`,
          );

          // Must have same prefix AND same base ID
          if (refPrefix === instPrefix && refBase === instBase) {
            this.logger.log(`[RESOLVE_ITEM] ✅ MATCH - Same prefix and base ID`);
            return true;
          }
          // Different prefixes - don't match
          this.logger.log(
            `[RESOLVE_ITEM] ❌ NO MATCH - Different prefixes (${refPrefix} != ${instPrefix})`,
          );
          return false;
        }
      }

      const nr = this.normalizeForMatch(i.ref);
      return nr === normalizedRef || normalizedAliases.includes(nr);
    });
    if (candidates.length === 0) {
      this.logger.log(`[RESOLVE_ITEM] No candidates found for ref="${ref}"`);
      return { ref, label, completed: false };
    }
    this.logger.log(
      `[RESOLVE_ITEM] Found ${candidates.length} candidates for ref="${ref}": [${candidates.map((c) => c.instanceId).join(', ')}]`,
    );

    // If minTime is set (strict ordering), prefer the earliest instance at or after minTime.
    // This means a late-but-correct attempt is chosen over an early-but-wrong one.
    // Only fall back to absolute-earliest if no instance satisfies minTime.
    let best: EventInstance;
    if (minTime !== undefined && minTime > 0) {
      const afterMin = candidates.filter((c) => {
        const t =
          c.orderValue ?? (c.elapsedSeconds !== undefined ? c.elapsedSeconds * 1000 : Infinity);
        return t >= minTime;
      });
      const pool = afterMin.length > 0 ? afterMin : candidates;
      best = pool.reduce((e, c) => {
        const et =
          e.orderValue ?? (e.elapsedSeconds !== undefined ? e.elapsedSeconds * 1000 : Infinity);
        const ct =
          c.orderValue ?? (c.elapsedSeconds !== undefined ? c.elapsedSeconds * 1000 : Infinity);
        return ct < et ? c : e;
      });
      if (afterMin.length === 0) {
        this.logger.log(
          `[RESOLVE_ITEM] No candidate >= minTime ${minTime}ms for ref="${ref}"; using earliest as fallback`,
        );
      } else {
        this.logger.log(
          `[RESOLVE_ITEM] Chose instance at ${best.elapsedSeconds}s (minTime=${minTime}ms) for ref="${ref}"`,
        );
      }
    } else {
      best = candidates.reduce((e, c) => {
        const et =
          e.orderValue ?? (e.elapsedSeconds !== undefined ? e.elapsedSeconds * 1000 : Infinity);
        const ct =
          c.orderValue ?? (c.elapsedSeconds !== undefined ? c.elapsedSeconds * 1000 : Infinity);
        return ct < et ? c : e;
      });
    }
    return {
      ref,
      label,
      completed: true,
      completedAtSeconds: best.elapsedSeconds,
      orderValue: best.orderValue,
      instance: best,
    };
  }

  private groupResultToParentResult(result: GroupScoringResult): SequencingParentResult {
    return {
      parentRef: result.id,
      parentLabel: result.label,
      passed: result.passed,
      assessmentPassed: true,
      beforePassed: result.passed,
      afterPassed: result.passed,
      orderPassed: result.passed,
      timingPassed: result.type === 'timing' ? result.passed : true,
      afterTimingPassed: true,
      failedReasons: result.failedReasons,
      detailedContext: { parentCompleted: true },
    };
  }

  private getUserFriendlyMessage(
    result: GroupScoringResult,
    groups: SequenceGroupDefinition[],
    scenario: Scenario | undefined,
  ): { point: string; example: string } {
    // For overall groups
    if (result.type === 'overall') {
      if (result.passed) {
        // Check if it's strict or flexible mode from the label
        const isStrict = result.label.includes('Strict');
        const groupLabels = groups.map((g) => g.label ?? g.id).join(' → ');

        if (isStrict) {
          return {
            point: 'Overall Sequencing: Grouped items were performed in appropriate sequence',
            example: `You successfully completed all sequence groups in the expected order: ${groupLabels}. ${result.rationale ?? ''}`,
          };
        } else {
          return {
            point: 'Overall Sequencing: Grouped items were performed in appropriate sequence',
            example: `You completed all groups without interrupting one group with items from another. Groups completed: ${groupLabels}.`,
          };
        }
      } else {
        // Display all failure reasons
        const failures = result.failedReasons.length > 0 ? result.failedReasons : [];
        const groupLabels = groups.map((g) => g.label ?? g.id).join(' → ');

        if (failures.length > 0) {
          // If multiple issues, provide clear summary
          if (failures.length > 1) {
            // Extract group names from failures for summary
            const summary = `You need to complete all items in one group before starting the next. Expected order: ${groupLabels}.`;
            const issueList = failures.map((f, idx) => `${idx + 1}. ${f}`).join('\n');
            return {
              point: `Overall Sequencing: ${failures.length} issues found`,
              example: `${summary}\n\nSpecific issues:\n${issueList}`,
            };
          } else {
            // Single issue
            return {
              point: 'Overall Sequencing: Groups not completed in correct order',
              example: failures[0],
            };
          }
        }

        // Fallback if no specific failure reasons
        return {
          point: 'Overall Sequencing: Groups not completed in correct order',
          example: `Groups should be completed in this order: ${groupLabels}. Make sure to finish all items in one group before starting the next.`,
        };
      }
    }

    // For timing constraints
    if (result.type === 'timing') {
      const point = result.passed
        ? `Timing requirement met: ${result.label.replace('Timing: ', '').replace(/"/g, '')}`
        : `Timing requirement not met: ${result.label.replace('Timing: ', '').replace(/"/g, '')}`;
      return {
        point,
        example: result.passed
          ? (result.rationale ?? 'Items were performed within the required timeframe.')
          : (result.failedReasons[0] ?? 'Items were not performed within the required timeframe.'),
      };
    }

    // For groups and subgroups - include item names with details
    // Remove prefix: 'group_' or 'subgroup_' (do subgroup first to avoid partial match)
    const groupId = result.id.startsWith('subgroup_')
      ? result.id.substring('subgroup_'.length)
      : result.id.replace('group_', '');
    let itemsListForPoint = ''; // Full list for point display
    let groupLabel = result.label;
    let totalItems = 0;
    let actualItemNames: string[] = [];

    if (result.type === 'group') {
      const group = groups.find((g) => g.id === groupId);
      if (group) {
        const allRefs = this.getAllItemRefsFromGroup(group);
        totalItems = allRefs.length;
        actualItemNames = allRefs
          .map((ref) => this.resolveDisplayLabelForRef(ref, scenario))
          .filter((label) => label && label.length > 0); // Filter out empty labels

        // For point display: show items with arrows in strict mode, commas in flexible
        const isStrictMode = result.label.includes('Strict');
        const separator = isStrictMode ? ' → ' : ', ';
        itemsListForPoint = actualItemNames.join(separator);

        groupLabel = group.label ?? group.id;
      }
    } else if (result.type === 'subgroup') {
      // Find the subgroup by searching through all groups
      // The groupId is the subgroup.id after stripping the 'subgroup_' prefix
      for (const group of groups) {
        if (!group.subgroups) {
          continue;
        }

        const subgroup = group.subgroups.find((sg) => sg.id === groupId);
        if (subgroup) {
          totalItems = subgroup.items.length;

          // Extract item names from the subgroup
          actualItemNames = subgroup.items
            .map((item) => this.resolveDisplayLabelForRef(getItemId(item), scenario))
            .filter((label) => label && label.length > 0); // Filter out empty labels

          // For point display: show items with arrows in strict mode, commas in flexible
          const isStrictMode = result.label.includes('Strict');
          const separator = isStrictMode ? ' → ' : ', ';
          itemsListForPoint = actualItemNames.join(separator);

          // Include parent group name to disambiguate subgroups with same name
          const parentGroupLabel = group.label ?? group.id;
          const subgroupLabel = subgroup.label ?? subgroup.id;
          groupLabel = `${parentGroupLabel} > ${subgroupLabel}`;
          break;
        }
      }
    }

    const isStrict = result.label.includes('Strict');
    const modeDescription = isStrict ? 'in the specified order' : 'in any order';

    // Check if we have actual item names
    const hasActualItemNames = actualItemNames.length > 0;

    if (result.passed) {
      // For passed results, show item sequence in the point with group name
      let pointText: string;

      if (hasActualItemNames && actualItemNames.length > 0) {
        const separator = isStrict ? ' → ' : ', ';

        // For subgroups, use just the subgroup name (not full path) for conciseness
        let displayLabel = groupLabel;
        if (groupLabel.includes(' > ')) {
          // Extract just the subgroup name from "Group A > Subgroup A"
          displayLabel = groupLabel.split(' > ').pop() ?? groupLabel;
        }
        const groupNamePrefix = `(${displayLabel}) `;

        if (totalItems <= 6) {
          pointText = `Correctly sequenced: ${groupNamePrefix}${itemsListForPoint}`;
        } else {
          const displayItems = actualItemNames.slice(0, 4).join(separator);
          pointText = `Correctly sequenced: ${groupNamePrefix}${displayItems} → and ${totalItems - 4} more`;
        }
      } else {
        pointText = `${groupLabel}`;
      }

      // Build simple success example
      const successExample = isStrict
        ? 'All items were performed in the correct sequence.'
        : 'All required items were completed.';

      return {
        point: pointText,
        example: successExample,
      };
    } else {
      // Handle multiple failures
      const failures = result.failedReasons.length > 0 ? result.failedReasons : [];

      // Build natural context about items - show them clearly
      let itemsContext: string;
      if (hasActualItemNames && actualItemNames.length > 0) {
        // We have configured item names to show
        const separator = isStrict ? ' → ' : ', ';
        if (totalItems <= 8) {
          // Show all items
          itemsContext = `This ${result.type} includes: ${actualItemNames.join(separator)}.`;
        } else {
          // Show first 6 items
          const displayItems = actualItemNames.slice(0, 6).join(separator);
          itemsContext = `This ${result.type} includes ${totalItems} items: ${displayItems}${separator}and ${totalItems - 6} more.`;
        }
      } else if (totalItems > 0) {
        // We know how many items but not their names
        itemsContext = `This ${result.type} has ${totalItems} required item${totalItems !== 1 ? 's' : ''}.`;
      } else {
        // No items configured (shouldn't happen, but handle gracefully)
        itemsContext = `This ${result.type} has no configured items.`;
      }

      if (failures.length > 1) {
        // Multiple issues - list them all
        const issueList = failures.map((f, idx) => `  ${idx + 1}. ${f}`).join('\n');
        return {
          point: `${groupLabel} (${failures.length} issues)`,
          example: `${itemsContext}\n\nIssues:\n${issueList}`,
        };
      } else if (failures.length === 1) {
        // Single issue - provide detailed context
        let detailedExample = failures[0];

        // Check if this is a "not completed" failure
        const isNotCompletedFailure =
          detailedExample.includes('not completed') ||
          detailedExample.includes('were not performed');

        if (isNotCompletedFailure) {
          // For "not completed" failures, be clear and concise
          if (hasActualItemNames && actualItemNames.length > 0) {
            // Check if ALL items were not completed
            const allNotCompleted =
              detailedExample.includes(`${totalItems} item`) ||
              (detailedExample.match(/not completed/g) ?? []).length === 1;

            if (allNotCompleted && detailedExample.includes(`${totalItems} item`)) {
              // All items were not completed - show what items exist, then the failure
              return {
                point: `${groupLabel}`,
                example: `${itemsContext} No items were completed.`,
              };
            } else {
              // Some items were not completed - show which ones
              return {
                point: `${groupLabel}`,
                example: `${itemsContext} ${detailedExample}`,
              };
            }
          } else {
            detailedExample = `${itemsContext} ${detailedExample} Make sure to complete all required items.`;
          }
        } else if (detailedExample.includes('interrupted')) {
          // For interruptions, provide clear guidance
          return {
            point: `${groupLabel} - Interrupted`,
            example: `${itemsContext}\n\n${detailedExample}`,
          };
        } else if (detailedExample.includes('before') && !detailedExample.includes('interrupted')) {
          detailedExample = `${detailedExample} ${isStrict ? 'Complete items in the order listed.' : ''}`;
        }

        return {
          point: `${groupLabel}`,
          example: `${itemsContext} ${detailedExample}`,
        };
      } else {
        // Fallback
        return {
          point: `${groupLabel}`,
          example: `${itemsContext} Items were not performed ${modeDescription}.`,
        };
      }
    }
  }

  private collectQuestionAskedRequirementsFromGroups(
    scenario: Scenario | undefined,
    groups: SequenceGroupDefinition[],
  ): Array<{ ref: string; label: string; aliases: string[] }> {
    const reqs: Array<{ ref: string; label: string; aliases: string[] }> = [];
    const visited = new Set<string>();
    for (const group of groups) {
      for (const item of [...group.items, ...(group.subgroups ?? []).flatMap((sg) => sg.items)]) {
        if (typeof item === 'string') {
          continue;
        }
        if (item.assessmentMethod === 'questionAsked' && !visited.has(item.id)) {
          visited.add(item.id);
          reqs.push({
            ref: item.id,
            label: this.resolveDisplayLabelForRef(item.id, scenario),
            aliases: this.resolveRefAliases(item.id, scenario),
          });
        }
      }
    }
    return reqs;
  }

  private collectActionAttempts(
    actionsTimeline: SequencingEnrichedEntry[] | undefined,
    studentSummary: StudentSummary | undefined,
    scenarioStartMs: number | undefined,
  ): Array<{ id?: string; title?: string; elapsedSeconds?: number; orderValue?: number }> {
    const actionAttempts: Array<{
      id?: string;
      title?: string;
      elapsedSeconds?: number;
      orderValue?: number;
    }> = [];
    const summaryActions = Array.isArray((studentSummary as Record<string, unknown>)?.actions)
      ? ((studentSummary as Record<string, unknown>).actions as Array<unknown>)
      : [];
    const summaryMeds = Array.isArray((studentSummary as Record<string, unknown>)?.medications)
      ? ((studentSummary as Record<string, unknown>).medications as Array<unknown>)
      : [];
    const actionsToProcess = [...summaryActions, ...summaryMeds, ...(actionsTimeline ?? [])];
    actionsToProcess.forEach((entry: unknown) => {
      const rec = entry as Record<string, unknown>;
      const cat = typeof rec.category === 'string' ? rec.category : undefined;
      if (cat === 'vitals' && !(rec.vitals && typeof rec.vitals === 'object')) {
        return;
      }
      const title = typeof rec.title === 'string' ? rec.title : '';
      const details = typeof rec.details === 'string' ? rec.details : '';
      if (title === 'Team Communication' && !details.includes('Result:')) {
        return;
      }
      const elapsedSeconds = this.resolveElapsedSeconds(rec, scenarioStartMs);
      const orderValue = this.resolveOrderValue(rec, scenarioStartMs);
      const ae: Record<string, unknown> = {
        id: typeof rec.id === 'string' ? rec.id : undefined,
        title:
          typeof rec.title === 'string'
            ? rec.title
            : typeof rec.label === 'string'
              ? rec.label
              : undefined,
        elapsedSeconds,
        orderValue,
      };
      if (rec.administrationDetails && typeof rec.administrationDetails === 'object') {
        ae.administrationDetails = rec.administrationDetails;
      }
      actionAttempts.push(ae);
      if (rec.vitals && typeof rec.vitals === 'object') {
        const vitals = rec.vitals as Record<string, unknown>;
        const parentId = typeof rec.id === 'string' ? rec.id : undefined;

        // Map of vital field keys to their standardized names (for frontend compatibility)
        const vitalKeyMap: Record<string, string> = {
          hr: 'heartRate',
          heartRate: 'heartRate',
          pulse: 'heartRate',
          bp: 'bloodPressure',
          bloodPressure: 'bloodPressure',
          temp: 'temperature',
          temperature: 'temperature',
          rr: 'respiratoryRate',
          respiratoryRate: 'respiratoryRate',
          spo2: 'spO2',
          spO2: 'spO2',
          o2sat: 'spO2',
          weight: 'weight',
          height: 'height',
        };

        for (const vt of Object.keys(vitalKeyMap)) {
          const arr = vitals[vt];
          if (Array.isArray(arr)) {
            arr.forEach((v: unknown) => {
              if (v && typeof v === 'object') {
                const vr = v as Record<string, unknown>;
                const ve = this.resolveElapsedSeconds(vr, scenarioStartMs);
                const vo = this.resolveOrderValue(vr, scenarioStartMs);
                const vTitle = typeof vr.title === 'string' ? vr.title : `${vt} recorded`;
                const standardizedKey = vitalKeyMap[vt];

                actionAttempts.push({
                  id: typeof vr.id === 'string' ? vr.id : undefined,
                  title: vTitle,
                  elapsedSeconds: ve,
                  orderValue: vo,
                });

                // Add instances with both the original key and standardized key for compatibility
                if (parentId) {
                  actionAttempts.push({
                    id: `vital.${parentId}.${vt}`,
                    title: vTitle,
                    elapsedSeconds: ve,
                    orderValue: vo,
                  });
                  // Also add with standardized key (heartRate, bloodPressure, etc.) for frontend compatibility
                  if (standardizedKey !== vt) {
                    actionAttempts.push({
                      id: `vital.${parentId}.${standardizedKey}`,
                      title: vTitle,
                      elapsedSeconds: ve,
                      orderValue: vo,
                    });
                  }
                }
              }
            });
          }
        }
      }
    });
    actionAttempts.sort(
      (a, b) =>
        (a.orderValue ?? Number.MAX_SAFE_INTEGER) - (b.orderValue ?? Number.MAX_SAFE_INTEGER),
    );
    return actionAttempts;
  }

  private createEventInstances(
    studentMessages: Array<{ text: string; elapsedSeconds?: number; orderValue?: number }>,
    fieldEntries: Array<{
      id?: string;
      title: string;
      details: string;
      category?: string;
      elapsedSeconds?: number;
      orderValue?: number;
    }>,
    actionAttempts: Array<{
      id?: string;
      title?: string;
      elapsedSeconds?: number;
      orderValue?: number;
    }>,
    scenario: Scenario | undefined,
    aiEvaluationResults: Map<
      string,
      Array<{ matched: boolean; evidence?: string; timestamp?: number; orderValue?: number }>
    >,
  ): EventInstance[] {
    const instances: EventInstance[] = [];
    const seenInstances = new Map<string, boolean>(); // Track unique instances: ref+time
    let c = 0;

    for (const a of actionAttempts) {
      if (!a.id) {
        continue;
      }
      const ar = a as Record<string, unknown>;
      const ad = ar.administrationDetails as Record<string, unknown> | undefined;
      const medId = typeof ad?.medicationId === 'string' ? ad.medicationId : undefined;
      const t = typeof a.title === 'string' ? a.title : '';
      let ref: string;
      if (t === 'Team Communication') {
        ref = 'teamCommunication.general';
      } else if (medId) {
        ref = `medorder.${medId}`;
      } else {
        ref = a.id;
      }

      // Create unique key: ref + elapsed time
      const uniqueKey = `${ref}|${a.elapsedSeconds ?? 0}|${a.orderValue ?? 0}`;
      if (seenInstances.has(uniqueKey)) {
        // Skip duplicate
        continue;
      }
      seenInstances.set(uniqueKey, true);

      instances.push({
        instanceId: `i_${++c}`,
        ref,
        elapsedSeconds: a.elapsedSeconds,
        orderValue: a.orderValue,
        source: 'actionTimeline',
        evidence: a.title ?? a.id,
        title: a.title,
        originalId: a.id,
      });

      this.logger.log(
        `[CREATE_INSTANCE] Created instance i_${c}: ref="${ref}", source=actionTimeline, time=${a.elapsedSeconds}s, originalId=${a.id}`,
      );
    }
    for (const f of fieldEntries) {
      let ref: string;
      const cat = this.inferFieldCategory(f);
      if (cat === 'order') {
        ref = this.mapOrderTitleToRef(f.title, scenario) ?? f.id ?? f.title;
      } else if (cat === 'demographics' || cat === 'history') {
        ref = this.mapFieldToPatientRef(f.title, f.id) ?? f.id ?? f.title;
      } else {
        ref = f.id ?? f.title;
      }

      // Create unique key: ref + elapsed time
      const uniqueKey = `${ref}|${f.elapsedSeconds ?? 0}|${f.orderValue ?? 0}`;
      if (seenInstances.has(uniqueKey)) {
        // Skip duplicate
        continue;
      }
      seenInstances.set(uniqueKey, true);

      instances.push({
        instanceId: `i_${++c}`,
        ref,
        elapsedSeconds: f.elapsedSeconds,
        orderValue: f.orderValue,
        source: 'fieldUpdate',
        evidence: `${f.title}: ${f.details}`,
        title: f.title,
        originalId: f.id,
      });

      this.logger.log(
        `[CREATE_INSTANCE] Created instance i_${c}: ref="${ref}", source=fieldUpdate, time=${f.elapsedSeconds}s, category=${cat}, title="${f.title}"`,
      );
    }
    aiEvaluationResults.forEach((occs, ref) => {
      for (const o of occs) {
        if (o.matched) {
          // Create unique key: ref + elapsed time
          const uniqueKey = `${ref}|${o.timestamp ?? 0}|${o.orderValue ?? 0}`;
          if (seenInstances.has(uniqueKey)) {
            // Skip duplicate
            continue;
          }
          seenInstances.set(uniqueKey, true);

          instances.push({
            instanceId: `i_${++c}`,
            ref,
            elapsedSeconds: o.timestamp,
            orderValue: o.orderValue,
            source: 'transcript',
            evidence: o.evidence ?? 'Question asked',
            title: o.evidence,
            originalId: undefined,
          });
        }
      }
    });
    instances.sort(
      (a, b) =>
        (a.orderValue ?? Number.MAX_SAFE_INTEGER) - (b.orderValue ?? Number.MAX_SAFE_INTEGER),
    );

    this.logger.log(
      `[SEQ_GROUPS] Created ${instances.length} unique event instances (deduplicated from ${actionAttempts.length + fieldEntries.length + Array.from(aiEvaluationResults.values()).reduce((sum, occs) => sum + occs.filter((o) => o.matched).length, 0)} total events)`,
    );

    return instances;
  }

  private async batchEvaluateQuestionAskedWithAI(
    requirements: Array<{ ref: string; label: string; aliases: string[] }>,
    studentMessages: Array<{ text: string; elapsedSeconds?: number; orderValue?: number }>,
    _scenario: Scenario | undefined,
  ): Promise<
    Map<
      string,
      Array<{ matched: boolean; evidence?: string; timestamp?: number; orderValue?: number }>
    >
  > {
    const results = new Map<
      string,
      Array<{ matched: boolean; evidence?: string; timestamp?: number; orderValue?: number }>
    >();
    for (const req of requirements) {
      results.set(req.ref, []);
    }
    if (requirements.length === 0 || studentMessages.length === 0) {
      return results;
    }
    if (!this.aiGateway.isConfigured()) {
      return this.deterministicQuestionMatching(requirements, studentMessages);
    }
    try {
      const aiPrompt = `You are a clinical assessment AI evaluating student intent during a nursing simulation.\n\nAnalyze the student's transcript messages to determine if they asked for specific patient information.\n\nCRITICAL RULES:\n- Evaluate INTENT and MEANING, not exact wording\n- ANY question requesting the information counts\n- Accept synonyms, indirect questions, compound questions\n- Return ALL occurrences\n\nREQUIREMENTS:\n${requirements.map((r) => `- ${r.ref} (Label: "${r.label}")\n  Aliases: ${r.aliases.join(', ')}`).join('\n')}\n\nSTUDENT TRANSCRIPT:\n${studentMessages.map((m) => `[${m.elapsedSeconds ?? '?'}s] Student: ${m.text}`).join('\n')}\n\nRETURN ONLY VALID JSON:\n{"evaluations": {"ref": {"occurrences": [{"evidence": "quote", "messageIndex": 0}]}, ...}}`;
      const parsed = await this.aiGateway.completeJson<AiQuestionMatchingEvaluation>({
        caller: 'reports.sequencing-question-matching',
        messages: [
          { role: AiMessageRole.System, content: 'Always return valid JSON only.' },
          { role: AiMessageRole.User, content: aiPrompt },
        ],
        temperature: SEQUENCING_AI_TEMPERATURE,
        maxTokens: SEQUENCING_AI_MAX_TOKENS,
      });
      const evaluations = parsed.evaluations ?? {};
      for (const req of requirements) {
        const ev = evaluations[req.ref];
        if (!ev || !Array.isArray(ev.occurrences)) {
          continue;
        }
        const matched: Array<{
          matched: boolean;
          evidence?: string;
          timestamp?: number;
          orderValue?: number;
        }> = [];
        const used = new Set<number>();
        for (const o of ev.occurrences) {
          let msg: (typeof studentMessages)[0] | undefined;
          if (
            o.messageIndex !== undefined &&
            o.messageIndex >= 0 &&
            o.messageIndex < studentMessages.length &&
            !used.has(o.messageIndex)
          ) {
            msg = studentMessages[o.messageIndex];
            used.add(o.messageIndex);
          } else if (o.evidence) {
            const m = studentMessages
              .map((m, i) => ({ msg: m, i }))
              .find(
                (x) =>
                  (x.msg.text === o.evidence || (o.evidence && x.msg.text.includes(o.evidence))) &&
                  !used.has(x.i),
              );
            if (m) {
              msg = m.msg;
              used.add(m.i);
            }
          }
          if (msg) {
            matched.push({
              matched: true,
              evidence: o.evidence ?? msg.text,
              timestamp: msg.elapsedSeconds,
              orderValue: msg.orderValue,
            });
          }
        }
        results.set(req.ref, matched);
      }
      // A self-hosted model's JSON can omit or mis-key a ref; don't let that erase a question
      // the student plainly asked — fall back to keyword matching for just those refs.
      const missing = requirements.filter((r) => (results.get(r.ref) ?? []).length === 0);
      if (missing.length > 0) {
        const fallback = this.deterministicQuestionMatching(missing, studentMessages);
        for (const r of missing) results.set(r.ref, fallback.get(r.ref) ?? []);
      }
      return results;
    } catch (err) {
      this.logger.warn(`[SEQ_AI] AI failed, using deterministic fallback`, String(err));
      return this.deterministicQuestionMatching(requirements, studentMessages);
    }
  }

  private deterministicQuestionMatching(
    requirements: Array<{ ref: string; label: string; aliases: string[] }>,
    studentMessages: Array<{ text: string; elapsedSeconds?: number; orderValue?: number }>,
  ): Map<
    string,
    Array<{ matched: boolean; evidence?: string; timestamp?: number; orderValue?: number }>
  > {
    const results = new Map<
      string,
      Array<{ matched: boolean; evidence?: string; timestamp?: number; orderValue?: number }>
    >();
    for (const req of requirements) {
      const matched: Array<{
        matched: boolean;
        evidence?: string;
        timestamp?: number;
        orderValue?: number;
      }> = [];
      const na = req.aliases.map((a) => this.normalizeForMatch(a));
      const nl = this.normalizeForMatch(req.label);
      for (const m of studentMessages) {
        const nt = this.normalizeForMatch(m.text);
        const isQ =
          m.text.includes('?') ||
          /\b(can|could|would|may|will|please)\s+(you|i)\b/.test(nt) ||
          /^(please\s+)?(tell|share|confirm|state|provide|describe|explain)\b/.test(nt) ||
          ['what', 'why', 'how', 'when', 'where', 'who', 'can', 'could', 'do', 'is', 'are'].some(
            (s) => nt.startsWith(`${s} `),
          );
        if (!isQ) {
          continue;
        }
        if (
          na.some((a) => a.length > 0 && nt.includes(a)) ||
          (nl.length > 0 && nt.includes(nl)) ||
          na.some((a) => this.hasAliasTokenMatch(nt, a, 0.5))
        ) {
          matched.push({
            matched: true,
            evidence: m.text,
            timestamp: m.elapsedSeconds,
            orderValue: m.orderValue,
          });
        }
      }
      results.set(req.ref, matched);
    }
    return results;
  }

  private inferFieldCategory(field: {
    id?: string;
    title: string;
    category?: string;
  }): 'order' | 'demographics' | 'history' | 'action' | 'vital' | 'unknown' {
    if (field.category) {
      const c = field.category.toLowerCase();
      if (c === 'orders') {
        return 'order';
      }
      // Note: medications are NOT processed here - they're handled as medorder.* in actionAttempts
      if (c === 'demographics') {
        return 'demographics';
      }
      if (c === 'history') {
        return 'history';
      }
      if (c === 'actions') {
        return 'action';
      }
      if (c === 'vitals') {
        return 'vital';
      }
    }
    if (field.id) {
      if (field.id.startsWith('orders-')) {
        return 'order';
      }
      if (field.id.startsWith('demographics-')) {
        return 'demographics';
      }
      if (field.id.startsWith('history-')) {
        return 'history';
      }
      if (field.id.startsWith('actions-') || field.id.startsWith('action_')) {
        return 'action';
      }
      if (field.id.startsWith('vitals-')) {
        return 'vital';
      }
    }
    return 'unknown';
  }

  private mapFieldToPatientRef(fieldTitle: string, fieldId?: string): string | null {
    const n = this.normalizeForMatch(fieldTitle);
    const m: Record<string, string> = {
      'dob updated': 'patient.dob',
      'date of birth updated': 'patient.dob',
      'name updated': 'patient.name',
      'patient name updated': 'patient.name',
      'age updated': 'patient.age',
      'gender updated': 'patient.gender',
      'race updated': 'patient.race',
      'height updated': 'patient.height',
      height: 'patient.height',
      'weight updated': 'patient.weight',
      weight: 'patient.weight',
      'history of present illness': 'patient.historyOfPresentIllness',
      'history of present illness (hpi)': 'patient.historyOfPresentIllness',
      hpi: 'patient.historyOfPresentIllness',
      'chief complaint updated': 'patient.chiefComplaint',
      'chief complaint': 'patient.chiefComplaint',
      'medical history updated': 'patient.medicalHistory',
      'past medical history': 'patient.medicalHistory',
      'past surgical history updated': 'patient.pastSurgicalHistory',
      'past surgical history': 'patient.pastSurgicalHistory',
      'allergies updated': 'patient.allergies',
      allergies: 'patient.allergies',
      'current medications updated': 'patient.currentMedications',
      'current medications': 'patient.currentMedications',
      'current home medications & indications': 'patient.currentMedications',
      'current home medications': 'patient.currentMedications',
      'social history updated': 'patient.socialHistory',
      'family medical history updated': 'patient.familyMedicalHistoryClinical',
      'family medical history': 'patient.familyMedicalHistoryClinical',
      'primary care provider updated': 'patient.primaryCareProvider',
      'primary care provider': 'patient.primaryCareProvider',
      'immunizations updated': 'patient.immunizationHistory',
      'immunization history': 'patient.immunizationHistory',
      immunizations: 'patient.immunizationHistory',
      immunization: 'patient.immunizationHistory',
      'tobacco use': 'patient.socialHistory.tobacco',
      tobacco: 'patient.socialHistory.tobacco',
      'alcohol use': 'patient.socialHistory.alcohol',
      alcohol: 'patient.socialHistory.alcohol',
      'history of drug use': 'patient.socialHistory.drugs',
      drugs: 'patient.socialHistory.drugs',
      occupation: 'patient.lifestyle.occupation',
      housing: 'patient.lifestyle.housing',
      transportation: 'patient.lifestyle.transportation',
      diet: 'patient.lifestyle.diet',
      'exercise history': 'patient.lifestyle.exercise',
      exercise: 'patient.lifestyle.exercise',
      stress: 'patient.lifestyle.stress',
      sleep: 'patient.lifestyle.sleep',
    };
    if (m[n]) {
      return m[n];
    }
    if (fieldId?.startsWith('demographics-')) {
      if (n.includes('dob') || n.includes('date of birth')) {
        return 'patient.dob';
      }
      if (n.includes('name')) {
        return 'patient.name';
      }
      if (n.includes('age')) {
        return 'patient.age';
      }
      if (n.includes('gender')) {
        return 'patient.gender';
      }
      if (n.includes('race')) {
        return 'patient.race';
      }
    }
    if (fieldId?.startsWith('history-')) {
      if (n.includes('history of present illness') || n.includes('hpi')) {
        return 'patient.historyOfPresentIllness';
      }
      if (n.includes('height')) {
        return 'patient.height';
      }
      if (n.includes('weight')) {
        return 'patient.weight';
      }
      if (n.includes('chief complaint')) {
        return 'patient.chiefComplaint';
      }
      if (n.includes('allergies')) {
        return 'patient.allergies';
      }
      if (n.includes('medical history')) {
        return 'patient.medicalHistory';
      }
      if (n.includes('surgical history')) {
        return 'patient.pastSurgicalHistory';
      }
      if (n.includes('family')) {
        return 'patient.familyMedicalHistoryClinical';
      }
      if (n.includes('medication')) {
        return 'patient.currentMedications';
      }
      if (n.includes('immunization')) {
        return 'patient.immunizationHistory';
      }
      if (n.includes('primary care') || n.includes('pcp')) {
        return 'patient.primaryCareProvider';
      }
    }
    if (n.includes('tobacco')) {
      return 'patient.socialHistory.tobacco';
    }
    if (n.includes('alcohol')) {
      return 'patient.socialHistory.alcohol';
    }
    if (n.includes('drug')) {
      return 'patient.socialHistory.drugs';
    }
    if (n.includes('occupation')) {
      return 'patient.lifestyle.occupation';
    }
    if (n.includes('housing')) {
      return 'patient.lifestyle.housing';
    }
    if (n.includes('transportation')) {
      return 'patient.lifestyle.transportation';
    }
    if (n.includes('diet')) {
      return 'patient.lifestyle.diet';
    }
    if (n.includes('exercise')) {
      return 'patient.lifestyle.exercise';
    }
    if (n.includes('stress')) {
      return 'patient.lifestyle.stress';
    }
    if (n.includes('sleep')) {
      return 'patient.lifestyle.sleep';
    }
    return null;
  }

  private mapOrderTitleToRef(orderTitle: string, scenario: Scenario | undefined): string | null {
    if (!scenario) {
      return null;
    }
    const orders = (scenario as unknown as { orders?: Array<{ id?: string; title?: string }> })
      ?.orders;
    if (!Array.isArray(orders)) {
      return null;
    }
    const nt = this.normalizeForMatch(orderTitle);
    const o = orders.find((o) => this.normalizeForMatch(o.title ?? '') === nt);
    return o?.id ? `order.${o.id}` : null;
  }
  private resolveAssessmentMethod(
    value: SequenceAssessmentMethod | undefined,
  ): SequenceAssessmentMethod {
    return value === 'patientInformationUpdated' ? 'patientInformationUpdated' : 'questionAsked';
  }

  private resolveDisplayLabelForRef(ref: string, scenario: Scenario | undefined): string {
    // Handle vital sign references like "vital.action_id.heartRate"
    if (ref.startsWith('vital.')) {
      const parts = ref.split('.');
      if (parts.length === 3) {
        const actionId = parts[1];
        const vitalField = parts[2];

        // Map vital field names to readable labels
        const vitalLabels: Record<string, string> = {
          heartRate: 'Heart Rate',
          hr: 'Heart Rate',
          bloodPressure: 'Blood Pressure',
          bp: 'Blood Pressure',
          temperature: 'Temperature',
          temp: 'Temperature',
          respiratoryRate: 'Respiratory Rate',
          rr: 'Respiratory Rate',
          spO2: 'SpO2',
          spo2: 'SpO2',
          weight: 'Weight',
          height: 'Height',
        };

        const vitalLabel = vitalLabels[vitalField] || vitalField;

        // Try to find the action to get its title
        const action = (scenario?.actions ?? []).find((a) => a.id === actionId);
        if (action?.title?.trim()) {
          return `${action.title}: ${vitalLabel}`;
        }

        // Fallback to just the vital label
        return vitalLabel;
      }
    }

    const labels: Record<string, string> = {
      'patient.name': 'Patient Name',
      'patient.dob': 'Date of Birth',
      'patient.age': 'Age',
      'patient.gender': 'Gender',
      'patient.race': 'Race',
      'patient.height': 'Height',
      'patient.weight': 'Weight',
      'patient.chiefComplaint': 'Chief Complaint',
      'patient.historyOfPresentIllness': 'History of Present Illness',
      'patient.medicalHistory': 'Medical History',
      'patient.pastSurgicalHistory': 'Past Surgical History',
      'patient.allergies': 'Allergies',
      'patient.currentMedications': 'Current Home Medications & Indications',
      'patient.immunizationHistory': 'Immunizations',
      'patient.familyMedicalHistoryClinical': 'Family Medical History',
      'patient.primaryCareProvider': 'Primary Care Provider',
      'patient.socialHistory.tobacco': 'Social History: Tobacco',
      'patient.socialHistory.alcohol': 'Social History: Alcohol',
      'patient.socialHistory.drugs': 'Social History: Drugs',
      'patient.lifestyle.occupation': 'Lifestyle: Occupation',
      'patient.lifestyle.housing': 'Lifestyle: Housing',
      'patient.lifestyle.transportation': 'Lifestyle: Transportation',
      'patient.lifestyle.diet': 'Lifestyle: Diet',
      'patient.lifestyle.exercise': 'Lifestyle: Exercise',
      'patient.lifestyle.stress': 'Lifestyle: Stress',
      'patient.lifestyle.sleep': 'Lifestyle: Sleep',
      'patient.socialHistory': 'Social History',
      'teamCommunication.general': 'Team Communication',
      'ppe.knock': 'Knock',
      'ppe.openDoor': 'Open Door',
      'ppe.closeDoor': 'Close Door',
      'ppe.openCurtain': 'Open Curtain',
      'ppe.closeCurtain': 'Close Curtain',
      'ppe.donStandardGloves': 'Don Standard Gloves',
      'ppe.doffStandardGloves': 'Doff Standard Gloves',
      'ppe.handHygiene': 'Hand Hygiene',
      'ppe.donEyeProtection': 'Don Eye Protection',
      'ppe.doffEyeProtection': 'Doff Eye Protection',
      'ppe.donIsolationGown': 'Don Isolation Gown',
      'ppe.doffIsolationGown': 'Doff Isolation Gown',
      'ppe.donSterileGloves': 'Don Sterile Gloves',
      'ppe.doffSterileGloves': 'Doff Sterile Gloves',
      'ppe.donRespiratorMask': 'Don Respirator Mask',
      'ppe.doffRespiratorMask': 'Doff Respirator Mask',
      'ppe.donSurgicalMask': 'Don Surgical Mask',
      'ppe.doffSurgicalMask': 'Doff Surgical Mask',
      'ppe.discardSharps': 'Discard Sharps',
      'ppe.discardNonInfectiousWaste': 'Discard Non-Infectious Waste',
      'ppe.discardInfectiousWaste': 'Discard Infectious Waste',
      'ppe.bedChairLockedConfirmed': 'Bed/Chair Locked Confirmed',
      'ppe.bedChairAlarmActivatedConfirmed': 'Bed/Chair Alarm Activated Confirmed',
      'ppe.bedLowestPositionConfirmed': 'Bed Lowest Position Confirmed',
      'ppe.callLightInReachConfirmed': 'Call Light in Reach Confirmed',
      'ppe.equipmentCheckedConfirmed': 'Equipment Checked Confirmed',
      'ppe.linesTubesDrainsCheckedConfirmed': 'Lines / Tubes / Drains Checked Confirmed',
      'ppe.personalItemsWithinReachConfirmed': 'Personal Items Within Reach Confirmed',
    };
    if (labels[ref]) {
      return labels[ref];
    }
    const action = (scenario?.actions ?? []).find((a) => a.id === ref);
    if (action?.title?.trim()) {
      return action.title;
    }
    if (ref.startsWith('order.')) {
      const orders = (scenario as unknown as { orders?: Array<{ id?: string; title?: string }> })
        ?.orders;
      const t = Array.isArray(orders)
        ? orders.find((o) => o.id === ref.replace('order.', ''))?.title
        : undefined;
      if (t?.trim()) {
        return `${t} (Order)`;
      }
    }
    if (ref.startsWith('medorder.')) {
      const orders = (scenario as unknown as { orders?: Array<{ id?: string; title?: string }> })
        ?.orders;
      const t = Array.isArray(orders)
        ? orders.find((o) => o.id === ref.replace('medorder.', ''))?.title
        : undefined;
      if (t?.trim()) {
        return `${t} (Medication)`;
      }
    }
    return ref
      .replace(/^patient\./, '')
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  private resolveRefAliases(ref: string, scenario: Scenario | undefined): string[] {
    const map: Record<string, string[]> = {
      'patient.name': ['name', 'patient name', 'full name'],
      'patient.dob': ['date of birth', 'dob', 'birth date'],
      'patient.age': ['age', 'how old'],
      'patient.gender': ['gender', 'sex'],
      'patient.height': ['height'],
      'patient.weight': ['weight'],
      'patient.chiefComplaint': ['chief complaint', 'main concern'],
      'patient.historyOfPresentIllness': ['history of present illness', 'hpi'],
      'patient.medicalHistory': ['medical history', 'past medical history'],
      'patient.pastSurgicalHistory': ['surgical history'],
      'patient.allergies': ['allergies', 'allergic'],
      'patient.currentMedications': ['current medications', 'medications'],
      'patient.familyMedicalHistoryClinical': ['family medical history', 'family history'],
      'patient.primaryCareProvider': ['primary care provider', 'pcp'],
      'patient.socialHistory.tobacco': ['tobacco', 'smoking'],
      'patient.socialHistory.alcohol': ['alcohol'],
      'patient.socialHistory.drugs': ['drug use', 'substance use', 'drugs'],
      'patient.lifestyle.diet': ['diet'],
      'patient.lifestyle.exercise': ['exercise'],
      'patient.lifestyle.stress': ['stress'],
      'patient.lifestyle.sleep': ['sleep'],
      'patient.lifestyle.housing': ['housing'],
      'patient.lifestyle.transportation': ['transportation'],
      'patient.lifestyle.occupation': ['occupation', 'work'],
      'teamCommunication.general': ['team communication', 'sbar'],
      'ppe.knock': ['door knocked', 'knock'],
      'ppe.openDoor': ['door opened', 'open door'],
      'ppe.closeDoor': ['door closed', 'close door'],
      'ppe.openCurtain': ['curtain opened', 'open curtain'],
      'ppe.closeCurtain': ['curtain closed', 'close curtain'],
      'ppe.donStandardGloves': ['standard gloves donned', 'don standard gloves', 'gloves'],
      'ppe.doffStandardGloves': ['standard gloves doffed', 'doff standard gloves', 'remove gloves'],
      'ppe.handHygiene': ['hand hygiene', 'hand hygiene performed'],
    };
    if (map[ref]) {
      return map[ref];
    }
    const action = (scenario?.actions ?? []).find((a) => a.id === ref);
    if (action?.title?.trim()) {
      return [action.title];
    }
    if (ref.startsWith('order.')) {
      const orders = (scenario as unknown as { orders?: Array<{ id?: string; title?: string }> })
        ?.orders;
      const t = Array.isArray(orders)
        ? orders.find((o) => o.id === ref.replace('order.', ''))?.title
        : undefined;
      if (t?.trim()) {
        return [t];
      }
    }
    if (ref.startsWith('medorder.')) {
      const orders = (scenario as unknown as { orders?: Array<{ id?: string; title?: string }> })
        ?.orders;
      const t = Array.isArray(orders)
        ? orders.find((o) => o.id === ref.replace('medorder.', ''))?.title
        : undefined;
      if (t?.trim()) {
        return [`Administer ${t}`, t];
      }
    }
    return [ref.replace(/^patient\./, '').replace(/[._-]+/g, ' ')];
  }

  private normalizeForMatch(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  private hasAliasTokenMatch(normalizedText: string, alias: string, threshold = 0.6): boolean {
    if (!alias?.trim()) {
      return false;
    }
    if (normalizedText.includes(alias)) {
      return true;
    }
    const stopWords = new Set(['the', 'a', 'an', 'to', 'of', 'for', 'and', 'patient']);
    const tokens = alias.split(' ').filter((t) => t.length > 2 && !stopWords.has(t));
    if (tokens.length === 0) {
      return false;
    }
    const matched = tokens.filter(
      (t) => normalizedText.includes(t) || this.calculateSimilarity(normalizedText, t) >= 0.9,
    ).length;
    return matched / tokens.length >= threshold;
  }

  private collectFieldUpdateEntries(
    studentSummary: StudentSummary | undefined,
    scenarioStartMs: number | undefined,
    summaryEntries?: Array<Record<string, unknown>>,
  ): Array<{
    id?: string;
    title: string;
    details: string;
    category?: string;
    elapsedSeconds?: number;
    orderValue?: number;
  }> {
    // Exclude 'medications' because they're already processed as medorder.* in actionAttempts
    const keys = ['demographics', 'history', 'actions', 'orders'];
    const entries: Array<{
      id?: string;
      title: string;
      details: string;
      category?: string;
      elapsedSeconds?: number;
      orderValue?: number;
    }> = [];
    if (Array.isArray(summaryEntries)) {
      summaryEntries.forEach((e) => {
        const rawCat = (e as { category?: unknown }).category;
        const cat = (
          typeof rawCat === 'string' ? rawCat : typeof rawCat === 'number' ? String(rawCat) : ''
        ).toLowerCase();
        // Skip medications - they're already in actionAttempts as medorder.*
        if (cat === 'medications') {
          return;
        }
        if (!keys.includes(cat)) {
          return;
        }
        entries.push({
          id: typeof e.id === 'string' ? e.id : undefined,
          title: typeof e.title === 'string' ? e.title : '',
          details: typeof e.details === 'string' ? e.details : '',
          category: cat,
          elapsedSeconds: this.resolveElapsedSeconds(e, scenarioStartMs),
          orderValue: this.resolveOrderValue(e, scenarioStartMs),
        });
      });
    }
    keys.forEach((key) => {
      const section = studentSummary?.[key];
      if (!Array.isArray(section)) {
        return;
      }
      section.forEach((entry) => {
        if (!entry || typeof entry !== 'object') {
          return;
        }
        const r = entry as Record<string, unknown>;
        entries.push({
          id: typeof r.id === 'string' ? r.id : undefined,
          title: typeof r.title === 'string' ? r.title : '',
          details: typeof r.details === 'string' ? r.details : '',
          category: key,
          elapsedSeconds: this.resolveElapsedSeconds(r, scenarioStartMs),
          orderValue: this.resolveOrderValue(r, scenarioStartMs),
        });
      });
    });
    const deduped = new Map<string, (typeof entries)[0]>();
    entries.forEach((e) =>
      deduped.set(`${e.id ?? ''}|${e.title}|${e.details}|${e.orderValue ?? ''}`, e),
    );
    return Array.from(deduped.values()).sort(
      (a, b) =>
        (a.orderValue ?? Number.MAX_SAFE_INTEGER) - (b.orderValue ?? Number.MAX_SAFE_INTEGER),
    );
  }

  private resolveElapsedSeconds(
    entry: Record<string, unknown>,
    scenarioStartMs: number | undefined,
  ): number | undefined {
    if (typeof entry.elapsedSeconds === 'number' && Number.isFinite(entry.elapsedSeconds)) {
      return entry.elapsedSeconds;
    }
    if (typeof entry.timestampValue === 'number' && scenarioStartMs !== undefined) {
      return Math.max(0, Math.round((entry.timestampValue - scenarioStartMs) / 1000));
    }
    if (typeof entry.timestamp === 'string' && scenarioStartMs !== undefined) {
      const ts = new Date(entry.timestamp).getTime();
      if (!Number.isNaN(ts)) {
        return Math.max(0, Math.round((ts - scenarioStartMs) / 1000));
      }
    }
    if (typeof entry.completedAtValue === 'number' && scenarioStartMs !== undefined) {
      return Math.max(0, Math.round((entry.completedAtValue - scenarioStartMs) / 1000));
    }
    return undefined;
  }
  private resolveOrderValue(
    entry: Record<string, unknown>,
    scenarioStartMs: number | undefined,
  ): number | undefined {
    // CRITICAL: For sequencing, prioritize elapsedSeconds to ensure all items use relative time
    // This prevents mixing absolute timestamps (timestampMs) with relative times (elapsedSeconds)
    if (typeof entry.elapsedSeconds === 'number' && Number.isFinite(entry.elapsedSeconds)) {
      return scenarioStartMs !== undefined
        ? scenarioStartMs + entry.elapsedSeconds * 1000
        : entry.elapsedSeconds * 1000;
    }
    if (typeof entry.timestampValue === 'number' && Number.isFinite(entry.timestampValue)) {
      return entry.timestampValue;
    }
    if (typeof entry.completedAtValue === 'number' && Number.isFinite(entry.completedAtValue)) {
      return entry.completedAtValue;
    }
    if (typeof entry.startedAtValue === 'number' && Number.isFinite(entry.startedAtValue)) {
      return entry.startedAtValue;
    }
    if (typeof entry.timestamp === 'string') {
      const ts = new Date(entry.timestamp).getTime();
      if (!Number.isNaN(ts)) {
        return ts;
      }
    }
    return undefined;
  }
  private calculateSimilarity(s1: string, s2: string): number {
    return this.actionsService.calculateSimilarity(s1, s2);
  }
  private formatSecondsToTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
