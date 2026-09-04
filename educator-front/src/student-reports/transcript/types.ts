// Transcript page types

// Extended message type for API response (includes additional server fields)
export interface ApiConversationMessage {
  id?: string;
  timestamp?: string;
  timestampValue?: number;
  text?: string;
  message?: string;
  speaker: string;
  elapsedTime?: string;
  elapsedSeconds?: number;
  duration?: number;
}

export interface TranscriptMessage {
  id: string;
  speaker:
    | "user"
    | "assistant"
    | "provider"
    | "sbar_report"
    | "system"
    | "order"
    | "student_team_comm";
  message: string;
  timestamp: string; // wall‑clock display
  timestampValue?: number; // epoch ms for wall-clock derivation
  elapsedTime?: string; // mm:ss since scenario start
  elapsedSeconds?: number; // numeric ordering key
  duration?: number;
  _orderKey?: number; // For sorting
  _originalIndex?: number; // For tiebreaker ordering
}

export interface SummaryEntry {
  id: string;
  category: string;
  title: string;
  details?: string;
  /** Optional action subtype (e.g. 'ordering', 'single', 'question', 'vital-signs'). */
  type?: string;
  timestamp: string;
  timestampValue: number;
  startTimestampValue?: number; // epoch ms when element was started
  elapsedTime?: string;
  elapsedSeconds?: number;
  duration?: number;
  score?: number;
  // Optional fields for questions, answers, observations, correctness
  question?: string;
  answer?: string;
  correct?: boolean;
  notes?: string;
  observations?: string;
  vitals?: Record<string, unknown> | unknown[] | string | null;
  sbarPrompt?: string;
  sbarSubmission?: string;
  sbarQualitativeResult?: string;
  sbarStartElapsed?: string;
  sbarSubmitElapsed?: string;
  sbarStartMs?: number;
  sbarSubmitMs?: number;
  // Medication administration details with grading
  administrationDetails?: {
    medicationId?: string;
    medicationName?: string;
    orderTitle?: string;
    status?: string;
    gradingResult?: {
      medicationId?: string;
      medicationName: string;
      overallScore: number;
      totalExpected: number;
      totalCorrect: number;
      comparisons: Array<{
        field: string;
        expected: string | string[] | undefined;
        actual: string | string[] | undefined;
        isCorrect: boolean;
        confidence?: number;
        explanation?: string;
      }>;
      educationResult?: {
        expected: string[];
        actual: string[];
        matched: string[];
        missing: string[];
        isCorrect: boolean;
      };
      verificationResult?: {
        expected: string[];
        actual: string[];
        matched: string[];
        missing: string[];
        isCorrect: boolean;
      };
    };
    [key: string]: unknown;
  };
}

export interface CommonActionEntry {
  label: string;
  timestamp: string;
  type: "infection" | "privacy" | "environmental";
  timestampMs: number;
  elapsedTime?: string;
  elapsedSeconds?: number;
  duration?: number;
  // Optional fields
  question?: string;
  answer?: string;
  correct?: boolean;
  notes?: string;
  observations?: string;
}

export interface SbarSession {
  prompt?: string;
  submission?: string;
  startMs?: number;
  submitMs?: number;
  startElapsed?: string;
  submitElapsed?: string;
  startSeconds?: number;
  submitSeconds?: number;
}

export type TimelineItem =
  | { type: "message"; data: TranscriptMessage }
  | { type: "summary"; data: SummaryEntry }
  | { type: "commonAction"; data: CommonActionEntry };

export interface SpeakerStyle {
  icon: React.ReactNode;
  label: string;
  color: string;
  badge: string;
  avatarBg: string;
  bubbleBg: string;
  border: string;
}

export interface CategoryStyle {
  icon: React.ReactNode;
  label: string;
  color: string;
  badge: string;
  bg: string;
  border: string;
}

export interface TypeColorStyle {
  bg: string;
  border: string;
  text: string;
  badge: string;
  badgeBorder: string;
}
