/**
 * processTranscriptData.ts
 *
 * Standalone async function that fetches and processes all data needed to
 * generate a transcript PDF via buildTranscriptPDF.
 *
 * This mirrors the fetchTranscript useEffect in page.tsx but returns a
 * TranscriptPDFData object instead of updating React state, allowing it to
 * be used outside of the StudentTranscriptView component (e.g. bulk export).
 */

import { api } from '../studentReportApi';
import { resolveDisplayClassName } from '../resolveDisplayClassName';
import {
  timelineComparator,
  parseElapsedTimeToSeconds,
  type TimelineSortItem,
} from '../../student-transcript/transcript-logic';
import { formatElapsedLabel } from './utils';
import type { AssessmentReport } from '../../types/assessmentReport';
import type { TranscriptPDFData } from './generateTranscriptPDF';
import type { TimelineItem, SummaryEntry, CommonActionEntry, TranscriptMessage } from './types';

export async function processTranscriptData(
  reportId: string,
  classNameOverride?: string,
): Promise<TranscriptPDFData> {
  const reportData = await api.getAdminReportsById(reportId);
  const report = reportData as unknown as AssessmentReport;

  const displayClassName = resolveDisplayClassName(
    report.studentClass,
    classNameOverride,
    report.studentName,
  );

  let timelineItems: TimelineItem[] = [];
  let vitalsMapState: Record<string, Array<{ title?: string; details?: string }>> | null = null;
  let realSessionStartTime: string | null = null;
  let simulationStartDate: string | null = null;
  let simulationStartTime: string | null = null;

  if (reportData.transcriptId) {
    const scenarioPromise = reportData.scenarioId
      ? api.getScenario(reportData.scenarioId).catch(() => null)
      : Promise.resolve(null);

    const [logData, liveScenario] = await Promise.all([
      api.getLog(reportData.transcriptId),
      scenarioPromise,
    ]);

    const scenarioStartMs = logData.startedAt
      ? new Date(logData.startedAt).getTime()
      : null;

    if (logData.startedAt) {
      realSessionStartTime = logData.startedAt;
    }

    // Simulation start time/date
    let simTime = reportData.scenario?.simulationStartTime;
    let simDate = reportData.scenario?.simulationStartDate as string | undefined;
    if (!simTime && liveScenario?.simulationStartTime) simTime = liveScenario.simulationStartTime;
    if (!simDate && liveScenario?.simulationStartDate) simDate = liveScenario.simulationStartDate as string;

    if (simTime) simulationStartTime = simTime;
    if (simDate) simulationStartDate = simDate;

    // Derive SIM Date from simulationStartTime if no explicit simulationStartDate
    if (!simDate && simTime) {
      try {
        const d = new Date(simTime);
        if (!isNaN(d.getTime())) {
          const month = d.toLocaleString('en-US', { month: 'short' });
          const day = d.getDate().toString().padStart(2, '0');
          const year = d.getFullYear();
          simulationStartDate = `${month} ${day}, ${year}`;
        }
      } catch { /* ignore */ }
    }

    let dynamicTeamCommPrompt = reportData.scenario?.teamCommunication?.prompt;
    if (liveScenario?.teamCommunication?.prompt) {
      dynamicTeamCommPrompt = (liveScenario.teamCommunication as Record<string, unknown>).prompt as string;
    }

    // ── Process messages ─────────────────────────────────────────────────────
    const transcriptMessages: TranscriptMessage[] = ((
      logData.messages as unknown as Record<string, unknown>[] | undefined
    )
      ?.filter((msg: Record<string, unknown>) => {
        const msgText = String(msg.text ?? msg.message ?? '').trim();
        const isOrderRelease = msg.speaker === 'system' && msgText.toLowerCase().startsWith('order released:');
        const isTeamCommInitiated = msg.speaker === 'system' && msgText.toLowerCase().startsWith('team communication initiated.');
        if (isOrderRelease || isTeamCommInitiated) return true;
        if (msg.speaker === 'student_team_comm' || msg.speaker === 'sbar_report') return true;
        if (msg.speaker === 'provider') return false;
        return msg.speaker !== 'system';
      })
      ?.map((msg: Record<string, unknown>, index: number) => {
        const timestampValue =
          typeof msg.timestampValue === 'number'
            ? msg.timestampValue
            : msg.timestamp
              ? new Date(msg.timestamp as string | number | Date).getTime()
              : undefined;

        const elapsedSeconds =
          typeof msg.elapsedSeconds === 'number'
            ? msg.elapsedSeconds
            : timestampValue && scenarioStartMs
              ? Math.max(0, Math.round((timestampValue - scenarioStartMs) / 1000))
              : index;

        const elapsedTime =
          msg.elapsedTime && msg.elapsedTime !== '0:00'
            ? (msg.elapsedTime as string)
            : formatElapsedLabel(elapsedSeconds);

        const displayTimestamp = timestampValue
          ? new Date(timestampValue).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : `00:${String(index).padStart(2, '0')}:00`;

        const messageText = String(msg.text ?? msg.message ?? '').trim();
        const rawMsgText = messageText;
        const isOrderRelease = msg.speaker === 'system' && rawMsgText.toLowerCase().startsWith('order released:');
        const isTeamCommInitiated = msg.speaker === 'system' && rawMsgText.toLowerCase().startsWith('team communication initiated.');

        return {
          id: (msg.id as string) || index.toString(),
          speaker: (isOrderRelease ? 'order' : isTeamCommInitiated ? 'sbar_report' :
            msg.speaker === 'student' ? 'user' :
            msg.speaker === 'student_team_comm' ? 'student_team_comm' :
            msg.speaker === 'avatar' ? 'assistant' :
            msg.speaker === 'provider' ? 'provider' :
            msg.speaker === 'sbar_report' ? 'sbar_report' :
            msg.speaker === 'system' ? 'system' : 'assistant') as TranscriptMessage['speaker'],
          message: messageText,
          timestamp: displayTimestamp,
          timestampValue: timestampValue ?? undefined,
          elapsedTime,
          elapsedSeconds,
          duration: typeof msg.duration === 'number' ? msg.duration : undefined,
          _orderKey: typeof elapsedSeconds === 'number' ? elapsedSeconds :
            (timestampValue && scenarioStartMs
              ? Math.max(0, Math.round((timestampValue - scenarioStartMs) / 1000))
              : index),
          _originalIndex: index,
        } satisfies TranscriptMessage;
      })
      .filter((msg) => msg.message.length > 0)
      .sort((a, b) => timelineComparator(a as unknown as TimelineSortItem, b as unknown as TimelineSortItem))
      ?? []) as TranscriptMessage[];

    // ── Flatten summaryByCategory ─────────────────────────────────────────────
    const flattenSummaryCategory = (cat: Record<string, unknown>): unknown[] => {
      const results: unknown[] = [];
      for (const val of Object.values(cat)) {
        if (typeof val === 'string') continue;
        if (Array.isArray(val)) {
          results.push(...val.filter((item) => typeof item !== 'string'));
        } else if (val && typeof val === 'object') {
          for (const inner of Object.values(val as Record<string, unknown>)) {
            if (Array.isArray(inner)) {
              results.push(...inner.filter((item) => typeof item !== 'string'));
            }
          }
        }
      }
      return results;
    };

    const summaryEntriesData =
      reportData?.summaryByCategory && typeof reportData.summaryByCategory === 'object'
        ? (() => {
            const flat = flattenSummaryCategory(reportData.summaryByCategory);
            const seenVitals = new Set<string>();
            return flat
              .filter((e) => {
                if (typeof e !== 'object' || e === null || Array.isArray(e)) return false;
                const entry = e as { id?: string; category?: string };
                if (!entry?.id) return true;
                if (entry.category?.toLowerCase() === 'system') return false;
                if (entry.category?.toLowerCase() === 'vitals') {
                  if (seenVitals.has(entry.id)) return false;
                  seenVitals.add(entry.id);
                  return false;
                }
                return true;
              })
              .sort((a, b) =>
                ((a as { timestampValue?: number })?.timestampValue ?? 0) -
                ((b as { timestampValue?: number })?.timestampValue ?? 0),
              );
          })()
        : ((reportData?.summaryEntries ?? []) as Array<{ category?: string }>).filter(
            (e) => e.category?.toLowerCase() !== 'vitals',
          );

    // ── Extract vitals map ────────────────────────────────────────────────────
    if (reportData?.summaryByCategory) {
      const rawVitals = reportData.summaryByCategory.vitals;
      if (rawVitals && typeof rawVitals === 'object' && !Array.isArray(rawVitals)) {
        const shortKey: Record<string, string> = {
          'heart rate': 'hr', 'heart rate recorded': 'hr',
          'blood pressure': 'bp', 'blood pressure recorded': 'bp',
          'respiratory rate': 'rr', 'respiratory rate recorded': 'rr',
          'oxygen saturation': 'spo2', 'oxygen saturation recorded': 'spo2', 'spo2 recorded': 'spo2',
          'temperature': 'temp', 'temperature recorded': 'temp',
        };
        const normalized: Record<string, Array<{ title?: string; details?: string }>> = {};
        Object.entries(rawVitals as Record<string, unknown>).forEach(([k, v]) => {
          if (!Array.isArray(v) || v.length === 0) return;
          const key = shortKey[k.toLowerCase()] ?? k.toLowerCase();
          normalized[key] = v as Array<{ title?: string; details?: string }>;
        });
        if (Object.keys(normalized).length > 0) vitalsMapState = normalized;
      }
    }

    // ── Build grading lookup ──────────────────────────────────────────────────
    const actionGradingMap = new Map<string, { satisfactory: boolean; creditAwarded: boolean }>();
    const allGradedActions = [
      ...((reportData?.mandatoryActions as Array<{ title: string; type: string; isCorrect: boolean; pointsAwarded?: number }>) || []),
      ...((reportData?.optionalActions as Array<{ title: string; type: string; isCorrect: boolean; pointsAwarded?: number }>) || []),
    ];
    for (const action of allGradedActions) {
      if (action.title) {
        actionGradingMap.set(action.title.toLowerCase(), {
          satisfactory: action.isCorrect,
          creditAwarded: action.pointsAwarded !== undefined ? action.pointsAwarded > 0 : action.isCorrect,
        });
      }
    }
    if (actionGradingMap.size === 0 && Array.isArray(reportData?.actionsTimeline)) {
      for (const entry of reportData.actionsTimeline as Array<{ title?: string; grading?: boolean | number }>) {
        if (entry.title && entry.grading !== undefined && entry.grading !== null) {
          const isCorrect = entry.grading === true || entry.grading === 1;
          actionGradingMap.set(entry.title.toLowerCase(), { satisfactory: isCorrect, creditAwarded: isCorrect });
        }
      }
    }

    // ── Build summaryTimelineItems ────────────────────────────────────────────
    const summaryTimelineItems: TimelineItem[] = summaryEntriesData.map((rawEntry) => {
      const entry = rawEntry as SummaryEntry;
      const timestampValue = entry.timestampValue || 0;
      const elapsedSeconds =
        entry.elapsedSeconds ??
        (timestampValue && scenarioStartMs
          ? Math.max(0, Math.round((timestampValue - scenarioStartMs) / 1000))
          : undefined);
      const elapsedTime = entry.elapsedTime ?? (elapsedSeconds !== undefined ? formatElapsedLabel(elapsedSeconds) : undefined);

      let duration = entry.duration;
      let score = entry.score;
      if (entry.details) {
        const dMatch = entry.details.match(/Duration:\s*(\d+)s/i);
        if (dMatch) {
          duration = parseInt(dMatch[1], 10);
        } else {
          const mMatch = entry.details.match(/Duration:\s*(\d+)m\s*(\d+)s/i);
          if (mMatch) duration = parseInt(mMatch[1], 10) * 60 + parseInt(mMatch[2], 10);
        }
        const sMatch = entry.details.match(/Score:\s*(\d+)%/i);
        if (sMatch) score = parseInt(sMatch[1], 10);
        if (duration === undefined) {
          const sM = entry.details.match(/Started:\s*([^|]*)/i);
          const eM = entry.details.match(/Ended:\s*([^|]*)/i);
          if (sM && eM) {
            try {
              const sDate = new Date(sM[1].trim());
              const eDate = new Date(eM[1].trim());
              if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime())) {
                duration = Math.max(0, Math.round((eDate.getTime() - sDate.getTime()) / 1000));
              }
            } catch { /* ignore */ }
          }
        }
      }

      const isActionOrMedication = ['actions', 'action', 'clinical', 'medications', 'orders'].includes((entry.category ?? '').toLowerCase());
      const shouldUseIndividualCorrectness = isActionOrMedication && entry.correct !== undefined;
      const isVitalEntry = entry.type === 'vital' || entry.type === 'vital-signs' || entry.category?.toLowerCase() === 'vitals';
      const rawEntryGrading = (rawEntry as Record<string, unknown>).grading;

      const grading = shouldUseIndividualCorrectness
        ? { satisfactory: entry.correct, creditAwarded: entry.correct }
        : isVitalEntry && rawEntryGrading !== undefined && rawEntryGrading !== null
          ? { satisfactory: rawEntryGrading === true || rawEntryGrading === 1, creditAwarded: rawEntryGrading === true || rawEntryGrading === 1 }
          : entry.title ? actionGradingMap.get(entry.title.toLowerCase()) : undefined;

      const fallbackGrading = !grading && entry.correct !== undefined
        ? { satisfactory: entry.correct, creditAwarded: entry.correct }
        : undefined;

      return {
        type: 'summary' as const,
        data: {
          ...entry,
          id: entry.id,
          category: entry.category || 'summary',
          title: entry.title,
          details: entry.details,
          timestamp: entry.timestamp,
          timestampValue,
          elapsedTime,
          elapsedSeconds,
          duration,
          score,
          ...(entry.type && { type: entry.type }),
          ...(entry.vitals && { vitals: entry.vitals }),
          ...(grading && { satisfactory: grading.satisfactory, creditAwarded: grading.creditAwarded }),
          ...(fallbackGrading && !grading && { satisfactory: fallbackGrading.satisfactory, creditAwarded: fallbackGrading.creditAwarded }),
        },
      };
    });

    // ── Build messageTimelineItems ────────────────────────────────────────────
    const messageTimelineItems: TimelineItem[] = transcriptMessages.map((msg) => ({
      type: 'message' as const,
      data: {
        ...msg,
        _orderKey:
          (typeof msg.elapsedSeconds === 'number' ? msg.elapsedSeconds : undefined) ??
          msg._orderKey ??
          (msg.elapsedTime ? parseElapsedTimeToSeconds(msg.elapsedTime) : undefined),
      },
    }));

    // ── Build commonActionItems ───────────────────────────────────────────────
    const commonActionItems: TimelineItem[] = (
      (reportData?.commonActionTracker?.actionLog as CommonActionEntry[] | undefined) ?? []
    ).map((action) => ({ type: 'commonAction' as const, data: action }));

    // ── Merge and sort ────────────────────────────────────────────────────────
    const combinedTimeline: TimelineItem[] = [
      ...messageTimelineItems,
      ...summaryTimelineItems,
      ...commonActionItems,
    ].sort((a, b) => timelineComparator(a as unknown as TimelineSortItem, b as unknown as TimelineSortItem));

    // ── SBAR session merging ──────────────────────────────────────────────────
    type SbarSession = {
      prompt?: string; submission?: string;
      startMs?: number; submitMs?: number;
      startElapsed?: string; submitElapsed?: string;
      startSeconds?: number; submitSeconds?: number;
    };
    const unifiedTimeline: TimelineItem[] = [];
    let currentSbarSession: SbarSession | null = null;
    let pendingStudentTeamComm: TimelineItem[] = [];

    for (const item of combinedTimeline) {
      if (item.type === 'message') {
        const msg = item.data;
        const text = (msg.message || '').trim();
        if (text.toLowerCase().startsWith('team communication initiated. prompt:')) {
          const promptMatch = text.match(/prompt:\s*(.*)/i);
          const prevSbar: SbarSession = currentSbarSession ?? {};
          currentSbarSession = {
            ...prevSbar,
            prompt: dynamicTeamCommPrompt ?? (promptMatch ? promptMatch[1] : text),
            startMs: msg.timestampValue ?? prevSbar.startMs,
            startElapsed: msg.elapsedTime ?? prevSbar.startElapsed,
            startSeconds: msg.elapsedSeconds ?? prevSbar.startSeconds,
          };
          continue;
        }
        if (msg.speaker === 'sbar_report') {
          const prevSbar: SbarSession = currentSbarSession ?? {};
          currentSbarSession = {
            ...prevSbar, submission: text,
            submitMs: msg.timestampValue ?? prevSbar.submitMs,
            submitElapsed: msg.elapsedTime ?? prevSbar.submitElapsed,
            submitSeconds: msg.elapsedSeconds ?? prevSbar.submitSeconds,
          };
          continue;
        }
        if (msg.speaker === 'student_team_comm' && currentSbarSession !== null) {
          pendingStudentTeamComm.push(item);
          continue;
        }
      } else if (item.type === 'summary') {
        const entry = item.data;
        if (entry.title === 'Team Communication') {
          const details = entry.details ?? '';
          if (details.toLowerCase().includes('initiated. prompt:')) {
            if (!currentSbarSession) currentSbarSession = {};
            const promptMatch = details.match(/prompt:\s*(.*)/i);
            const parsedPrompt = promptMatch ? promptMatch[1] : details;
            currentSbarSession.prompt = dynamicTeamCommPrompt ?? currentSbarSession.prompt ?? parsedPrompt;
            if (!currentSbarSession.startMs) currentSbarSession.startMs = entry.timestampValue;
            if (!currentSbarSession.startElapsed) currentSbarSession.startElapsed = entry.elapsedTime;
            if (!currentSbarSession.startSeconds) currentSbarSession.startSeconds = entry.elapsedSeconds;
            continue;
          } else if (details.toLowerCase().includes('result:')) {
            if (!currentSbarSession) { continue; }
            const resultMatch = details.match(/result:\s*([^|]+)/i);
            const qualitativeResult = resultMatch ? resultMatch[1].trim() : details;
            const sessionStartMs =
              currentSbarSession?.startMs ??
              (currentSbarSession?.startSeconds !== undefined && currentSbarSession.startSeconds !== null && scenarioStartMs !== null
                ? scenarioStartMs + currentSbarSession.startSeconds * 1000
                : undefined) ??
              (currentSbarSession?.startElapsed && scenarioStartMs !== null
                ? scenarioStartMs + parseElapsedTimeToSeconds(currentSbarSession.startElapsed) * 1000
                : undefined) ??
              entry.timestampValue;

            const unifiedEntry: TimelineItem = {
              type: 'summary',
              data: {
                ...entry,
                category: 'Team Communication', title: 'Team Communication',
                sbarPrompt: currentSbarSession?.prompt ?? 'No prompt recorded',
                sbarSubmission: currentSbarSession?.submission ?? 'No submission recorded',
                sbarQualitativeResult: qualitativeResult,
                sbarStartElapsed: currentSbarSession?.startElapsed ?? entry.elapsedTime,
                sbarSubmitElapsed: currentSbarSession?.submitElapsed ?? entry.elapsedTime,
                sbarStartMs: sessionStartMs,
                sbarSubmitMs:
                  currentSbarSession?.submitMs ??
                  (currentSbarSession?.submitSeconds !== undefined && currentSbarSession.submitSeconds !== null && scenarioStartMs !== null
                    ? scenarioStartMs + currentSbarSession.submitSeconds * 1000
                    : undefined) ??
                  entry.timestampValue,
                elapsedTime: currentSbarSession?.startElapsed ?? entry.elapsedTime,
                elapsedSeconds: currentSbarSession?.startSeconds ?? entry.elapsedSeconds,
                timestampValue: sessionStartMs,
              } as SummaryEntry,
            };
            unifiedTimeline.push(unifiedEntry);
            pendingStudentTeamComm.forEach((tcItem, idx) => {
              const tcMsg = tcItem.data as TranscriptMessage;
              const rawTs = tcMsg.timestampValue ?? 0;
              const adjustedTs = rawTs > sessionStartMs ? rawTs : sessionStartMs + idx + 1;
              unifiedTimeline.push({ type: 'message', data: { ...tcMsg, timestampValue: adjustedTs } });
            });
            pendingStudentTeamComm = [];
            currentSbarSession = null;
            continue;
          } else {
            continue;
          }
        }
      }
      unifiedTimeline.push(item);
    }

    if (pendingStudentTeamComm.length > 0) {
      unifiedTimeline.push(...pendingStudentTeamComm);
    }

    unifiedTimeline.sort((a, b) =>
      timelineComparator(a as unknown as TimelineSortItem, b as unknown as TimelineSortItem),
    );
    timelineItems = unifiedTimeline;
  }

  return {
    reportId,
    timelineItems,
    vitalsMapState,
    report,
    displayClassName,
    realSessionStartTime,
    simulationStartDate,
    simulationStartTime,
  };
}
