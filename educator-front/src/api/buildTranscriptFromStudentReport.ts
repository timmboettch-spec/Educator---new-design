import type {
  TranscriptHeader,
  UserTranscriptResponse,
} from '../types/userTranscript';
import {
  extractEvents,
  safeDate,
  safeSimValue,
  safeTime,
  splitSimDateTime,
  strOf,
} from './userTranscriptApi.legacy';

// parses a number
function parseElapsedFromReport(
  report: Record<string, unknown>,
  key: string
): string | undefined {
  const raw = report[key];
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const secs = Math.max(0, Math.round(raw));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return undefined;
}

// exports student report to transcript format
export function buildTranscriptFromStudentReport(
  report: Record<string, unknown>,
  log: Record<string, unknown> | null
): UserTranscriptResponse {
  const payload: Record<string, unknown> = { ...report };

  if (log) {
    if (Array.isArray(log['messages'])) {
      payload.messages = log['messages'];
      payload.conversationHistory = log['messages'];
    }
    if (Array.isArray(log['conversationHistory'])) {
      payload.conversationHistory = log['conversationHistory'];
    }
  }

  const events = extractEvents(payload);

  const realDateRaw =
    strOf(
      report,
      'realDate',
      'real_date',
      'scenarioStartTime',
      'scenario_start_time',
      'sessionDate',
      'session_date',
      'createdAt',
      'created_at'
    ) || undefined;
  const realTimeRaw =
    strOf(
      report,
      'realTime',
      'real_time',
      'sessionTime',
      'session_time',
      'startTime',
      'start_time'
    ) || realDateRaw;

  const simDateField = safeSimValue(
    strOf(report, 'simulationDate', 'simulation_date', 'simDate', 'sim_date') ||
      undefined
  );
  const simTimeField = safeSimValue(
    strOf(report, 'simulationTime', 'simulation_time', 'simTime', 'sim_time') ||
      undefined
  );

  const startedAtCombined =
    strOf(
      report,
      'startedAt',
      'started_at',
      'scenarioStartTime',
      'scenario_start_time'
    ) || undefined;
  const splitSim = splitSimDateTime(startedAtCombined);

  const totalDuration =
    parseElapsedFromReport(report, 'totalTimeSeconds') ??
    (strOf(report, 'totalDuration', 'total_duration', 'duration') || undefined);

  const header: TranscriptHeader = {
    studentName:
      strOf(
        report,
        'studentName',
        'student_name',
        'fullName',
        'full_name',
        'name'
      ) || undefined,
    studentCode:
      strOf(
        report,
        'studentCode',
        'student_code',
        'studentId',
        'student_id',
        'userId',
        'user_id'
      ) || undefined,
    className:
      strOf(
        report,
        'className',
        'class_name',
        'studentClass',
        'student_class',
        'class'
      ) || undefined,
    simulationName:
      strOf(
        report,
        'simulationName',
        'simulation_name',
        'scenarioTitle',
        'scenario_title',
        'title'
      ) || undefined,
    simulationType:
      strOf(
        report,
        'simulationType',
        'simulation_type',
        'userRole',
        'user_role',
        'role',
        'mode'
      ) || undefined,
    attemptId:
      String(
        report['id'] ?? report['attemptId'] ?? report['attempt_id'] ?? ''
      ) || undefined,
    realDate: safeDate(realDateRaw),
    realTime: safeTime(realTimeRaw),
    simulationDate: simDateField ?? splitSim.date,
    simulationTime: simTimeField ?? splitSim.time,
    totalDuration,
  };

  return { header, events };
}
