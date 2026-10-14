import api from '../redux/api';
import config from '../redux/config';
import type {
  UserTranscriptResponse,
  TranscriptEventData,
  TranscriptHeader,
} from '../types/userTranscript';

const EXTRA_HEADERS = { 'ngrok-skip-browser-warning': 'true' };

// ─── Low-level string extractor ───────────────────────────────────────────────

export function strOf(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (
      v != null &&
      String(v).trim() !== '' &&
      String(v) !== 'undefined' &&
      String(v) !== 'null'
    )
      return String(v);
  }
  return '';
}

// ─── Date / time formatters ───────────────────────────────────────────────────

/** Any date string (ISO, YYYY-MM-DD, "June 29 2026") → "June 29, 2026" */
function fmtDate(raw: string): string {
  try {
    // Plain YYYY-MM-DD — parse in local time to avoid UTC midnight shift
    const d = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? new Date(`${raw}T00:00:00`)
      : new Date(raw);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/** Any time/datetime string → "HH:MM" */
function fmtTime(raw: string): string {
  try {
    // "HH:MM" or "HH:MM:SS" — take first two segments directly
    const m = raw.match(/^(\d{2}):(\d{2})/);
    if (m) return `${m[1]}:${m[2]}`;
    // ISO datetime
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

/** Safe date: formats and returns undefined instead of empty string */
export function safeDate(raw: string | undefined): string | undefined {
  if (!raw || raw === 'undefined' || raw === 'null') return undefined;
  return fmtDate(raw) || undefined;
}

/** Safe time: formats and rejects bare numbers like "10" */
export function safeTime(raw: string | undefined): string | undefined {
  if (!raw || raw === 'undefined' || raw === 'null') return undefined;
  if (/^\d+$/.test(raw.trim())) return undefined; // bare integer — meaningless
  return fmtTime(raw) || undefined;
}

/**
 * Simulation clock values (SIM DATE / SIM TIME):
 * Only keep "HH:MM"-style or short formatted values.
 * Reject raw ISO datetimes, YYYY-MM-DD dates, and bare numbers.
 */
export function safeSimValue(raw: string | undefined): string | undefined {
  if (!raw || raw === 'undefined' || raw === 'null') return undefined;
  if (/^\d+$/.test(raw.trim())) return undefined; // bare number like "10"
  if (raw.includes('T') && raw.includes('Z')) return undefined; // full ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return undefined; // YYYY-MM-DD date
  return raw; // "06:00", "Jan 01" etc. — keep as-is
}

export function splitSimDateTime(raw: string | undefined): {
  date?: string;
  time?: string;
} {
  if (!raw) return {};
  const v = raw.trim();
  if (!v) return {};
  if (v.includes(',')) {
    const [datePart, timePart] = v.split(',');
    const date = (datePart ?? '').trim();
    const time = (timePart ?? '').trim();
    return {
      date: date || undefined,
      time: /^\d{1,2}:\d{2}$/.test(time) ? time : undefined,
    };
  }
  return {};
}

// ─── Event type normaliser ────────────────────────────────────────────────────

function normType(raw: string): string {
  const t = raw.toLowerCase().replace(/[\s_-]+/g, '');
  if (
    t === 'student' ||
    t === 'user' ||
    t === 'learner' ||
    t === 'nurse' ||
    t === 'studentspeech' ||
    t === 'userspeech'
  )
    return 'STUDENT';
  if (
    t === 'patient' ||
    t === 'assistant' ||
    t === 'ai' ||
    t === 'bot' ||
    t === 'simulation' ||
    t === 'systemresponse' ||
    t === 'provider' ||
    t === 'doctor' ||
    t === 'physician' ||
    t === 'patientspeech' ||
    t === 'providerspeech'
  )
    return 'PATIENT';
  // Everything else (category domains like INFECTION, HYGIENE, MEDICATION, etc.) → action event
  return 'COMMON_ACTIONS';
}

// ─── Entry mappers ────────────────────────────────────────────────────────────

/** Convert a unix timestamp (ms or seconds) or its stringified form to an ISO string. */
function unixMsToIso(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // 13-digit → unix milliseconds
  if (/^\d{13}$/.test(raw.trim())) {
    return new Date(parseInt(raw, 10)).toISOString();
  }
  // 10-digit → unix seconds
  if (/^\d{10}$/.test(raw.trim())) {
    return new Date(parseInt(raw, 10) * 1000).toISOString();
  }
  return raw;
}

function mapEntry(e: Record<string, unknown>): TranscriptEventData {
  const admin = e['administrationDetails'] as
    Record<string, unknown> | undefined;
  const startT = unixMsToIso(
    strOf(
      admin ?? {},
      'startTime',
      'start_time',
      'startedTime',
      'started_time',
      'startAt',
      'start_at',
      'startDateTime',
      'start_date_time'
    ) ||
      strOf(
        e,
        'startTime',
        'start_time',
        'startedTime',
        'started_time',
        'startAt',
        'start_at',
        'startDateTime',
        'start_date_time',
        'startTimestampValue',
        'start_timestamp_value',
        'startTimestamp',
        'start_timestamp',
        'timestamp',
        'actionTime',
        'action_time',
        'time',
        'occurredAt',
        'occurred_at',
        'eventTime',
        'event_time',
        'actionStartTime',
        'action_start_time'
      )
  );
  const endT = unixMsToIso(
    strOf(
      admin ?? {},
      'endTime',
      'end_time',
      'endedTime',
      'ended_time',
      'endAt',
      'end_at',
      'endDateTime',
      'end_date_time'
    ) ||
      strOf(
        e,
        'endTime',
        'end_time',
        'endedTime',
        'ended_time',
        'endAt',
        'end_at',
        'endDateTime',
        'end_date_time',
        'timestampValue',
        'timestamp_value',
        'endTimestampValue',
        'end_timestamp_value',
        'endTimestamp',
        'end_timestamp',
        'completedAt',
        'completed_at',
        'actionEndTime',
        'action_end_time'
      ) ||
      startT
  );

  // The API may store the action domain ("INFECTION", "HYGIENE") in the 'type' field.
  // We preserve that as the visible category, and normalise 'type' to the event kind.
  const rawTypeField =
    strOf(e, 'type', 'eventType', 'event_type') || 'COMMON_ACTIONS';
  const normalisedType = normType(rawTypeField);
  // If normType() converted an unrecognised domain name → COMMON_ACTIONS,
  // keep the original domain name as the visible category label.
  const explicitCategory = strOf(e, 'category', 'subCategory', 'sub_category');
  // Known question/MCQ types that represent clinical actions — must resolve to 'actions'
  // so the Actions filter matches them. Without this, e.g. type='single' would produce
  // category='single' which never matches catIncludes(ev, 'action') in matchesFilter.
  const rawTypeLower = rawTypeField.toLowerCase().replace(/[\s_-]+/g, '');
  const QUESTION_TO_ACTIONS = new Set([
    'single',
    'multiplechoice',
    'mcq',
    'question',
    'openended',
    'ordering',
    'sequential',
  ]);
  const QUESTION_TO_VITALS = new Set(['vitalsigns', 'vital']);
  const inferredCategory = QUESTION_TO_ACTIONS.has(rawTypeLower)
    ? 'actions'
    : QUESTION_TO_VITALS.has(rawTypeLower)
      ? 'vitals'
      : rawTypeField;
  const categoryDisplay =
    explicitCategory ||
    (normalisedType === 'COMMON_ACTIONS' && rawTypeField !== 'COMMON_ACTIONS'
      ? inferredCategory
      : '') ||
    undefined;

  // Spread the full original entry so extra fields (dose, route, frequency, etc.)
  // are preserved for rendering and are accessible via the [key: string]: unknown index.
  // Elapsed time: prefer string form (e.g. "0:34"), fall back to computing from elapsedSeconds
  const elapsedStr =
    strOf(
      e,
      'elapsedTime',
      'elapsed_time',
      'timeElapsed',
      'time_elapsed',
      'simTime',
      'sim_time'
    ) || undefined;
  const elapsedSecsRaw =
    e['elapsedSeconds'] ??
    e['elapsed_seconds'] ??
    e['elapsedSecs'] ??
    e['elapsedSec'];
  const elapsedFromSecs = elapsedStr
    ? undefined
    : typeof elapsedSecsRaw === 'number'
      ? (() => {
          const s = Math.max(0, Math.round(elapsedSecsRaw));
          const m = Math.floor(s / 60);
          return `${m}:${String(s % 60).padStart(2, '0')}`;
        })()
      : typeof elapsedSecsRaw === 'string' && elapsedSecsRaw.trim()
        ? (() => {
            const s = Math.max(0, Math.round(parseFloat(elapsedSecsRaw)));
            const m = Math.floor(s / 60);
            return `${m}:${String(s % 60).padStart(2, '0')}`;
          })()
        : undefined;
  return {
    ...e,
    id: e['id'] as string | undefined,
    type: normalisedType,
    // Preserve the original raw type (e.g. 'single', 'question', 'ordering') as subType
    // so the transcript component can render 'Multiple Choice Question' etc. correctly.
    // After normalisation, raw['type'] === 'COMMON_ACTIONS', so we save it here.
    subType:
      rawTypeField !== normalisedType && rawTypeField !== 'COMMON_ACTIONS'
        ? rawTypeField
        : strOf(
            e,
            'subType',
            'subtype',
            'actionSubtype',
            'action_subtype',
            'questionType',
            'question_type',
            'itemType',
            'item_type'
          ) || undefined,
    simulationTime: elapsedStr ?? elapsedFromSecs ?? undefined,
    title:
      strOf(
        e,
        'title',
        'name',
        'actionName',
        'action_name',
        'actionTitle',
        'action_title',
        'label',
        'action',
        'itemName',
        'item_name',
        'displayName',
        'display_name'
      ) || undefined,
    description:
      strOf(e, 'details', 'description', 'text', 'content', 'message') ||
      undefined,
    question:
      strOf(
        e,
        'question',
        'clinicalPrompt',
        'clinical_prompt',
        'prompt',
        'questionText',
        'question_text',
        'clinicalQuestion',
        'clinical_question',
        'actionQuestion',
        'action_question',
        'promptText',
        'prompt_text'
      ) || undefined,
    answer:
      strOf(
        e,
        'answer',
        'response',
        'studentResponse',
        'student_response',
        'studentAnswer',
        'student_answer',
        'selectedAnswer',
        'selected_answer',
        'submittedAnswer',
        'submitted_answer',
        'submittedResponse',
        'submitted_response',
        'answerText',
        'answer_text',
        'responseText',
        'response_text'
      ) || undefined,
    notes:
      strOf(
        e,
        'notes',
        'observations',
        'clinicalObservations',
        'clinical_observations',
        'observationNotes',
        'observation_notes',
        'instructorNotes',
        'instructor_notes',
        'feedbackNotes',
        'feedback_notes',
        'clinicalNotes',
        'clinical_notes'
      ) || undefined,
    category: categoryDisplay || undefined,
    startedTime: startT || undefined,
    endedTime: endT || undefined,
    status: strOf(e, 'status') || undefined,
  };
}

function mapConvItem(m: Record<string, unknown>): TranscriptEventData | null {
  const content = strOf(
    m,
    'content',
    'message',
    'text',
    'description',
    'details',
    'transcript'
  );
  if (!content) return null;
  const role = strOf(m, 'role', 'speaker', 'type') || 'user';
  const ts = unixMsToIso(
    strOf(
      m,
      'timestamp',
      'startTime',
      'start_time',
      'startedTime',
      'started_time',
      'startTimestampValue',
      'start_timestamp_value',
      'time'
    )
  );
  const endTs =
    unixMsToIso(
      strOf(
        m,
        'endTime',
        'end_time',
        'endedTime',
        'ended_time',
        'timestampValue',
        'timestamp_value'
      )
    ) || ts;
  return {
    ...m,
    id: m['id'] as string | undefined,
    type: normType(role),
    simulationTime:
      strOf(m, 'elapsedTime', 'elapsed_time', 'simTime', 'simulation_time') ||
      undefined,
    description: content,
    speaker: role,
    startedTime: ts || undefined,
    endedTime: endTs || undefined,
  };
}

// ─── Universal event extractor — works for both endpoint response shapes ──────

export function extractEvents(
  body: Record<string, unknown>
): TranscriptEventData[] {
  const rd =
    body['report_data'] && typeof body['report_data'] === 'object'
      ? (body['report_data'] as Record<string, unknown>)
      : undefined;

  // ── helpers ──────────────────────────────────────────────────────────────

  const seenIds = new Set<string>();
  const allMapped: TranscriptEventData[] = [];

  /** Map an array of raw action/summary items and deduplicate */
  function addBatch(arr: unknown[] | undefined, defaultCategory?: string) {
    if (!Array.isArray(arr) || arr.length === 0) return;
    for (const item of arr as Record<string, unknown>[]) {
      // Inject a default category when the item itself has none (e.g. sbarSession items)
      const entry: Record<string, unknown> =
        defaultCategory && !item['category'] && !item['type']
          ? { ...item, category: defaultCategory }
          : item;
      const mapped = mapEntry(entry);
      const key = mapped.id ?? JSON.stringify(mapped);
      if (!seenIds.has(key)) {
        seenIds.add(key);
        allMapped.push(mapped);
      }
    }
  }

  /** Map an array of conversation-style messages and deduplicate */
  function addConvBatch(arr: unknown[] | undefined) {
    if (!Array.isArray(arr) || arr.length === 0) return;
    for (const m of arr as Record<string, unknown>[]) {
      const ev = mapConvItem(m);
      if (!ev) continue;
      const key = ev.id ?? JSON.stringify(ev);
      if (!seenIds.has(key)) {
        seenIds.add(key);
        allMapped.push(ev);
      }
    }
  }

  /** Resolve a key from body or its report_data sub-object */
  function resolve(key: string): unknown {
    return body[key] ?? rd?.[key];
  }

  // ── 1. Named action / summary arrays ─────────────────────────────────────
  for (const key of [
    'events',
    'transcriptEvents',
    'entries',
    'actions',
    'actionEntries',
    'action_entries',
    'commonActions',
    'common_actions',
  ]) {
    addBatch(resolve(key) as unknown[] | undefined);
  }

  // ── 2. summaryEntries (demographics, history, medications, orders …) ─────
  for (const key of ['summaryEntries', 'summary_entries', 'summaries']) {
    addBatch(resolve(key) as unknown[] | undefined);
  }

  // ── 2b. summaryByCategory buckets (actions/history/medications/orders...) ─
  const summaryByCategory =
    (resolve('summaryByCategory') as Record<string, unknown> | undefined) ??
    (resolve('summary_by_category') as Record<string, unknown> | undefined);
  if (summaryByCategory && typeof summaryByCategory === 'object') {
    for (const bucket of [
      'actions',
      'history',
      'medications',
      'orders',
      'demographics',
    ]) {
      addBatch(summaryByCategory[bucket] as unknown[] | undefined, bucket);
    }
  }

  // ── 3. commonActionTracker.actionLog ─────────────────────────────────────
  for (const trackerKey of [
    'commonActionTracker',
    'common_action_tracker',
    'actionTracker',
  ]) {
    const tracker = resolve(trackerKey) as Record<string, unknown> | undefined;
    if (tracker && typeof tracker === 'object') {
      addBatch(
        (tracker['actionLog'] ?? tracker['action_log'] ?? tracker['log']) as
          unknown[] | undefined
      );
    }
  }

  // ── 4. SBAR / Team Communication sessions ────────────────────────────────
  for (const key of [
    'sbarSession',
    'sbarSessions',
    'sbar_sessions',
    'sbar',
    'sbarEntries',
    'teamCommunication',
    'team_communication',
  ]) {
    const raw = resolve(key);
    // May be an array directly or an object with a nested array
    const arr = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object'
        ? ((raw as Record<string, unknown>)['entries'] ??
          (raw as Record<string, unknown>)['messages'] ??
          (raw as Record<string, unknown>)['log'])
        : undefined;
    addBatch(arr as unknown[] | undefined, 'SBAR');
  }

  // ── 5. Conversation / speech messages (student ↔ patient) ─────────────────
  for (const key of [
    'transcript',
    'messages',
    'conversation',
    'chatHistory',
    'chat_history',
    'conversationHistory',
    'conversation_history',
    'chatLog',
    'chat_log',
    'log',
    'studentResponses',
    'student_responses',
    'patientResponses',
    'patient_responses',
  ]) {
    addConvBatch(resolve(key) as unknown[] | undefined);
  }

  return allMapped.sort((a, b) => {
    const ta = parseFloat((a.simulationTime ?? '').replace(':', '.')) || 0;
    const tb = parseFloat((b.simulationTime ?? '').replace(':', '.')) || 0;
    return ta - tb;
  });
}

// ─── Normalise primary endpoint response ──────────────────────────────────────

/**
 * The primary endpoint returns the header with raw/unformatted values
 * (e.g. realDate:"2026-06-29", simulationDate:"2026-06-29T05:45:51.818Z", simulationTime:"10").
 * This function formats dates and strips invalid simulation clock values,
 * then extracts events from whichever field the API uses.
 */
function normalizePrimaryResponse(
  raw: Record<string, unknown>
): UserTranscriptResponse {
  // Unwrap { data: ... } envelope if present
  const body =
    raw['data'] && typeof raw['data'] === 'object'
      ? (raw['data'] as Record<string, unknown>)
      : raw;

  // Merge parent body with any nested 'header' sub-object so that fields present
  // on either level are always reachable. The header sub-object wins on key conflicts.
  const headerSub =
    body['header'] && typeof body['header'] === 'object'
      ? (body['header'] as Record<string, unknown>)
      : {};
  const rh: Record<string, unknown> = { ...body, ...headerSub };
  const events = extractEvents(body);

  const summaryByCategory =
    body['summaryByCategory'] && typeof body['summaryByCategory'] === 'object'
      ? (body['summaryByCategory'] as Record<string, unknown>)
      : body['summary_by_category'] &&
          typeof body['summary_by_category'] === 'object'
        ? (body['summary_by_category'] as Record<string, unknown>)
        : undefined;
  const actionsList = Array.isArray(summaryByCategory?.['actions'])
    ? (summaryByCategory?.['actions'] as Record<string, unknown>[])
    : [];
  const firstAction = (actionsList[0] ?? {}) as Record<string, unknown>;
  const firstEvent = (events[0] ?? {}) as Record<string, unknown>;

  // A single combined datetime field may carry both real date AND real time.
  // Try dedicated date/time keys first; fall back to any datetime field.
  const realDateRaw =
    strOf(
      rh,
      'realDate',
      'real_date',
      'sessionDate',
      'session_date',
      'startDate',
      'start_date',
      'scenarioStartTime',
      'scenario_start_time',
      'createdAt',
      'created_at'
    ) || undefined;

  const realTimeRaw =
    strOf(
      rh,
      'realTime',
      'real_time',
      'sessionTime',
      'session_time',
      'startTime',
      'start_time'
    ) || realDateRaw; // fall back to datetime field

  const simDateField = safeSimValue(
    strOf(rh, 'simulationDate', 'simulation_date', 'simDate', 'sim_date') ||
      undefined
  );
  const simTimeField = safeSimValue(
    strOf(rh, 'simulationTime', 'simulation_time', 'simTime', 'sim_time') ||
      undefined
  );

  const startedAtCombined =
    strOf(rh, 'startedAt', 'started_at') ||
    strOf(firstAction, 'startedAt', 'started_at', 'timestamp') ||
    strOf(
      firstEvent,
      'startedAt',
      'started_at',
      'startedTime',
      'started_time',
      'timestamp',
      'time'
    ) ||
    strOf(rh, 'scenarioStartTime', 'scenario_start_time');

  const splitSim = splitSimDateTime(startedAtCombined || undefined);

  const header: TranscriptHeader = {
    studentName:
      strOf(
        rh,
        'studentName',
        'student_name',
        'fullName',
        'full_name',
        'name'
      ) || undefined,
    studentCode:
      strOf(
        rh,
        'studentCode',
        'student_code',
        'studentId',
        'student_id',
        'userId',
        'user_id',
        'userCode',
        'user_code',
        'code'
      ) || undefined,
    className:
      strOf(
        rh,
        'className',
        'class_name',
        'studentClass',
        'student_class',
        'class',
        'groupName',
        'group_name',
        'group'
      ) || undefined,
    simulationName:
      strOf(
        rh,
        'simulationName',
        'simulation_name',
        'scenarioTitle',
        'scenario_title',
        'simulationTitle',
        'simulation_title',
        'simTitle',
        'sim_title',
        'scenarioId',
        'scenario_id',
        'title',
        'name'
      ) || undefined,
    simulationType:
      strOf(
        rh,
        'simulationType',
        'simulation_type',
        'mode',
        'userRole',
        'user_role',
        'role',
        'type'
      ) || undefined,
    attemptId: (rh['attemptId'] ?? rh['attempt_id'] ?? rh['id']) as
      string | undefined,
    // Format raw date strings — "2026-06-29" → "June 29, 2026"
    realDate: safeDate(realDateRaw),
    // "17:33:00" or full ISO → "17:33"
    realTime: safeTime(realTimeRaw),
    // Prefer explicit simulation fields, then derive from startedAt-like combined strings.
    simulationDate: simDateField ?? splitSim.date,
    simulationTime: simTimeField ?? splitSim.time,
    totalDuration:
      strOf(
        rh,
        'totalDuration',
        'total_duration',
        'totalTime',
        'total_time',
        'duration'
      ) || undefined,
  };

  return { header, events };
}

// ─── Build from /api/simulation-reports/:id fallback ─────────────────────────

function buildFromSimReport(
  raw: Record<string, unknown>
): UserTranscriptResponse {
  const r =
    raw['data'] && typeof raw['data'] === 'object'
      ? (raw['data'] as Record<string, unknown>)
      : raw;

  // Merge parent report with any nested 'header' sub-object so that fields present
  // on either level are always reachable. The header sub-object wins on key conflicts.
  const headerSub =
    r['header'] && typeof r['header'] === 'object'
      ? (r['header'] as Record<string, unknown>)
      : {};
  const rh: Record<string, unknown> = { ...r, ...headerSub };
  const events = extractEvents(r);

  const summaryByCategory =
    r['summaryByCategory'] && typeof r['summaryByCategory'] === 'object'
      ? (r['summaryByCategory'] as Record<string, unknown>)
      : r['summary_by_category'] && typeof r['summary_by_category'] === 'object'
        ? (r['summary_by_category'] as Record<string, unknown>)
        : undefined;
  const actionsList = Array.isArray(summaryByCategory?.['actions'])
    ? (summaryByCategory?.['actions'] as Record<string, unknown>[])
    : [];
  const firstAction = (actionsList[0] ?? {}) as Record<string, unknown>;
  const firstEvent = (events[0] ?? {}) as Record<string, unknown>;

  // Derive real date+time from a single datetime field when no dedicated keys exist
  const startIso =
    strOf(
      rh,
      'scenarioStartTime',
      'scenario_start_time',
      'realDate',
      'real_date',
      'sessionDate',
      'session_date',
      'startDate',
      'start_date',
      'createdAt',
      'created_at'
    ) || undefined;

  const realTimeRaw =
    strOf(rh, 'realTime', 'real_time', 'sessionTime', 'session_time') ||
    startIso;

  // Sim clock values come from explicit fields, then startedAt/timestamp strings.
  const simDateRaw = safeSimValue(
    strOf(rh, 'simulationDate', 'simulation_date', 'simDate', 'sim_date') ||
      undefined
  );
  const simTimeRaw = safeSimValue(
    strOf(rh, 'simulationTime', 'simulation_time', 'simTime', 'sim_time') ||
      undefined
  );

  const startedAtCombined =
    strOf(rh, 'startedAt', 'started_at') ||
    strOf(firstAction, 'startedAt', 'started_at', 'timestamp') ||
    strOf(
      firstEvent,
      'startedAt',
      'started_at',
      'startedTime',
      'started_time',
      'timestamp',
      'time'
    ) ||
    strOf(rh, 'scenarioStartTime', 'scenario_start_time');
  const splitSim = splitSimDateTime(startedAtCombined || undefined);

  const header: TranscriptHeader = {
    studentName:
      strOf(
        rh,
        'studentName',
        'student_name',
        'fullName',
        'full_name',
        'name'
      ) || undefined,
    studentCode:
      strOf(
        rh,
        'studentCode',
        'student_code',
        'student_id',
        'studentId',
        'userId',
        'user_id',
        'userCode',
        'user_code',
        'code'
      ) || undefined,
    className:
      strOf(
        rh,
        'className',
        'class_name',
        'studentClass',
        'student_class',
        'class',
        'groupName',
        'group'
      ) || undefined,
    simulationName:
      strOf(
        rh,
        'simulationName',
        'simulation_name',
        'scenarioTitle',
        'scenario_title',
        'simulationTitle',
        'simulation_title',
        'simTitle',
        'sim_title',
        'scenarioId',
        'scenario_id',
        'title',
        'name'
      ) || undefined,
    simulationType:
      strOf(
        rh,
        'simulationType',
        'simulation_type',
        'userRole',
        'user_role',
        'role',
        'type'
      ) || undefined,
    attemptId: (rh['attemptId'] ?? rh['attempt_id'] ?? rh['id'] ?? r['id']) as
      string | undefined,
    realDate: safeDate(startIso),
    realTime: safeTime(realTimeRaw),
    simulationDate: simDateRaw ?? splitSim.date,
    simulationTime: simTimeRaw ?? splitSim.time,
    totalDuration:
      strOf(
        rh,
        'totalDuration',
        'total_duration',
        'totalTime',
        'total_time',
        'duration'
      ) || (r['totalTimeSeconds'] ? `${r['totalTimeSeconds']}s` : undefined),
  };

  return { header, events };
}

// ─── Merge two headers — primary wins, fallback fills empty gaps ────────────────────

function mergeHeaders(
  primary: TranscriptHeader,
  fallback: TranscriptHeader
): TranscriptHeader {
  return {
    studentName: primary.studentName ?? fallback.studentName,
    studentCode: primary.studentCode ?? fallback.studentCode,
    className: primary.className ?? fallback.className,
    simulationName: primary.simulationName ?? fallback.simulationName,
    simulationType: primary.simulationType ?? fallback.simulationType,
    attemptId: primary.attemptId ?? fallback.attemptId,
    realDate: primary.realDate ?? fallback.realDate,
    realTime: primary.realTime ?? fallback.realTime,
    // Sim clock values: prefer primary, but fall back to fallback if primary is missing them
    simulationDate: primary.simulationDate ?? fallback.simulationDate,
    simulationTime: primary.simulationTime ?? fallback.simulationTime,
    totalDuration: primary.totalDuration ?? fallback.totalDuration,
  };
}

// ─── Public fetch function ────────────────────────────────────────────────

export async function fetchUserTranscriptLegacy(
  attemptId: string
): Promise<UserTranscriptResponse> {
  const primaryUrl = `${config.UserTranscriptAPI}/${encodeURIComponent(attemptId)}`;
  const fallbackUrl = `${config.SyncStudentSimulationAPI}/${encodeURIComponent(attemptId)}`;

  // Fire both requests in parallel — the primary endpoint may return fewer events
  // than simulation-reports; we always pick the larger set.
  const [primarySettled, fallbackSettled] = await Promise.allSettled([
    api.get(primaryUrl, { headers: EXTRA_HEADERS }),
    api.get(fallbackUrl, { headers: EXTRA_HEADERS }),
  ]);

  const primaryResult =
    primarySettled.status === 'fulfilled'
      ? normalizePrimaryResponse(
          primarySettled.value.data as Record<string, unknown>
        )
      : null;

  const fallbackResult =
    fallbackSettled.status === 'fulfilled'
      ? buildFromSimReport(
          fallbackSettled.value.data as Record<string, unknown>
        )
      : null;

  // Dev-mode: log raw API shapes so category mapping can be verified
  if (import.meta.env.DEV) {
    if (primarySettled.status === 'fulfilled') {
      // eslint-disable-next-line no-console
      console.group('[Transcript] primary response keys');
      // eslint-disable-next-line no-console
      console.log(
        Object.keys(
          (primarySettled.value.data as Record<string, unknown>) ?? {}
        )
      );
      // eslint-disable-next-line no-console
      console.log(
        '[Transcript] primary events:',
        primaryResult?.events.length ?? 0,
        primaryResult?.events.slice(0, 3)
      );
      // eslint-disable-next-line no-console
      console.groupEnd();
    }
    if (fallbackSettled.status === 'fulfilled') {
      // eslint-disable-next-line no-console
      console.group('[Transcript] fallback response keys');
      // eslint-disable-next-line no-console
      console.log(
        Object.keys(
          (fallbackSettled.value.data as Record<string, unknown>) ?? {}
        )
      );
      // eslint-disable-next-line no-console
      console.log(
        '[Transcript] fallback events:',
        fallbackResult?.events.length ?? 0,
        fallbackResult?.events.slice(0, 3)
      );
      // eslint-disable-next-line no-console
      console.groupEnd();
    }
  }

  // Both failed
  if (!primaryResult && !fallbackResult) {
    if (primarySettled.status === 'rejected')
      throw (primarySettled as PromiseRejectedResult).reason;
    throw new Error('Failed to load transcript data');
  }

  // Only one succeeded
  if (!primaryResult) return fallbackResult!;
  if (!fallbackResult) return primaryResult;

  // Both succeeded — merge headers and COMBINE events from both endpoints,
  // deduplicating by id so nothing is dropped.
  const seenMerge = new Set<string>();
  const mergedEvents: import('../types/userTranscript').TranscriptEventData[] =
    [];
  for (const ev of [...primaryResult.events, ...fallbackResult.events]) {
    const key = ev.id ?? JSON.stringify(ev);
    if (!seenMerge.has(key)) {
      seenMerge.add(key);
      mergedEvents.push(ev);
    }
  }
  mergedEvents.sort((a, b) => {
    const ta = parseFloat((a.simulationTime ?? '').replace(':', '.')) || 0;
    const tb = parseFloat((b.simulationTime ?? '').replace(':', '.')) || 0;
    return ta - tb;
  });

  return {
    header: mergeHeaders(primaryResult.header, fallbackResult.header),
    events: mergedEvents,
  };
}
