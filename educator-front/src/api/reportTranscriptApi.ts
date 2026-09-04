import api from '../redux/api';
import config from '../redux/config';
import type { UserTranscriptResponse } from '../types/userTranscript';
import { buildTranscriptFromStudentReport } from './buildTranscriptFromStudentReport';
import { fetchUserTranscriptLegacy } from './userTranscriptApi.legacy';

const EXTRA_HEADERS = { 'ngrok-skip-browser-warning': 'true' };
const REQUEST_TIMEOUT_MS = 30_000;

export type AssessmentReport = Record<string, unknown>;

const reportCache = new Map<string, AssessmentReport>();
const logCache = new Map<string, Record<string, unknown>>();
const scenarioCache = new Map<string, Record<string, unknown>>();

export async function fetchReportById(
  reportId: string,
  options?: { skipCache?: boolean },
): Promise<AssessmentReport> {
  if (!options?.skipCache) {
    const cached = reportCache.get(reportId);
    if (cached) return cached;
  }

  const url = `${config.StudentAdminReportAPI}/${encodeURIComponent(reportId)}`;
  const res = await api.get<AssessmentReport>(url, {
    headers: EXTRA_HEADERS,
    timeout: REQUEST_TIMEOUT_MS,
  });
  reportCache.set(reportId, res.data);
  return res.data;
}

// fetch transcript log for a given transcript ID
export async function fetchTranscriptLog(
  transcriptId: string,
  options?: { skipCache?: boolean },
): Promise<Record<string, unknown>> {
  if (!options?.skipCache) {
    const cached = logCache.get(transcriptId);
    if (cached) return cached;
  }

  const url = `${config.StudentTranscriptLogAPI}/${encodeURIComponent(transcriptId)}`;
  const res = await api.get<Record<string, unknown>>(url, {
    headers: EXTRA_HEADERS,
    timeout: REQUEST_TIMEOUT_MS,
  });
  logCache.set(transcriptId, res.data);
  return res.data;
}

export async function fetchScenarioById(
  scenarioId: string,
  options?: { skipCache?: boolean },
): Promise<Record<string, unknown>> {
  if (!options?.skipCache) {
    const cached = scenarioCache.get(scenarioId);
    if (cached) return cached;
  }

  const url = `${config.StudentScenarioAPI}/${encodeURIComponent(scenarioId)}`;
  const res = await api.get<Record<string, unknown>>(url, {
    headers: EXTRA_HEADERS,
    timeout: REQUEST_TIMEOUT_MS,
  });
  scenarioCache.set(scenarioId, res.data);
  return res.data;
}

/** HS-online-shaped report + transcript log, with legacy Educator DTO fallback. */
export async function fetchUserTranscript(attemptId: string): Promise<UserTranscriptResponse> {
  try {
    const report = await fetchReportById(attemptId);
    const transcriptId = String(report['transcriptId'] ?? report['transcript_id'] ?? '').trim();

    let log: Record<string, unknown> | null = null;
    if (transcriptId) {
      try {
        log = await fetchTranscriptLog(transcriptId);
      } catch {
        log = null;
      }
    }

    return buildTranscriptFromStudentReport(report, log);
  } catch (studentErr) {
    try {
      return await fetchUserTranscriptLegacy(attemptId);
    } catch {
      throw studentErr;
    }
  }
}

/** @deprecated Use fetchReportById */
export const fetchStudentReportById = fetchReportById;
/** @deprecated Use fetchTranscriptLog */
export const fetchStudentLog = fetchTranscriptLog;
/** @deprecated Use fetchScenarioById */
export const fetchStudentScenario = fetchScenarioById;
export type StudentAssessmentReport = AssessmentReport;
