import {
  type NormalizedTimelineBlock,
  type PatientDataBlock,
  type SequenceViolation,
  type TimelineActionItem,
  type TimelineActionLogEntry,
  type TimelineAnalysisResult,
  type TimelineBlock,
  type TimelineCommonActionTrackerLike,
  type TimelineCompletionSource,
  type TimelineEvent,
  type TimelineSummaryByCategory,
  type TimingDetail,
} from '../../../common/interfaces/simulation-report.interface';

/**
 * Deterministic timeline analysis based on:
 * - actionsTimeline: student's completed actions with timestamps
 * - timelineBlocks: expected timeline blocks from scenario
 * - summaryByCategory: student summary data (for vitals, medications, etc.)
 * - conversationMessages: conversation transcript to check patient data questions
 * - scenarioStartTime: when the scenario started
 *
 * Returns which blocks were completed, missed, and timing compliance for each
 */
export function computeTimelineAnalysis(
  actionsTimeline: TimelineActionItem[],
  timelineBlocks: TimelineBlock[],
  scenarioStartTime?: string,
  formatSecondsToTime?: (seconds: number) => string,
  summaryByCategory?: TimelineSummaryByCategory,
  commonActionTracker?: TimelineActionLogEntry[] | TimelineCommonActionTrackerLike,
  // conversationMessages?: any[],
  sequenceChain?: string[],
): TimelineAnalysisResult {
  // Build a sequenceChain position map for fast lookup
  // Fallback: if sequenceChain isn't passed, look for it on any block
  const effectiveSequenceChain: string[] | undefined = Array.isArray(sequenceChain)
    ? sequenceChain
    : Array.isArray(timelineBlocks)
      ? timelineBlocks.find((b) => Array.isArray(b?.sequenceChain) && b.sequenceChain.length > 0)
        ?.sequenceChain
      : undefined;
  const chainIndexMap = new Map<string, number>();
  if (Array.isArray(effectiveSequenceChain)) {
    effectiveSequenceChain.forEach((id, i) => chainIndexMap.set(String(id), i));
  }

  // Normalize blocks. When sequenceChain is present, REPLACE prerequisites/followups
  // entirely with what the chain dictates — stale admin config is discarded.
  const normalizedTimelineBlocks: NormalizedTimelineBlock[] = (timelineBlocks || []).map((b) => {
    const id = String(b.id);
    const chainIdx = chainIndexMap.get(id);
    if (
      chainIdx !== undefined &&
      Array.isArray(effectiveSequenceChain) &&
      effectiveSequenceChain.length > 1
    ) {
      const prerequisites = chainIdx > 0 ? [String(effectiveSequenceChain[chainIdx - 1])] : [];
      const followups =
        chainIdx < effectiveSequenceChain.length - 1
          ? [String(effectiveSequenceChain[chainIdx + 1])]
          : [];
      return { ...b, prerequisites, followups };
    }
    return {
      ...b,
      prerequisites: Array.isArray(b?.prerequisites) ? [...b.prerequisites] : [],
      followups: Array.isArray(b?.followups) ? [...b.followups] : [],
    };
  });

  const getElapsedSeconds = (item: TimelineEvent): number | null => {
    if (item.elapsedSeconds !== undefined) {
      return item.elapsedSeconds;
    }
    if (!scenarioStartTime) {
      return null;
    }
    const itemTime =
      item.timestampValue || (item.timestamp ? new Date(item.timestamp).getTime() : null);
    if (itemTime === null) {
      return null;
    }
    const startTime = new Date(scenarioStartTime).getTime();
    return Math.max(0, Math.round((itemTime - startTime) / 1000));
  };

  const extractKeywords = (text: string): string[] =>
    text
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !['the', 'and', 'for', 'with'].includes(w));

  // ── Build event pools (sorted chronologically) so each event is consumed once ──

  // Actions pool: title -> events sorted by time
  const actionPool = new Map<string, TimelineActionItem[]>();
  const actionSourceList: TimelineActionItem[] =
    summaryByCategory?.actions && summaryByCategory.actions.length > 0
      ? summaryByCategory.actions
      : Array.isArray(actionsTimeline)
        ? actionsTimeline
        : [];
  actionSourceList.forEach((action) => {
    const title = String(action.title || '')
      .toLowerCase()
      .trim();
    if (!actionPool.has(title)) {
      actionPool.set(title, []);
    }
    actionPool.get(title)!.push(action);
  });
  actionPool.forEach((pool) =>
    pool.sort((a, b) => (getElapsedSeconds(a) ?? 0) - (getElapsedSeconds(b) ?? 0)),
  );

  // Orders pool: title -> events sorted by time
  const orderPool = new Map<string, TimelineEvent[]>();
  (summaryByCategory?.orders || []).forEach((order) => {
    const title = String(order.title || '')
      .toLowerCase()
      .trim();
    if (!orderPool.has(title)) {
      orderPool.set(title, []);
    }
    orderPool.get(title)!.push(order);
  });
  orderPool.forEach((pool) =>
    pool.sort((a, b) => (getElapsedSeconds(a) ?? 0) - (getElapsedSeconds(b) ?? 0)),
  );

  // Vitals pool: vitalType -> readings sorted by time, with a consumed Set
  const vitalTypeMap: Record<string, string[]> = {
    heartrate: ['Heart Rate', 'heart rate', 'hr', 'pulse'],
    bloodpressure: ['Blood Pressure', 'blood pressure', 'bp'],
    respiratoryrate: ['Respiratory Rate', 'respiratory rate', 'rr'],
    temperature: ['Temperature', 'temp'],
    spo2: ['SpO2', 'oxygen', 'o2'],
  };
  const vitalsData = summaryByCategory?.vitals || {};
  const vitalPool = new Map<string, TimelineEvent[]>();
  const vitalConsumed = new Map<string, Set<number>>();
  Object.keys(vitalTypeMap).forEach((vitalType) => {
    const searchTerms = vitalTypeMap[vitalType];
    const vitalKey = Object.keys(vitalsData).find((k) =>
      searchTerms.some(
        (term) =>
          k.toLowerCase().includes(term.toLowerCase()) ||
          term.toLowerCase().includes(k.toLowerCase()),
      ),
    );
    if (vitalKey && Array.isArray(vitalsData[vitalKey])) {
      const sorted = [...vitalsData[vitalKey]].sort(
        (a, b) => (getElapsedSeconds(a) ?? 0) - (getElapsedSeconds(b) ?? 0),
      );
      vitalPool.set(vitalType, sorted);
    }
    vitalConsumed.set(vitalType, new Set<number>());
  });

  // PPE pool: normalised action log with a consumed-index Set
  const normalizedActionLog: TimelineActionLogEntry[] = Array.isArray(commonActionTracker)
    ? commonActionTracker
    : commonActionTracker?.actionLog || [];
  const ppeConsumed = new Set<number>(); // tracks which log indices have been consumed

  // ── Main loop ──
  const completedBlocks: string[] = [];
  const missedBlocks: string[] = [];
  const timingDetails: TimingDetail[] = [];
  const patientDataBlocks: PatientDataBlock[] = [];
  let totalBlocks = 0;
  let totalTimedBlocks = 0;
  let blocksWithCorrectTiming = 0;

  // Sort blocks so that blocks earlier in the sequence chain are processed first.
  // This ensures prerequisite completion times are available when dependent blocks
  // (e.g. the second hand hygiene) need to pick the correct action log entry.
  // Blocks not in the chain fall back to sorting by expectedStart.
  const sortedBlocks = [...normalizedTimelineBlocks].sort((a, b) => {
    const aChain = chainIndexMap.get(String(a.id)) ?? Infinity;
    const bChain = chainIndexMap.get(String(b.id)) ?? Infinity;
    if (aChain !== bChain) {
      return aChain - bChain;
    }
    return (a.start ?? 0) - (b.start ?? 0);
  });

  sortedBlocks.forEach((block) => {
    const sourceId = String(block.sourceId || '').toLowerCase();

    // Patient data blocks — deferred to AI analysis
    if (sourceId.startsWith('patient.')) {
      totalBlocks++;
      const patientField = sourceId.replace('patient.', '');
      patientDataBlocks.push({
        blockLabel: block.label || block.title,
        blockId: block.id,
        sourceId: block.sourceId,
        patientField,
        expectedStartSeconds: Math.round((block.start || 0) * 60),
        expectedEndSeconds: Math.round(((block.start || 0) + (block.duration || 0)) * 60),
        prerequisites: block.prerequisites || [],
        followups: block.followups || [],
        block,
      });
      timingDetails.push({
        blockLabel: block.label || block.title,
        blockId: block.id,
        sourceId: block.sourceId,
        completed: false,
        status: 'Pending AI Analysis',
        requiresAIAnalysis: true,
        prerequisites: block.prerequisites || [],
        followups: block.followups || [],
      });
      return;
    }

    totalBlocks++;
    const blockHasTiming =
      block.start !== undefined &&
      block.start !== null &&
      block.duration !== undefined &&
      block.duration !== null;
    if (blockHasTiming) {
      totalTimedBlocks++;
    }
    const blockTitle = String(block.label || block.title || '')
      .toLowerCase()
      .trim();
    const cleanBlockTitle = sourceId.startsWith('order')
      ? blockTitle.replace(/\s*\([^)]*\)\s*$/, '').trim()
      : blockTitle;

    let isCompleted = false;
    let completionSource: TimelineCompletionSource = 'action';
    let completionTime: number | null = null;

    // ── Actions: consume the earliest unconsumed matching event ──
    if (
      !isCompleted &&
      (sourceId.startsWith('action') ||
        (!sourceId.startsWith('vitals.') &&
          !sourceId.startsWith('vital.') &&
          !sourceId.startsWith('ppe.') &&
          !sourceId.startsWith('order') &&
          !sourceId.startsWith('patient.')))
    ) {
      const pool = actionPool.get(cleanBlockTitle);
      if (pool && pool.length > 0) {
        const event = pool.shift()!;
        const time = getElapsedSeconds(event);
        if (time !== null) {
          isCompleted = true;
          completionTime = time;
          completionSource = 'action';
        } else if (event) {
          // Event matched but no timing reference available — mark completed without timing
          isCompleted = true;
          completionTime = null;
          completionSource = 'action';
        }
      }
    }

    // ── Orders: consume the earliest unconsumed matching event ──
    if (!isCompleted && sourceId.startsWith('order')) {
      const pool = orderPool.get(cleanBlockTitle);
      if (pool && pool.length > 0) {
        const event = pool.shift()!;
        const time = getElapsedSeconds(event);
        if (time !== null) {
          isCompleted = true;
          completionTime = time;
          completionSource = 'order';
        }
      }
    }

    // ── Vital (new format): vital.{actionId}.{vitalKey} ──
    // Find the matching action in summaryByCategory.actions by id, then check its vitals sub-object
    if (!isCompleted && sourceId.startsWith('vital.')) {
      const parts = block.sourceId!.split('.');
      const vitalKey = parts[parts.length - 1]; // e.g. heartRate, bloodPressure

      // Map camelCase vital key to the short keys used in summaryByCategory.actions[].vitals
      const vitalKeyAliases: Record<string, string[]> = {
        heartRate: ['hr', 'heartrate', 'heartRate'],
        bloodPressure: ['bp', 'bloodpressure', 'bloodPressure'],
        respiratoryRate: ['rr', 'respiratoryrate', 'respiratoryRate'],
        temperature: ['temp', 'temperature'],
        spO2: ['spo2', 'spO2', 'sp02'],
        weight: ['weight'],
        height: ['height'],
      };
      const aliases = vitalKeyAliases[vitalKey] || [vitalKey.toLowerCase()];
      const expectedStartSeconds = Math.round((block.start || 0) * 60);

      // Collect all unconsumed readings across all actions
      const allReadings: Array<{
        reading: TimelineEvent;
        time: number;
        actionIdx: number;
        readingIdx: number;
      }> = [];
      const allActions = summaryByCategory?.actions || [];
      allActions.forEach((action, actionIdx) => {
        if (!action.vitals) {
          return;
        }
        const vitalsObj = action.vitals;
        const matchedKey = Object.keys(vitalsObj).find((k) =>
          aliases.some((alias) => k.toLowerCase() === alias.toLowerCase()),
        );
        if (!matchedKey) {
          return;
        }
        const readings: TimelineEvent[] = vitalsObj[matchedKey];
        if (!Array.isArray(readings)) {
          return;
        }
        readings.forEach((reading, readingIdx) => {
          const time = getElapsedSeconds(reading);
          if (time !== null) {
            allReadings.push({ reading, time, actionIdx, readingIdx });
          }
        });
      });

      // Find the best match: closest to expected start time (but prefer after over before)
      let bestMatch: (typeof allReadings)[0] | null = null;
      let bestScore = Infinity;
      for (const item of allReadings) {
        const diff = item.time - expectedStartSeconds;
        // Prefer readings at or after expected start; penalize early readings more
        const score = diff >= 0 ? diff : Math.abs(diff) * 2;
        if (score < bestScore) {
          bestScore = score;
          bestMatch = item;
        }
      }

      if (bestMatch) {
        isCompleted = true;
        completionTime = bestMatch.time;
        completionSource = 'summary';
      }
    }

    // ── Vitals: find the best unconsumed reading closest to expected start time ──
    if (!isCompleted && sourceId.startsWith('vitals.')) {
      const vitalType = sourceId.replace('vitals.', '').toLowerCase();
      const pool = vitalPool.get(vitalType);
      const consumed = vitalConsumed.get(vitalType);
      const expectedStartSeconds = Math.round((block.start || 0) * 60);

      if (pool && consumed) {
        let bestIdx = -1;
        let bestScore = Infinity;
        pool.forEach((reading, idx) => {
          if (consumed.has(idx)) {
            return;
          }
          const time = getElapsedSeconds(reading);
          if (time === null) {
            return;
          }
          const diff = time - expectedStartSeconds;
          // Prefer readings at or after expected start; penalize early readings more
          const score = diff >= 0 ? diff : Math.abs(diff) * 2;
          if (score < bestScore) {
            bestScore = score;
            bestIdx = idx;
          }
        });

        if (bestIdx !== -1) {
          const time = getElapsedSeconds(pool[bestIdx]);
          if (time !== null) {
            consumed.add(bestIdx);
            isCompleted = true;
            completionTime = time;
            completionSource = 'summary';
            // Check verbalization: if any conversation/log entry mentions this vital, mark verbalized
            const searchTerms = vitalTypeMap[vitalType] || [vitalType];
            const verbalized = normalizedActionLog.some((entry) => {
              const txt = String(entry?.text || entry?.message || entry?.label || '').toLowerCase();
              if (!txt) {
                return false;
              }
              return searchTerms.some((t) => txt.includes(String(t).toLowerCase()));
            });
            if (verbalized) {
              completionSource = 'summary-verbalized';
              block.__verbalized = true;
            }
          }
        }
      }
    }

    // ── PPE: consume the earliest unconsumed matching log entry ──
    // For repeatable actions (e.g. hand hygiene), prefer the earliest entry
    // that occurs AT OR AFTER the latest prerequisite's completion time so that
    // the correct occurrence is assigned to each block in the sequence chain.
    if (!isCompleted && sourceId.startsWith('ppe.')) {
      const blockLabel = (block.label || block.title || '').toLowerCase().trim();
      const blockKeywords = extractKeywords(blockLabel);
      const isDonAction = blockLabel.includes('don') && !blockLabel.includes('doff');
      const isDoffAction = blockLabel.includes('doff');

      // Determine the earliest time this block could have been performed:
      // it must be >= the completion time of all its prerequisites.
      const prereqIds: string[] = block.prerequisites || [];
      let earliestValidTime = 0;
      prereqIds.forEach((prereqId: string) => {
        const resolved = timingDetails.find((d) => d.blockId === prereqId);
        if (resolved?.completed && resolved.actualTimeSeconds !== undefined) {
          earliestValidTime = Math.max(earliestValidTime, resolved.actualTimeSeconds as number);
        }
      });

      // Collect all candidate indices (matching label + not yet consumed)
      const candidateIndices: number[] = [];
      normalizedActionLog.forEach((_action, idx) => {
        if (ppeConsumed.has(idx)) {
          return;
        }
        const label = String(_action.label || '')
          .toLowerCase()
          .trim();
        const actionKeywords = extractKeywords(label);
        if (isDonAction && !label.includes('donned')) {
          return;
        }
        if (isDoffAction && !label.includes('doffed')) {
          return;
        }
        const keywordOverlap = blockKeywords.filter((bk) =>
          actionKeywords.some((ak) => ak.includes(bk) || bk.includes(ak)),
        ).length;
        if (keywordOverlap >= 2 || label.includes(blockLabel) || blockLabel.includes(label)) {
          candidateIndices.push(idx);
        }
      });

      // Prefer the earliest candidate that is >= earliestValidTime;
      // fall back to the globally earliest candidate if none qualifies.
      let matchIdx = -1;
      if (candidateIndices.length > 0) {
        const afterPrereq = candidateIndices.find((idx) => {
          const t = getElapsedSeconds(normalizedActionLog[idx]);
          return t !== null && t >= earliestValidTime;
        });
        matchIdx = afterPrereq !== undefined ? afterPrereq : candidateIndices[0];
      }

      if (matchIdx !== -1) {
        ppeConsumed.add(matchIdx);
        const time = getElapsedSeconds(normalizedActionLog[matchIdx]);
        if (time !== null) {
          isCompleted = true;
          completionTime = time;
          completionSource = 'ppe';
        }
      }
    }

    if (isCompleted) {
      const hasTiming =
        block.start !== undefined &&
        block.start !== null &&
        block.duration !== undefined &&
        block.duration !== null;

      if (!hasTiming || completionTime === null) {
        // Completion-only block (or completion without timing reference) — no timing evaluation
        blocksWithCorrectTiming++;
        completedBlocks.push((block.label || block.title)!);
        const formatTime = formatSecondsToTime || ((s: number) => `${s}s`);
        timingDetails.push({
          blockLabel: block.label || block.title,
          blockId: block.id,
          sourceId: block.sourceId,
          actualTimeSeconds: completionTime,
          actualTimeFormatted: completionTime !== null ? formatTime(completionTime) : undefined,
          status: 'Completed',
          completed: true,
          completionSource,
          verbalized: block.__verbalized === true ? true : undefined,
          prerequisites: block.prerequisites || [],
          followups: block.followups || [],
        });
        return;
      }

      const expectedStartSeconds = Math.round((block.start || 0) * 60);
      const expectedEndSeconds = Math.round(((block.start || 0) + (block.duration || 0)) * 60);
      const withinTimeWindow =
        completionTime >= expectedStartSeconds && completionTime <= expectedEndSeconds;

      if (withinTimeWindow) {
        blocksWithCorrectTiming++;
        completedBlocks.push((block.label || block.title)!);
      }

      const formatTime = formatSecondsToTime || ((s: number) => `${s}s`);
      timingDetails.push({
        blockLabel: block.label || block.title,
        blockId: block.id,
        sourceId: block.sourceId,
        expectedStartSeconds,
        expectedEndSeconds,
        expectedStartFormatted: formatTime(expectedStartSeconds),
        expectedEndFormatted: formatTime(expectedEndSeconds),
        actualTimeSeconds: completionTime,
        actualTimeFormatted: formatTime(completionTime),
        withinTimeWindow,
        status: withinTimeWindow
          ? 'Completed on time'
          : completionTime < expectedStartSeconds
            ? 'Completed too early'
            : 'Completed too late',
        completed: true,
        completionSource,
        verbalized: block.__verbalized === true ? true : undefined,
        prerequisites: block.prerequisites || [],
        followups: block.followups || [],
      });
    } else {
      missedBlocks.push((block.label || block.title)!);
      timingDetails.push({
        blockLabel: block.label || block.title,
        blockId: block.id,
        sourceId: block.sourceId,
        completed: false,
        status: 'Not completed',
        prerequisites: block.prerequisites || [],
        followups: block.followups || [],
      });
    }
  });

  // ── Sequence / prerequisite / followup validation ──
  const sequenceViolations: SequenceViolation[] = [];
  const blockCompletionMap = new Map<string, number>();
  timingDetails.forEach((detail) => {
    if (detail.completed && detail.actualTimeSeconds !== undefined) {
      blockCompletionMap.set(detail.blockId, detail.actualTimeSeconds as number);
    }
  });

  if (
    effectiveSequenceChain &&
    Array.isArray(effectiveSequenceChain) &&
    effectiveSequenceChain.length > 1
  ) {
    const completedChainBlocks = effectiveSequenceChain
      .map((blockId) => ({
        blockId,
        time: blockCompletionMap.get(blockId) ?? null,
        block: normalizedTimelineBlocks.find((b) => b.id === blockId),
      }))
      .filter((item) => item.time !== null);

    for (let i = 1; i < completedChainBlocks.length; i++) {
      const prevBlock = completedChainBlocks[i - 1];
      const currBlock = completedChainBlocks[i];
      if (currBlock.time! < prevBlock.time!) {
        sequenceViolations.push({
          blockId: currBlock.blockId,
          blockLabel: currBlock.block?.label || currBlock.block?.title || currBlock.blockId,
          type: 'sequence_chain_violation',
          message: `Completed out of sequence (before ${prevBlock.block?.label || prevBlock.block?.title})`,
          expectedAfter: prevBlock.blockId,
          expectedAfterLabel: prevBlock.block?.label || prevBlock.block?.title,
          expectedTime: prevBlock.time,
          actualTime: currBlock.time,
        });
      }
    }
  }

  // isBlockCompleted now reads from timingDetails (already correctly assigned via pools)
  const isBlockCompleted = (blockId: string): { completed: boolean; time: number | null } => {
    const detail = timingDetails.find((d) => d.blockId === blockId);
    if (detail?.completed && detail.actualTimeSeconds !== undefined) {
      return { completed: true, time: detail.actualTimeSeconds };
    }
    return { completed: false, time: null };
  };

  timingDetails.forEach((detail) => {
    if (!detail.completed || detail.requiresAIAnalysis) {
      return;
    }
    const blockTime = detail.actualTimeSeconds;
    if (blockTime === null || blockTime === undefined) {
      return;
    }
    const block = normalizedTimelineBlocks.find((b) => b.id === detail.blockId);
    if (!block) {
      return;
    }

    let prerequisitesMet = true;
    let followupsCorrect = true;

    (block.prerequisites || []).forEach((prereqId: string) => {
      const prereqBlock = normalizedTimelineBlocks.find((b) => b.id === prereqId);
      // Skip patient-data prerequisites — they're evaluated by AI, not in this engine
      if (
        prereqBlock &&
        String(prereqBlock.sourceId || '')
          .toLowerCase()
          .startsWith('patient.')
      ) {
        return;
      }
      const { completed: prereqCompleted, time: prereqTime } = isBlockCompleted(prereqId);
      if (!prereqCompleted || prereqTime === null) {
        prerequisitesMet = false;
        if (
          !sequenceViolations.find(
            (v) =>
              v.blockId === block.id &&
              v.type === 'missing_prerequisite' &&
              v.prereqId === prereqId,
          )
        ) {
          sequenceViolations.push({
            blockId: block.id,
            blockLabel: block.label || block.title,
            type: 'missing_prerequisite',
            prereqId,
            prereqLabel: prereqBlock?.label || prereqBlock?.title || prereqId,
            message: 'Completed without prerequisite block',
          });
        }
      } else if (prereqTime > blockTime) {
        prerequisitesMet = false;
        if (
          !sequenceViolations.find(
            (v) =>
              v.blockId === block.id &&
              v.type === 'prerequisite_order_violation' &&
              v.prereqId === prereqId,
          )
        ) {
          sequenceViolations.push({
            blockId: block.id,
            blockLabel: block.label || block.title,
            type: 'prerequisite_order_violation',
            prereqId,
            prereqLabel: prereqBlock?.label || prereqBlock?.title || prereqId,
            message: 'Completed before prerequisite block',
            expectedTime: prereqTime,
            actualTime: blockTime,
          });
        }
      }
    });

    (block.followups || []).forEach((followupId: string) => {
      const followupBlock = normalizedTimelineBlocks.find((b) => b.id === followupId);
      const { completed: followupCompleted, time: followupTime } = isBlockCompleted(followupId);
      if (!followupCompleted || followupTime === null) {
        followupsCorrect = false;
        if (
          !sequenceViolations.find(
            (v) =>
              v.blockId === block.id &&
              v.type === 'missing_followup' &&
              v.followupId === followupId,
          )
        ) {
          sequenceViolations.push({
            blockId: block.id,
            blockLabel: block.label || block.title,
            type: 'missing_followup',
            followupId,
            followupLabel: followupBlock?.label || followupBlock?.title || followupId,
            message: 'Followup block was not completed',
          });
        }
      } else if (followupTime < blockTime) {
        followupsCorrect = false;
        if (
          !sequenceViolations.find(
            (v) =>
              v.blockId === block.id &&
              v.type === 'followup_order_violation' &&
              v.followupId === followupId,
          )
        ) {
          sequenceViolations.push({
            blockId: block.id,
            blockLabel: block.label || block.title,
            type: 'followup_order_violation',
            followupId,
            followupLabel: followupBlock?.label || followupBlock?.title || followupId,
            message: 'Followup block completed before this block',
            expectedTime: blockTime,
            actualTime: followupTime,
          });
        }
      }
    });

    detail.prerequisitesMet = prerequisitesMet;
    detail.followupsCorrect = followupsCorrect;
  });

  const completionRate =
    totalBlocks > 0 ? Math.round((completedBlocks.length / totalBlocks) * 100) : 0;
  const timingComplianceRate =
    totalTimedBlocks > 0
      ? Math.round((blocksWithCorrectTiming / totalTimedBlocks) * 100)
      : completedBlocks.length > 0
        ? Math.round((blocksWithCorrectTiming / completedBlocks.length) * 100)
        : 0;
  const sequenceComplianceRate =
    completedBlocks.length > 0
      ? Math.round(
        ((completedBlocks.length - sequenceViolations.length) / completedBlocks.length) * 100,
      )
      : 100;

  return {
    completedBlocks,
    missedBlocks,
    timingDetails,
    completionRate,
    timingComplianceRate,
    sequenceComplianceRate,
    sequenceViolations,
    patientDataBlocks,
  };
}
