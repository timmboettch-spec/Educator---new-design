import { CheckCircle, AlertCircle, Info, Target, Zap, MessageCircle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type StrengthOrWeakness =
  | string
  | { point?: string; example?: string };

function swPoint(s: StrengthOrWeakness): string {
  return typeof s === "string" ? s : (s?.point ?? "");
}
function swExample(s: StrengthOrWeakness): string | undefined {
  return typeof s === "string" ? undefined : s?.example;
}

interface RubricLikeItem {
  id?: string;
  name?: string;
  aiCheckId?: string;
  subCategory?: string;
  score?: number;
  weightedScore?: number;
  weight?: number;
  maxScore?: number;
  summary?: string;
  strengths?: StrengthOrWeakness[];
  weaknesses?: StrengthOrWeakness[];
  recommendations?: string[];
  [key: string]: unknown;
}

export interface SkillBucket {
  totalScore?: number;
  totalWeight?: number;
  items?: Record<string, RubricLikeItem>;
  overallstrengths?: StrengthOrWeakness[];
  overallweaknesses?: StrengthOrWeakness[];
  overallrecommendations?: string[];
}

export interface CommunicationAssessmentShape {
  rubrics?: {
    items?: Record<string, RubricLikeItem>;
    overallSummary?: string;
    strengths?: StrengthOrWeakness[];
    improvements?: StrengthOrWeakness[];
    feedback?: unknown;
  };
  technicalSkills?: SkillBucket;
  softSkills?: SkillBucket;
  overall?: {
    summary?: string;
    strengths?: StrengthOrWeakness[];
    weaknesses?: StrengthOrWeakness[];
    recommendations?: string[];
  };
  [key: string]: unknown;
}

interface CommunicationSectionProps {
  communicationAssessment: CommunicationAssessmentShape;
  softSkills?: SkillBucket;
  technicalSkills?: SkillBucket;
  sbarStatus?: string | null;
  tcTypeRequirement?: string;
}

// ─── Score badge ─────────────────────────────────────────────────────────────
function softScoreLabel(score?: number): string {
  if (score === undefined) return "";
  if (score >= 8) return "EXCEPTIONAL";
  if (score >= 6) return "MEETS EXPECTATION";
  return "NEEDS IMPROVEMENT";
}

function techScoreLabel(score?: number): string {
  if (score === undefined) return "";
  if (score >= 80) return "EXCEPTIONAL";
  if (score >= 50) return "MEETS EXPECTATION";
  return "NEEDS IMPROVEMENT";
}

function labelColor(label: string): string {
  if (label === "EXCEPTIONAL") return "text-blue-600";
  if (label === "MEETS EXPECTATION") return "text-emerald-600";
  return "text-red-600";
}

// ─── Skill Item Card ──────────────────────────────────────────────────────────
interface SkillItemCardProps {
  item: RubricLikeItem;
  scoreLabel: string;
  sbarBadge?: React.ReactNode;
}

function SkillItemCard({ item, scoreLabel, sbarBadge }: SkillItemCardProps) {
  const strengths = Array.isArray(item.strengths) ? item.strengths : [];
  const weaknesses = Array.isArray(item.weaknesses) ? item.weaknesses : [];
  const recommendations = Array.isArray(item.recommendations) ? item.recommendations : [];
  const color = labelColor(scoreLabel);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 space-y-4">
        {/* Title + label */}
        <div className="flex items-start justify-between gap-3">
          <p className="text-base font-bold text-gray-900">{item.name ?? "—"}</p>
          {scoreLabel && (
            <span className={`flex-shrink-0 text-xs font-bold uppercase tracking-wider ${color}`}>
              {scoreLabel}
            </span>
          )}
        </div>

        {/* SBAR/Team Communication badge */}
        {sbarBadge}

        {/* Summary */}
        {item.summary && (
          <p className="text-sm text-gray-600 leading-relaxed">{item.summary}</p>
        )}

        {/* STRENGTHS */}
        <div className="border-green-500 border-l-2 rounded-xl p-4 bg-green-50">
          <div className="flex">
            <div className="flex border border-green-200 bg-green-100 p-1 px-2 rounded-full items-center gap-2 mb-3">
              <span className="text-[11px] font-black text-green-700 uppercase tracking-widest">STRENGTHS</span>
              <span className="w-5 h-5 rounded-full bg-green-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">
                {strengths.length}
              </span>
            </div>
          </div>
          {strengths.length > 0 ? (
            <div className="space-y-2">
              {strengths.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 bg-white border border-green-100 rounded-lg px-3 py-2.5">
                  <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                    <CheckCircle className="w-3 h-3 text-white" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{swPoint(item)}</p>
                    {swExample(item) && (
                      <p className="text-xs text-gray-500 italic mt-0.5">"{swExample(item)}"</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic">No items identified.</p>
          )}
        </div>

        {/* WEAKNESSES */}
        <div className="border-red-500 border-l-2 rounded-xl p-4 bg-red-50">
          <div className="flex">
            <div className="flex border border-red-200 bg-red-100 p-1 px-2 rounded-full items-center gap-2 mb-3">
              <span className="text-[11px] font-black text-red-600 uppercase tracking-widest">WEAKNESSES / OPPORTUNITIES</span>
              <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">
                {weaknesses.length}
              </span>
            </div>
          </div>
          {weaknesses.length > 0 ? (
            <div className="space-y-2">
              {weaknesses.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 bg-white border border-red-100 rounded-lg px-3 py-2.5">
                  <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                    <Info className="w-3 h-3 text-white rotate-180" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{swPoint(item)}</p>
                    {swExample(item) && (
                      <p className="text-xs text-gray-500 italic mt-0.5">"{swExample(item)}"</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic">No items identified.</p>
          )}
        </div>

        {/* RECOMMENDATIONS */}
        {recommendations.length > 0 && (
          <div className="border border-blue-100 rounded-xl p-4 bg-white">
            <p className="text-sm font-bold text-gray-700 mb-2">Improvement Recommendations</p>
            <ul className="space-y-1.5">
              {recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-blue-700">
                  <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500" />
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SBAR Badge ───────────────────────────────────────────────────────────────
function SbarBadge({
  sbarStatus,
  tcTypeRequirement,
}: {
  sbarStatus: string | null | undefined;
  tcTypeRequirement?: string;
}) {
  // Don't show badge for Distractor TC
  if (tcTypeRequirement?.toLowerCase() === "distractor") return null;
  // Don't show if not attempted / no status
  if (!sbarStatus) {
    if (tcTypeRequirement?.toLowerCase() === "optional") return null;
    return null;
  }
  const isSatisfactory =
    sbarStatus.toLowerCase() === "satisfactory";
  return (
    <div className="flex items-center gap-2 flex-wrap mb-1">
      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border border-primary-400 text-primary-600 bg-primary-50">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        TEAM COMMUNICATION
      </span>
      <span
        className={`inline-flex items-center text-xs font-bold px-3 py-1.5 rounded-full ${
          isSatisfactory ? "bg-green-500 text-white" : "bg-primary-500 text-white"
        }`}
      >
        {sbarStatus.toUpperCase()}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CommunicationSection({
  communicationAssessment,
  softSkills,
  technicalSkills,
  sbarStatus,
  tcTypeRequirement,
}: CommunicationSectionProps) {
  // Deduplicate technical skill items by key (subCategory / name / aiCheckId / id)
  const technicalSkillItems: RubricLikeItem[] = (() => {
    if (!technicalSkills?.items) return [];
    const raw = Object.values(technicalSkills.items);
    const map = new Map<string, RubricLikeItem>();
    for (const item of raw) {
      const key = item.subCategory ?? item.name ?? item.aiCheckId ?? item.id;
      if (!key) continue;
      if (map.has(key)) {
        const existing = map.get(key)!;
        if (
          (item.score ?? 0) > (existing.score ?? 0) ||
          ((item.score ?? 0) === (existing.score ?? 0) && item.summary && !existing.summary)
        ) {
          map.set(key, item);
        }
      } else {
        map.set(key, item);
      }
    }
    return Array.from(map.values());
  })();

  const softSkillItems: RubricLikeItem[] = softSkills?.items
    ? Object.values(softSkills.items)
    : [];

  const hasTechnical = technicalSkillItems.length > 0;
  const hasSoft = softSkillItems.length > 0;
  const hasOverallStrengths = (communicationAssessment.overall?.strengths?.length ?? 0) > 0;
  const hasOverallWeaknesses = (communicationAssessment.overall?.weaknesses?.length ?? 0) > 0;
  const hasOverallRecs = (communicationAssessment.overall?.recommendations?.length ?? 0) > 0;

  if (!hasTechnical && !hasSoft && !hasOverallStrengths && !hasOverallWeaknesses) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#E3F2FD] flex items-center justify-center flex-shrink-0">
          <MessageCircle className="w-5 h-5 text-[#FB6033]" />
        </div>
        <div>
          <p className="text-base font-bold text-gray-900">Communication Assessment</p>
          <p className="text-xs text-gray-500">Performance evaluation across all rubric categories</p>
        </div>
      </div>

      {/* Technical Skills */}
      {hasTechnical && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">Technical Skills Assessment</p>
              <p className="text-xs text-gray-500">Evaluation of clinical and technical competencies</p>
            </div>
          </div>
          <div className="space-y-3">
            {technicalSkillItems.map((item, i) => (
              <SkillItemCard
                key={item.id ?? item.aiCheckId ?? i}
                item={item}
                scoreLabel={techScoreLabel(item.score)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Soft / Communication Skills */}
      {hasSoft && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <Target className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">Communication Skills Assessment</p>
              <p className="text-xs text-gray-500">Evaluation of patient interaction and communication skills</p>
            </div>
          </div>
          <div className="space-y-3">
            {softSkillItems.map((item, i) => {
              const isCommunicationItem =
                (item.subCategory ?? "").toLowerCase().includes("communication") ||
                (item.name ?? "").toLowerCase().includes("communication");
              return (
                <SkillItemCard
                  key={item.id ?? item.aiCheckId ?? i}
                  item={item}
                  scoreLabel={softScoreLabel(item.score)}
                  sbarBadge={
                    isCommunicationItem ? (
                      <SbarBadge
                        sbarStatus={sbarStatus}
                        tcTypeRequirement={tcTypeRequirement}
                      />
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Overall Strengths */}
      {hasOverallStrengths && (
        <div className="bg-white rounded-2xl border border-emerald-200 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Overall Strengths</p>
              <p className="text-xs text-gray-500">Areas of strong performance</p>
            </div>
          </div>
          <div className="space-y-2">
            {communicationAssessment.overall?.strengths?.map((s, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-700">{swPoint(s)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overall Weaknesses */}
      {hasOverallWeaknesses && (
        <div className="bg-white rounded-2xl border border-red-200 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Overall Weaknesses</p>
              <p className="text-xs text-gray-500">Areas needing attention</p>
            </div>
          </div>
          <div className="space-y-2">
            {communicationAssessment.overall?.weaknesses?.map((w, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
                <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-bold">!</span>
                </div>
                <span className="text-sm font-medium text-gray-700">{swPoint(w)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overall Recommendations */}
      {hasOverallRecs && (
        <div className="bg-white rounded-2xl border border-amber-200 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Areas for Improvement</p>
              <p className="text-xs text-gray-500">Actionable recommendations</p>
            </div>
          </div>
          <div className="space-y-2">
            {communicationAssessment.overall?.recommendations?.map((rec, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-bold">!</span>
                </div>
                <span className="text-sm font-medium text-gray-700">{rec}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── OverallSkillAssessment (for skill overview sections) ─────────────────────
interface OverallSkillAssessmentProps {
  title: string;
  icon: React.ReactNode;
  strengths?: StrengthOrWeakness[];
  weaknesses?: StrengthOrWeakness[];
  recommendations?: string[];
}

export function OverallSkillAssessment({
  title,
  icon,
  strengths = [],
  weaknesses = [],
  recommendations = [],
}: OverallSkillAssessmentProps) {
  if (!strengths.length && !weaknesses.length && !recommendations.length) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h3 className="font-semibold text-base text-gray-900 flex items-center gap-2">
        {icon}
        {title}
      </h3>

      {strengths.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[11px] font-black text-green-700 uppercase tracking-widest">Strengths</h4>
          {strengths.map((item, i) => (
            <div key={i} className="bg-emerald-50 rounded-lg p-3 border border-emerald-100 flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{swPoint(item)}</p>
                {swExample(item) && (
                  <p className="text-xs text-gray-500 italic mt-0.5">"{swExample(item)}"</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {weaknesses.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[11px] font-black text-amber-700 uppercase tracking-widest">Weaknesses</h4>
          {weaknesses.map((item, i) => (
            <div key={i} className="bg-amber-50 rounded-lg p-3 border border-amber-100 flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">!</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{swPoint(item)}</p>
                {swExample(item) && (
                  <p className="text-xs text-gray-500 italic mt-0.5">"{swExample(item)}"</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="bg-[#E3F2FD] rounded-lg p-4 border border-[#BBDEFB]">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Improvement Recommendations</h4>
          <ul className="space-y-1.5">
            {recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                <span className="text-sm text-gray-700">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
