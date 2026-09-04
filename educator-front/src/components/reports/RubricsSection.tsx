import { AlertCircle, CheckCircle, XCircle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type StrengthWeakness = {
  point: string;
  example?: string;
  count?: number;
};

interface ActionDetail {
  type?: string;
  title?: string;
  isOptional?: boolean;
  isCorrect?: boolean;
  attemptsCount?: number;
  [key: string]: unknown;
}

interface CriteriaResult {
  criterionId: string;
  title: string;
  passed: boolean;
  rationale: string;
}

type SequencingParentResult = {
  parentRef: string;
  parentLabel?: string;
  passed: boolean;
  assessmentPassed: boolean;
  beforePassed: boolean;
  afterPassed: boolean;
  orderPassed: boolean;
  timingPassed: boolean;
  failedReasons?: string[];
};

export interface MedicationGradingResult {
  medicationId?: string;
  medicationName: string;
  orderTitle?: string;
  overallScore: number;
  totalExpected: number;
  totalCorrect: number;
  mandatory?: boolean;
  isDistractor?: boolean;
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
}

type RubricItem = {
  id?: string;
  name?: string;
  subCategory?: string;
  score?: number;
  weightedScore?: number;
  weight?: number;
  maxScore?: number;
  summary?: string;
  strengths?: StrengthWeakness[];
  weaknesses?: StrengthWeakness[];
  recommendations?: string[];
  actionDetails?: ActionDetail[];
  criteriaResults?: CriteriaResult[];
  parentResults?: SequencingParentResult[];
};

export type RubricsPayload = {
  overallSummary?: string;
  totalScore?: number;
  totalWeight?: number;
  items?: Record<string, RubricItem>;
};

// ─── ScoreBadge ───────────────────────────────────────────────────────────────
function ScoreBadge({
  score,
  weightedScore: _ws,
  weight: _w,
  subCategory,
}: {
  score?: number;
  weightedScore?: number;
  weight?: number;
  subCategory?: string;
}) {
  const num = typeof score === "number" && !isNaN(score) ? score : undefined;

  const isDocumentation =
    subCategory?.toLowerCase() === "documentation" ||
    subCategory?.toLowerCase() === "clinical documentation";

  const styles =
    num === undefined
      ? { text: "text-gray-500", label: "N/A" }
      : isDocumentation
        ? num >= 70
          ? { text: "text-blue-600", label: "EXCEPTIONAL" }
          : num >= 51
            ? { text: "text-emerald-600", label: "MEETS EXPECTATIONS" }
            : { text: "text-red-700", label: "NEEDS IMPROVEMENT" }
        : num > 90
          ? { text: "text-blue-600", label: "EXCEPTIONAL" }
          : num >= 75
            ? { text: "text-emerald-600", label: "MEETS EXPECTATIONS" }
            : { text: "text-red-700", label: "NEEDS IMPROVEMENT" };

  return (
    <span className={`text-sm font-semibold uppercase tracking-wide ${styles.text}`}>
      {styles.label}
    </span>
  );
}

// ─── SequencingLabelBadge ─────────────────────────────────────────────────────
function SequencingLabelBadge({ score }: { score?: number }) {
  const pct = typeof score === "number" && !isNaN(score) ? score : undefined;
  const styles =
    pct === undefined
      ? { text: "text-gray-500", label: "N/A" }
      : pct > 90
        ? { text: "text-sky-700", label: "EXCEPTIONAL" }
        : pct >= 75
          ? { text: "text-emerald-700", label: "MEETS EXPECTATIONS" }
          : { text: "text-red-700", label: "NEEDS IMPROVEMENT" };

  return (
    <span className={`text-sm font-bold tracking-wide uppercase ${styles.text}`}>
      {styles.label}
    </span>
  );
}

// ─── SectionBadge ─────────────────────────────────────────────────────────────
type BadgeTone = "good" | "warn" | "info" | "danger" | "neutral" | "orange";

const BADGE_STYLES: Record<BadgeTone, { pill: string; dot: string }> = {
  good:    { pill: "bg-emerald-50 border-emerald-200 text-emerald-800",  dot: "bg-emerald-500" },
  warn:    { pill: "bg-amber-50 border-amber-200 text-amber-800",        dot: "bg-amber-500" },
  info:    { pill: "bg-blue-50 border-blue-200 text-blue-800",           dot: "bg-blue-500" },
  danger:  { pill: "bg-red-50 border-red-200 text-red-800",              dot: "bg-red-500" },
  orange:  { pill: "bg-primary-50 border-primary-200 text-primary-800",     dot: "bg-primary-500" },
  neutral: { pill: "bg-gray-100 border-gray-300 text-gray-600",          dot: "bg-gray-400" },
};

function SectionBadge({ title, count, tone }: { title: string; count: number; tone: BadgeTone }) {
  const s = BADGE_STYLES[tone];
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${s.pill}`}>
      <span className="text-xs font-bold uppercase tracking-wide">{title}</span>
      <span className={`${s.dot} text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0`}>
        {count}
      </span>
    </div>
  );
}

// ─── ItemRow ──────────────────────────────────────────────────────────────────
function ItemRow({ item, tone }: { item: StrengthWeakness; tone: BadgeTone }) {
  const s = BADGE_STYLES[tone];
  const Icon = tone === "good" ? CheckCircle : AlertCircle;
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className={`w-6 h-6 rounded-full ${s.dot} flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm`}>
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-medium leading-relaxed ${tone === "danger" ? "text-gray-500" : "text-gray-800"}`}>{item.point}</p>
        {item.count && item.count > 1 && (
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">Performed multiple times</p>
        )}
        {item.example && tone !== "good" && (
          <p className={`text-xs mt-1 italic leading-relaxed ${tone === "danger" ? "text-gray-500" : "text-gray-500"}`}>{item.example}</p>
        )}
      </div>
    </div>
  );
}

// ─── ActionRow ────────────────────────────────────────────────────────────────
function ActionRow({ action, tone }: { action: ActionDetail; tone: BadgeTone }) {
  const s = BADGE_STYLES[tone];
  const isMedication = action.type === "medication";
  const isIncorrect = isMedication && action.isCorrect === false;
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className={`w-6 h-6 rounded-full ${isIncorrect ? "bg-red-500" : s.dot} flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm`}>
        {isIncorrect ? (
          <XCircle className="w-3.5 h-3.5 text-white" />
        ) : (
          <CheckCircle className="w-3.5 h-3.5 text-white" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800 leading-relaxed">{action.title}</p>
        {isMedication && (
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            {isIncorrect ? "Medication performed incorrectly" : "Medication performed correctly"}
          </p>
        )}
      </div>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-sm text-gray-500 italic pl-1 py-1">{text}</p>;
}

// ─── Main RubricsSection ──────────────────────────────────────────────────────
export default function RubricsSection({
  rubrics,
  userRole,
  medicationGradingResults,
  mandatoryMedicationTitles,
  sbarStatus,
  scenarioRubricConfig,
  tcTypeRequirement,
}: {
  rubrics: RubricsPayload;
  userRole?: string;
  mandatoryActions?: ActionDetail[];
  optionalActions?: ActionDetail[];
  medicationGradingResults?: MedicationGradingResult[];
  mandatoryMedicationTitles?: string[];
  sbarStatus?: string | null;
  scenarioRubricConfig?: Array<{ id: string; weight: number; subCategory: string }>;
  tcTypeRequirement?: string;
}) {
  const isAdmin = userRole?.toLowerCase() === "admin";
  const itemsArray: RubricItem[] = rubrics?.items ? Object.values(rubrics.items) : [];

  const categoryOrder = [
    "Action",
    "Actions & Interventions",
    "Medications",
    "Expected Actions",
    "PPE, Privacy, & Safety Actions",
    "PPE",
    "Privacy & Safety",
    "Documentation",
    "Clinical Documentation",
    "Communication",
    "Professional Communication",
    "Timeline",
    "Timing",
  ];

  // ── Medications rubric synthesis from MAR data ───────────────────────────
  if (
    (medicationGradingResults && medicationGradingResults.length > 0) ||
    (mandatoryMedicationTitles && mandatoryMedicationTitles.length > 0)
  ) {
    const medStrengths: StrengthWeakness[] = [];
    const medWeaknesses: StrengthWeakness[] = [];
    const optionalActionDetails: ActionDetail[] = [];
    const distractorActionDetails: ActionDetail[] = [];
    const administeredTitles = new Set<string>();
    let mandatoryTotal = 0;
    let mandatoryCorrect = 0;

    const seenStrengthKeys = new Set<string>();
    const seenWeaknessKeys = new Set<string>();

    const seenMedKeys = new Set<string>();
    const dedupedResults = (medicationGradingResults ?? []).filter((r) => {
      const key = (r.orderTitle || r.medicationName || r.medicationId || "").trim().toLowerCase();
      if (!key) return true;
      if (seenMedKeys.has(key)) return false;
      seenMedKeys.add(key);
      return true;
    });

    for (const medResult of dedupedResults) {
      const medName = medResult.orderTitle || medResult.medicationName;
      administeredTitles.add(medName.trim().toLowerCase());
      const isCorrect = medResult.overallScore >= 100;

      if (medResult.isDistractor) {
        distractorActionDetails.push({ title: medName, type: "distractor", isOptional: false, isCorrect, attemptsCount: 1 });
        continue;
      }

      const isMandatory = medResult.mandatory !== false;
      if (!isMandatory) {
        optionalActionDetails.push({ title: medName, type: "medication", isOptional: true, isCorrect, attemptsCount: 1 });
        continue;
      }
      mandatoryTotal += 1;
      if (isCorrect) {
        mandatoryCorrect += 1;
        const sKey = medName.trim().toLowerCase();
        if (!seenStrengthKeys.has(sKey)) {
          seenStrengthKeys.add(sKey);
          medStrengths.push({ point: medName, example: "Medication administered correctly." });
        }
      } else {
        const wKey = medName.trim().toLowerCase();
        if (!seenWeaknessKeys.has(wKey)) {
          seenWeaknessKeys.add(wKey);
          medWeaknesses.push({ point: medName, example: "Medication was not administered correctly." });
        }
      }
    }

    // Scenario endpoint returns canonical (English) medication titles while
    // grading results carry localized (translated) titles, so a title-only
    // lookup can misclassify an administered medication as "missed"
    // (double-counting it in both Strengths and Weaknesses). Cap the number
    // of missed entries by the count of mandatory titles that lack a
    // corresponding mandatory grading result.
    const expectedMandatoryCount = (mandatoryMedicationTitles ?? []).length;
    const mandatoryResultsCount = dedupedResults.filter(
      (r) =>
        r.mandatory !== false &&
        !(r as { isDistractor?: boolean }).isDistractor,
    ).length;
    const trueMissedCount = Math.max(
      0,
      expectedMandatoryCount - mandatoryResultsCount,
    );
    let missedMandatoryCount = 0;
    for (const title of mandatoryMedicationTitles ?? []) {
      if (missedMandatoryCount >= trueMissedCount) break;
      const key = title.trim().toLowerCase();
      if (!key || administeredTitles.has(key) || seenWeaknessKeys.has(key)) continue;
      mandatoryTotal += 1;
      missedMandatoryCount += 1;
      seenWeaknessKeys.add(key);
      medWeaknesses.push({ point: title, example: "Mandatory medication was not administered." });
    }

    const avgScore = mandatoryTotal > 0 ? Math.round((mandatoryCorrect / mandatoryTotal) * 100) : 100;
    const medsWeight =
      scenarioRubricConfig?.find((r) => r.subCategory === "Medications" || r.id === "rubric_medications")?.weight ?? 15;
    const correctOptionalCount = optionalActionDetails.filter((d) => d.isCorrect === true).length;
    const summaryText =
      mandatoryTotal === 0
        ? correctOptionalCount > 0
          ? `${correctOptionalCount} optional medication(s) completed correctly.`
          : "No medication orders were administered."
        : mandatoryCorrect === mandatoryTotal
          ? "All mandatory medication orders were administered correctly."
          : mandatoryCorrect === 0
            ? `${mandatoryTotal} mandatory medication order(s) were missed.`
            : `${mandatoryCorrect} of ${mandatoryTotal} mandatory medication order(s) were administered correctly.`;

    const medRubricItem: RubricItem = {
      id: "rubric_medications",
      name: "Medications",
      subCategory: "Medications",
      score: avgScore,
      weightedScore: Math.round((avgScore / 100) * medsWeight),
      weight: medsWeight,
      summary: summaryText,
      strengths: medStrengths,
      weaknesses: medWeaknesses,
      actionDetails: [...optionalActionDetails, ...distractorActionDetails],
    };

    const existingIdx = itemsArray.findIndex(
      (it) => (it?.subCategory ?? "").toLowerCase() === "medications" || (it?.name ?? "").toLowerCase() === "medications",
    );
    if (existingIdx >= 0) {
      const existingItem = itemsArray[existingIdx];
      // Prefer API-provided fields over computed values when they exist
      if (existingItem.summary) medRubricItem.summary = existingItem.summary;
      if (existingItem.weaknesses && existingItem.weaknesses.length > 0) medRubricItem.weaknesses = existingItem.weaknesses;
      if (existingItem.strengths && existingItem.strengths.length > 0) medRubricItem.strengths = existingItem.strengths;
      if (existingItem.recommendations && existingItem.recommendations.length > 0) medRubricItem.recommendations = existingItem.recommendations;
      if (existingItem.weight !== undefined) medRubricItem.weight = existingItem.weight;
      // When synthesis couldn't derive a reliable score (mandatoryTotal=0) but the
      // API item already carries one, prefer the API score to avoid showing a
      // misleading label (e.g. EXCEPTIONAL when the summary says 0 of 1 correct).
      if (mandatoryTotal === 0 && existingItem.score !== undefined) {
        medRubricItem.score = existingItem.score;
      }
      itemsArray[existingIdx] = medRubricItem;
    } else {
      itemsArray.push(medRubricItem);
    }
  }

  // ── Sort by category order ──────────────────────────────────────────────
  const sortedItems = [...itemsArray].sort((a, b) => {
    const aKey = (a?.subCategory ?? a?.name ?? "").toLowerCase();
    const bKey = (b?.subCategory ?? b?.name ?? "").toLowerCase();
    const ai = categoryOrder.findIndex((c) => aKey === c.toLowerCase());
    const bi = categoryOrder.findIndex((c) => bKey === c.toLowerCase());
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return 0;
  });

  const isSequencingItem = (item: RubricItem): boolean => {
    const sub = String(item?.subCategory ?? "").toLowerCase().trim();
    const name = String(item?.name ?? "").toLowerCase().trim();
    return /sequencing|prioritization/.test(sub) || /sequencing|prioritization/.test(name) || sub === "timeline" || name === "timeline & timing";
  };

  const sequencingCandidates = sortedItems.filter((item) => isSequencingItem(item));
  const preferredSequencingItem =
    sequencingCandidates.find((item) => Array.isArray(item.parentResults) && item.parentResults.length > 0) ??
    sequencingCandidates[0];

  const normalizedItems: RubricItem[] = sortedItems.filter((item) => !isSequencingItem(item));
  if (preferredSequencingItem) {
    normalizedItems.push({ ...preferredSequencingItem, name: "Sequencing & Prioritization", subCategory: "Sequencing & Prioritization" });
  }

  const grouped = new Map<string, RubricItem[]>();
  for (const item of normalizedItems) {
    const key = item?.subCategory ?? "Other";
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([subCategory, items]) =>
        items.map((item) => {
          const allStrengths = item.strengths ?? [];
          const allWeaknesses = item.weaknesses ?? [];

          const optionalDone = (item.actionDetails ?? []).filter((d: ActionDetail) => {
            if (d.isOptional === true) {
              if (d.type === "vital") return (d.attemptsCount ?? 0) > 0;
              if (d.type === "medication") return d.isCorrect === true;
              return d.isCorrect === true;
            }
            return false;
          });

          const distractorDone = (item.actionDetails ?? []).filter((d: ActionDetail) => d.type === "distractor");

          const isSequencing = !!(item.subCategory ?? item.name ?? "").toLowerCase().match(/sequencing|prioritization/);
          const hasParentValidation = isSequencing && Array.isArray(item.parentResults) && item.parentResults.length > 0;

          const isCommunication =
            item.subCategory?.toLowerCase() === "communication" ||
            item.subCategory?.toLowerCase() === "professional communication" ||
            item.name?.toLowerCase().includes("communication");

          const isActionCategory =
            item.subCategory?.toLowerCase() === "action" ||
            item.subCategory?.toLowerCase() === "actions & interventions" ||
            item.subCategory?.toLowerCase() === "medications";

          return (
            <div
              key={item.id ?? item.name ?? subCategory}
              className="bg-white rounded-xl border border-gray-200 p-6"
            >
              {/* ── Section header ── */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{item.name ?? "Rubric Item"}</h3>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mt-1">
                    Weight {item.weight ?? 20}%
                  </p>
                </div>
                {isSequencing ? (
                  <SequencingLabelBadge score={item.score} />
                ) : (
                  <ScoreBadge score={item.score} weightedScore={item.weightedScore} weight={item.weight ?? 20} subCategory={item.subCategory} />
                )}
              </div>

              {/* ── Summary ── */}
              {item.summary && (
                <p className="text-sm text-gray-600 mb-5 leading-relaxed">{item.summary}</p>
              )}

              {/* ── Sequencing parent validation ── */}
              {hasParentValidation && item.parentResults ? (() => {
                const sequencingStrengths: StrengthWeakness[] =
                  item.strengths && item.strengths.length > 0
                    ? item.strengths
                    : item.parentResults.filter((p) => p.passed).map((parent) => ({
                        point: parent.parentLabel || parent.parentRef,
                        example: "Completed in the correct sequence with all requirements met.",
                      }));

                const sequencingWeaknesses: StrengthWeakness[] =
                  item.weaknesses && item.weaknesses.length > 0
                    ? item.weaknesses
                    : item.parentResults.filter((p) => !p.passed).map((parent) => ({
                        point: parent.parentLabel || parent.parentRef,
                        example: parent.failedReasons?.join(" ") || "Sequence requirements not met.",
                      }));

                return (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 border-l-[3px] border-l-emerald-500 p-4 sm:p-5">
                      <div className="mb-3"><SectionBadge title="Strengths" count={sequencingStrengths.length} tone="good" /></div>
                      {sequencingStrengths.length === 0 ? <EmptyNote text="No items identified." /> : (
                        <div className="space-y-2">
                          {sequencingStrengths.map((it, idx) => (
                            <div key={idx} className="rounded-xl bg-white border border-emerald-100/70 px-3 sm:px-4"><ItemRow item={it} tone="good" /></div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="rounded-2xl border border-red-200 bg-red-50/70 border-l-[3px] border-l-red-500 p-4 sm:p-5">
                      <div className="mb-3"><SectionBadge title="Weaknesses / Opportunities" count={sequencingWeaknesses.length} tone="danger" /></div>
                      {sequencingWeaknesses.length === 0 ? <EmptyNote text="No items identified." /> : (
                        <div className="space-y-2">
                          {sequencingWeaknesses.map((it, idx) => (
                            <div key={idx} className="rounded-xl bg-white border border-red-100 px-3 sm:px-4"><ItemRow item={it} tone="danger" /></div>
                          ))}
                        </div>
                      )}
                    </div>
                    {Array.isArray(item.recommendations) && item.recommendations.length > 0 && (
                      <div className="mt-4 p-6 rounded-xl border border-blue-100 bg-blue-50/50 space-y-4">
                        <h4 className="text-sm font-bold text-gray-900">Improvement Recommendations</h4>
                        <ul className="space-y-2">
                          {item.recommendations.map((rec, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm text-blue-800/80">
                              <span className="flex-shrink-0 text-blue-400" style={{ lineHeight: "1.5" }}>&#8226;</span>
                              <span>{rec}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })() : null}

              {/* ── Team Communication badge ── */}
              {isCommunication && (sbarStatus || tcTypeRequirement === "Optional" || tcTypeRequirement === "Distractor" || tcTypeRequirement === "Mandatory") && (() => {
                const isOptionalOrDistractor = tcTypeRequirement === "Optional" || tcTypeRequirement === "Distractor";
                const isSatisfactory = sbarStatus?.toLowerCase() === "satisfactory";
                const isNotAttempted = sbarStatus?.toLowerCase() === "not attempted" || (isOptionalOrDistractor && !sbarStatus);
                const displayLabel = isNotAttempted ? "NOT DONE" : isSatisfactory ? "SATISFACTORY" : "UNSATISFACTORY";
                const tcBadgeClass = isNotAttempted
                  ? "bg-yellow-50 border-yellow-400 text-yellow-800"
                  : isSatisfactory
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-red-50 border-red-200 text-red-700";
                const tcStatusClass = isNotAttempted
                  ? "bg-yellow-400 text-white"
                  : isSatisfactory
                  ? "bg-emerald-500 text-white"
                  : "bg-red-500 text-white";
                return (
                  <div className={`inline-flex items-center mb-5 rounded-full border overflow-hidden ${tcBadgeClass}`}>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 ${tcBadgeClass}`}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                      </svg>
                      TEAM COMMUNICATION
                    </span>
                    <span className={`inline-flex items-center text-xs font-bold px-3 py-1.5 ${tcStatusClass}`}>
                      {displayLabel}
                    </span>
                  </div>
                );
              })()}

              {/* ── Standard S/W/O/D sections ── */}
              {(!hasParentValidation || isCommunication) ? (
                <div className="space-y-4">
                  {/* STRENGTHS */}
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 border-l-[3px] border-l-emerald-500 p-4 sm:p-5">
                    <div className="mb-3"><SectionBadge title="Strengths" count={allStrengths.length} tone="good" /></div>
                    {allStrengths.length === 0 ? <EmptyNote text="No items identified." /> : (
                      <div className="space-y-2">
                        {allStrengths.map((it, idx) => (
                          <div key={idx} className="rounded-xl bg-white border border-emerald-100/70 px-3 sm:px-4"><ItemRow item={it} tone="good" /></div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* WEAKNESSES */}
                  <div className="rounded-2xl border border-red-200 bg-red-50/70 border-l-[3px] border-l-red-500 p-4 sm:p-5">
                    <div className="mb-3"><SectionBadge title="Weaknesses / Opportunities" count={allWeaknesses.length} tone="danger" /></div>
                    {allWeaknesses.length === 0 ? <EmptyNote text="No items identified." /> : (
                      <div className="space-y-2">
                        {allWeaknesses.map((it, idx) => (
                          <div key={idx} className="rounded-xl bg-white border border-red-100 px-3 sm:px-4"><ItemRow item={it} tone="danger" /></div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* OPTIONAL ACTIONS (not for Communication rubrics) */}
                  {!isCommunication && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 border-l-[3px] border-l-amber-500 p-4 sm:p-5">
                      <div className="mb-3">
                        <SectionBadge
                          title={item.subCategory?.toLowerCase() === "medications" ? "Optional Medications Completed" : "Optional Actions Completed"}
                          count={optionalDone.length}
                          tone="warn"
                        />
                      </div>
                      {optionalDone.length === 0 ? <EmptyNote text="No items." /> : (
                        <div className="space-y-2">
                          {optionalDone.map((action, idx) => (
                            <div key={idx} className="rounded-xl bg-white border border-amber-100 px-3 sm:px-4"><ActionRow action={action} tone="warn" /></div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* DISTRACTOR ACTIONS */}
                  {isActionCategory && (
                    <div className="rounded-2xl border border-primary-200 bg-primary-50 border-l-[3px] border-l-primary-500 p-4 sm:p-5">
                      <div className="mb-3">
                        <SectionBadge title="Distractor Actions Completed" count={distractorDone.length} tone="orange" />
                      </div>
                      {distractorDone.length === 0 ? (
                        <EmptyNote text={item.subCategory?.toLowerCase() === "medications" ? "No distractor medications administered." : "No distractor actions performed."} />
                      ) : (
                        <div className="space-y-2">
                          {distractorDone.map((action, idx) => (
                            <div key={idx} className="rounded-xl bg-white border border-primary-200 px-3 sm:px-4 flex items-start gap-3 py-2.5">
                              <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                                <AlertCircle className="w-3.5 h-3.5 text-white" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800 leading-relaxed">{action.title}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : null}

              {/* IMPROVEMENT RECOMMENDATIONS — hidden for medication rubric items */}
              {!hasParentValidation && item.subCategory?.toLowerCase() !== 'medications' && Array.isArray(item.recommendations) && item.recommendations.length > 0 && (
                <div className="mt-8 p-6 rounded-xl border border-blue-100 bg-blue-50/50 space-y-4">
                  <h4 className="text-sm font-bold text-gray-900">Improvement Recommendations</h4>
                  <ul className="space-y-2">
                    {item.recommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-blue-800/80">
                        <span className="flex-shrink-0 text-blue-400" style={{ lineHeight: "1.5" }}>&#8226;</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* INAPPROPRIATE ACTIONS — Admin only */}
              {isAdmin && item.subCategory?.toLowerCase() === "action" && item.actionDetails?.some((d) => d.type === "distractor") && (
                <div className="mt-8 pt-8 border-t border-gray-100 space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-gray-900">Inappropriate Actions</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      During this simulation, one or more actions were performed that are classified as inappropriate or distractor actions within the context of this scenario.
                      These actions were not aligned with the expected clinical pathway or the defined scenario objectives.
                      Although identified as inappropriate, these actions do not impact the overall score or grading for this simulation.
                      This section is provided solely for learning and professional development purposes.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {item.actionDetails.filter((d) => d.type === "distractor").map((dist, idx) => (
                      <div key={idx} className="flex items-center gap-4 p-4 rounded-xl border border-rose-100 bg-rose-50/50">
                        <div className="w-8 h-8 rounded-full bg-rose-500 flex items-center justify-center flex-shrink-0">
                          <AlertCircle className="w-5 h-5 text-white" />
                        </div>
                        <p className="text-sm font-medium text-gray-700 italic">• {dist.title}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-6 space-y-4">
                    <h4 className="text-sm font-bold text-gray-900">Improvement Recommendations</h4>
                    <ul className="space-y-2">
                      {[
                        "Avoid initiating interventions without confirmed clinical need.",
                        "Refrain from performing tasks that are not aligned with the scenario's primary priorities.",
                        "Ensure patient data is reassessed thoroughly before taking action.",
                        "Maintain focus on primary objectives before addressing secondary or unrelated tasks.",
                        "Pause and verify clinical reasoning when uncertainty arises.",
                      ].map((rec, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-blue-800/80">
                          <span className="flex-shrink-0 text-blue-400" style={{ lineHeight: "1.5" }}>&#8226;</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-blue-700/60 font-medium">
                      This report is made available for administrative review through the admin side of the application.
                    </p>
                  </div>
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 space-y-2">
                    <h4 className="text-sm font-bold text-gray-900">Disclaimer:</h4>
                    <p className="text-sm text-rose-800/80 leading-relaxed">
                      This section is intended for educational feedback only. The inappropriate actions identified here do not impact your score for this simulation.
                      They are highlighted to support reflection, strengthen clinical reasoning, and promote safe practice in future patient encounters.
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        }),
      )}
    </div>
  );
}
