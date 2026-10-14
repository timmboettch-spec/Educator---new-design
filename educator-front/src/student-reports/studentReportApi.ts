import {
  fetchReportById,
  fetchScenarioById,
  fetchTranscriptLog,
} from '../api/reportTranscriptApi';
import type {
  AssessmentReport,
  ConversationMessage,
  Scenario,
} from '../types/assessmentReport';

/** HS-online `lib/api` shape for student report/transcript views. */
export const studentReportApi = {
  getAdminReportsById: (reportId: string) =>
    fetchReportById(reportId) as Promise<AssessmentReport>,

  getLog: (logId: string) =>
    fetchTranscriptLog(logId) as Promise<{
      messages?: ConversationMessage[];
      startedAt?: string;
    }>,

  getScenario: (scenarioId: string) =>
    fetchScenarioById(scenarioId) as Promise<Scenario>,
};

/** Alias used by ported HS-online pages (`import { api } from ...`). */
export const api = studentReportApi;
