/** Flexible header shape — normalises camelCase / snake_case API keys */
export interface TranscriptHeader {
  studentName?: string;
  student_name?: string;
  studentCode?: string;
  student_code?: string;
  className?: string;
  class_name?: string;
  simulationName?: string;
  simulation_name?: string;
  simulationType?: string;
  simulation_type?: string;
  /** Attempt mode — "Practice" or "Assessment". */
  mode?: string;
  reportType?: string;
  report_type?: string;
  attemptId?: string;
  attempt_id?: string;
  realDate?: string;
  real_date?: string;
  realTime?: string;
  real_time?: string;
  simulationDate?: string;
  simulation_date?: string;
  simulationTime?: string;
  simulation_time?: string;
  totalDuration?: string;
  total_duration?: string;
  [key: string]: unknown;
}

/** A single timeline event — open-ended to support future types */
export interface TranscriptEventData {
  id?: string;
  type: string;
  simulationTime?: string;
  simulation_time?: string;
  title?: string;
  speaker?: string;
  transcript?: string;
  description?: string;
  text?: string;
  content?: string;
  startedTime?: string;
  started_time?: string;
  start_time?: string;
  endedTime?: string;
  ended_time?: string;
  end_time?: string;
  duration?: string;
  status?: string;
  category?: string;
  subCategory?: string;
  sub_category?: string;
  name?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  /**
   * SBAR / Team-Communication fields (Phase 5). Populated by the backend
   * `extractSummaryEntries` pass-through for entries whose raw blob record
   * carries these keys. The renderer treats an event as an SBAR row when
   * `sbarQualitativeResult` is present.
   */
  sbarPrompt?: string;
  sbarSubmission?: string;
  sbarQualitativeResult?: string;
  sbarStartElapsed?: string;
  sbarSubmitElapsed?: string;
  sbarStartMs?: number;
  sbarSubmitMs?: number;
  [key: string]: unknown;
}

export interface UserTranscriptResponse {
  header: TranscriptHeader;
  events: TranscriptEventData[];
}
