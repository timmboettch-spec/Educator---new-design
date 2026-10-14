import {
  MessageSquare,
  Target,
  Zap,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

type StrengthWeakness = {
  point: string;
  example?: string;
};

interface CriteriaResult {
  criterionId: string;
  title: string;
  passed: boolean;
  rationale: string;
}

interface AssessmentItem {
  id?: string;
  aiCheckId?: string;
  name?: string;
  subCategory?: string;
  summary?: string;
  score?: number;
  weight?: number;
  maxScore?: number;
  weightedScore?: number;
  strengths?: StrengthWeakness[];
  weaknesses?: StrengthWeakness[];
  recommendations?: string[];
  criteriaResults?: CriteriaResult[];
}

interface SkillBucket {
  items?: Record<string, AssessmentItem> | AssessmentItem[];
  totalScore?: number;
  totalWeight?: number;
}

interface CommunicationAssessmentShape {
  [key: string]: unknown;
}

export interface CommunicationSectionLabels {
  teamCommunication: string;
  satisfactory: string;
  unsatisfactory: string;
  notDone: string;
  strengths: string;
  weaknesses: string;
  criterionNotMet: string;
  criteriaEvaluation: string;
  pass: string;
  fail: string;
  recommendations: string;
  technicalSkillsAssessment: string;
  technicalSkillsSubtitle: string;
  technicalSkillsScore: string;
  communicationAssessment: string;
  communicationSubtitle: string;
  softSkillsScore: string;
  viewSummary: string;
  exceptional: string;
  meetsExpectation: string;
  needsImprovement: string;
  meetsExpectations: string;
  developing: string;
  noItemsIdentified: string;
  weight: string;
}

const defaultCommunicationLabels: CommunicationSectionLabels = {
  teamCommunication: 'TEAM COMMUNICATION',
  satisfactory: 'SATISFACTORY',
  unsatisfactory: 'UNSATISFACTORY',
  notDone: 'NOT DONE',
  strengths: 'Strengths',
  weaknesses: 'Weaknesses / Opportunities',
  criterionNotMet: 'Criterion not met:',
  criteriaEvaluation: 'Criteria Evaluation',
  pass: 'PASS',
  fail: 'FAIL',
  recommendations: 'Recommendations',
  technicalSkillsAssessment: 'Technical Skills Assessment',
  technicalSkillsSubtitle: 'Evaluation of clinical and technical competencies',
  technicalSkillsScore: 'Technical Skills Score:',
  communicationAssessment: 'Communication Assessment',
  communicationSubtitle:
    'Evaluation of patient interaction and communication skills',
  softSkillsScore: 'Soft Skills Score:',
  viewSummary: 'view summary',
  exceptional: 'Exceptional',
  meetsExpectation: 'Meets Expectation',
  needsImprovement: 'Needs Improvement',
  meetsExpectations: 'MEETS EXPECTATIONS',
  developing: 'DEVELOPING',
  noItemsIdentified: 'No items identified.',
  weight: 'Weight:',
};

function ListBlock({
  title,
  tone,
  items,
  noItemsLabel = 'No items identified.',
}: {
  title: string;
  tone: 'good' | 'warn';
  items: StrengthWeakness[];
  noItemsLabel?: string;
}) {
  const titleColor = tone === 'good' ? 'text-emerald-600' : 'text-amber-600';
  const itemBg =
    tone === 'good'
      ? 'bg-emerald-50 border-emerald-100'
      : 'bg-amber-50 border-amber-100';
  const IconCircleBg = tone === 'good' ? 'bg-emerald-500' : 'bg-amber-500';
  const Icon = tone === 'good' ? CheckCircle : AlertCircle;

  return (
    <div className="space-y-4">
      <h4
        className={`text-xs font-bold uppercase tracking-wider ${titleColor}`}
      >
        {title}
      </h4>
      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500 italic">{noItemsLabel}</p>
        ) : (
          items.map((it, idx) => (
            <div
              key={idx}
              data-pdf-nobreak
              className={`flex items-start gap-3 p-4 rounded-xl border ${itemBg} transition-all hover:shadow-sm`}
            >
              <div
                className={`w-6 h-6 rounded-full ${IconCircleBg} flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm`}
              >
                <Icon className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 leading-relaxed italic">
                  • {it.point}
                </p>
                {it.example && (
                  <p className="text-xs text-gray-600 mt-2 italic px-3 border-l-2 border-gray-200">
                    "{it.example}"
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Multi-criteria communication display component
function MultiCriteriaCommunicationDisplay({
  item,
  sbarStatus,
  tcTypeRequirement,
  labels,
}: {
  item: AssessmentItem;
  sbarStatus?: string | null;
  tcTypeRequirement?: string;
  labels: CommunicationSectionLabels;
}) {
  const score = item.score || 0;
  const weight = item.weight || 20;

  const getOverallRating = (score: number) => {
    if (score >= 80) {
      return {
        label: labels.meetsExpectations,
        color: 'bg-green-100 text-green-800 border-green-200',
      };
    }
    if (score >= 60) {
      return {
        label: labels.developing,
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      };
    }
    return {
      label: labels.needsImprovement.toUpperCase(),
      color: 'bg-red-100 text-red-800 border-red-200',
    };
  };

  const rating = getOverallRating(score);

  // Build criteriaResults from existing criteriaResults OR parse from strengths/weaknesses
  let criteriaResults: CriteriaResult[] = item.criteriaResults || [];

  if (criteriaResults.length === 0) {
    // Parse criteria from strengths and weaknesses
    const passedFromStrengths: CriteriaResult[] = (item.strengths || [])
      .filter((s) => s.point.toLowerCase().includes('criterion'))
      .map((s, idx) => ({
        criterionId: `strength_${idx}`,
        title: s.point
          .replace(/^Criterion met:\s*/i, '')
          .replace(/^Correctly\s+/i, ''),
        passed: true,
        rationale: s.example || s.point,
      }));

    const failedFromWeaknesses: CriteriaResult[] = (item.weaknesses || [])
      .filter((w) => w.point.toLowerCase().includes('criterion'))
      .map((w, idx) => ({
        criterionId: `weakness_${idx}`,
        title: w.point.replace(/^Criterion not met:\s*/i, ''),
        passed: false,
        rationale: w.example || w.point,
      }));

    criteriaResults = [...passedFromStrengths, ...failedFromWeaknesses];
  }

  const passedCriteria = criteriaResults.filter((c) => c.passed);
  const failedCriteria = criteriaResults.filter((c) => !c.passed);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            {item.name || labels.teamCommunication}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {labels.weight} {weight}%
          </p>
        </div>
        <div
          className={`px-4 py-2 rounded-lg border-2 ${rating.color} font-semibold text-sm`}
        >
          {rating.label}
        </div>
      </div>

      {/* Narrative Summary */}
      {item.summary && (
        <div className="p-6 bg-gray-50 border-b border-gray-200">
          <p className="text-sm text-gray-700 leading-relaxed">
            {item.summary}
          </p>
        </div>
      )}

      {/* Team Communication Badge */}
      {(sbarStatus ||
        tcTypeRequirement === 'Optional' ||
        tcTypeRequirement === 'Distractor' ||
        tcTypeRequirement === 'Mandatory') &&
        (() => {
          const isOptionalOrDistractor =
            tcTypeRequirement === 'Optional' ||
            tcTypeRequirement === 'Distractor';
          const isSatisfactory = sbarStatus?.toLowerCase() === 'satisfactory';
          // null + Optional/Distractor = not attempted → yellow NOT DONE
          // Satisfactory (any type) → green
          // Unsatisfactory (any type) → red
          const isNotAttempted = isOptionalOrDistractor && !sbarStatus;
          const badgeColor = isNotAttempted
            ? 'bg-yellow-50 border-yellow-400 text-yellow-800'
            : isSatisfactory
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-red-50 border-red-200 text-red-700';
          const displayLabel = isNotAttempted
            ? labels.notDone
            : isSatisfactory
              ? labels.satisfactory
              : labels.unsatisfactory;
          return (
            <div className="p-6 bg-gray-50 border-b border-gray-200">
              <div
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-semibold text-sm ${badgeColor}`}
              >
                {isSatisfactory ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                <span className="uppercase tracking-wider">
                  {labels.teamCommunication}
                </span>
                <span className="uppercase tracking-wider">{displayLabel}</span>
              </div>
            </div>
          );
        })()}

      <div className="p-6 space-y-8">
        {/* Strengths */}
        {passedCriteria.length > 0 && (
          <div>
            <h4 className="text-sm font-bold text-green-700 uppercase tracking-wider mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {labels.strengths}
            </h4>
            <ul className="space-y-3">
              {passedCriteria.map((criterion, idx) => (
                <li
                  key={idx}
                  data-pdf-nobreak
                  className="flex items-start gap-3 text-sm text-gray-700"
                >
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">{criterion.title}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {criterion.rationale}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Weaknesses / Opportunities for Growth */}
        {failedCriteria.length > 0 && (
          <div>
            <h4 className="text-sm font-bold text-amber-700 uppercase tracking-wider mb-4 flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              {labels.weaknesses}
            </h4>
            <ul className="space-y-3">
              {failedCriteria.map((criterion, idx) => (
                <li
                  key={idx}
                  data-pdf-nobreak
                  className="flex items-start gap-3 text-sm text-gray-700"
                >
                  <XCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">
                      {labels.criterionNotMet} {criterion.title}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      {criterion.rationale}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Criteria Evaluation - Show ALL criteria with explicit PASS/FAIL badges */}
        {criteriaResults.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
            <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">
              {labels.criteriaEvaluation}
            </h4>
            <div className="space-y-3">
              {criteriaResults.map((criterion, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 bg-white rounded-lg p-4 border border-gray-200"
                >
                  <div
                    className={`flex items-center gap-2 px-3 py-1 rounded-md font-bold text-xs uppercase tracking-wider ${
                      criterion.passed
                        ? 'bg-green-100 text-green-800 border border-green-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}
                  >
                    {criterion.passed ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    {criterion.passed ? labels.pass : labels.fail}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 text-sm">
                      {criterion.title}
                    </p>
                    <p className="text-xs text-gray-600 mt-2 leading-relaxed whitespace-pre-wrap">
                      {criterion.rationale}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Optional Actions Completed - Not applicable for Communication rubrics */}
        {/* Communication only has Mandatory (checked) and Optional (unchecked) criteria */}
        {/* Optional criteria are not shown in the report */}

        {/* Recommendations */}
        {item.recommendations && item.recommendations.length > 0 && (
          <div className="pt-6 border-t border-gray-200">
            <h4 className="text-sm font-bold text-blue-700 uppercase tracking-wider mb-3">
              {labels.recommendations}
            </h4>
            <ul className="space-y-2 list-disc list-inside text-sm text-gray-700">
              {item.recommendations.map((rec, idx) => (
                <li key={idx}>{rec}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

interface CommunicationSectionProps {
  communicationAssessment: CommunicationAssessmentShape | null | undefined;
  expandedSummaries: Record<string, boolean>;
  toggleSummary: (type: string) => void;
  softSkills?: SkillBucket;
  technicalSkills?: SkillBucket;
  sbarStatus?: string | null;
  tcTypeRequirement?: string;
  labels?: CommunicationSectionLabels;
}

export default function CommunicationSection({
  communicationAssessment,
  expandedSummaries,
  toggleSummary,
  softSkills,
  technicalSkills,
  sbarStatus,
  tcTypeRequirement,
  labels = defaultCommunicationLabels,
}: CommunicationSectionProps) {
  if (!communicationAssessment) {
    return null;
  }

  const getScoreColor = (score: number) => {
    if (score >= 8) {
      return 'text-emerald-700';
    }
    if (score >= 6) {
      return 'text-amber-700';
    }
    return 'text-rose-700';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 8) {
      return 'bg-emerald-50 border-emerald-200';
    }
    if (score >= 6) {
      return 'bg-amber-50 border-amber-200';
    }
    return 'bg-rose-50 border-rose-200';
  };

  const getPerformanceLabel = (score: number) => {
    if (score >= 8) {
      return labels.exceptional;
    }
    if (score >= 6) {
      return labels.meetsExpectation;
    }
    return labels.needsImprovement;
  };

  const getBadgeBgColor = (score: number) => {
    if (score >= 8) {
      return 'bg-emerald-100 border-emerald-200';
    }
    if (score >= 6) {
      return 'bg-amber-100 border-amber-200';
    }
    return 'bg-rose-100 border-rose-200';
  };

  // Get dynamic soft skills and technical skills data
  const softSkillItems: AssessmentItem[] = softSkills?.items
    ? Object.values(softSkills.items)
    : [];

  // Deduplicate technical skills items by subCategory to prevent duplicates
  const technicalSkillsRaw: AssessmentItem[] = technicalSkills?.items
    ? Object.values(technicalSkills.items)
    : [];
  const technicalSkillItemsMap = new Map<string, AssessmentItem>();

  technicalSkillsRaw.forEach((item) => {
    const key =
      item.subCategory || item.name || item.aiCheckId || item.id || '';
    // If we already have an item with this subCategory, keep the one with a higher score or non-zero score
    if (technicalSkillItemsMap.has(key)) {
      const existing = technicalSkillItemsMap.get(key);
      // Prefer item with higher score, or if scores are equal, prefer the one with more data
      if (
        (item.score || 0) > (existing?.score || 0) ||
        ((item.score || 0) === (existing?.score || 0) &&
          item.summary &&
          !existing?.summary)
      ) {
        technicalSkillItemsMap.set(key, item);
      }
    } else {
      technicalSkillItemsMap.set(key, item);
    }
  });

  const technicalSkillItems = Array.from(technicalSkillItemsMap.values());

  return (
    <div className="space-y-6">
      {/* Technical Skills Assessment */}
      {technicalSkills && technicalSkillItems.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-[#E3F2FD] flex items-center justify-center">
              <Zap className="w-5 h-5 text-[#db8833]" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {labels.technicalSkillsAssessment}
              </h2>
              <p className="text-gray-500 text-sm">
                {labels.technicalSkillsSubtitle}
              </p>
              <p className="text-gray-600 text-xs mt-1">
                {labels.technicalSkillsScore}{' '}
                <span className="font-semibold">
                  {Number((technicalSkills.totalScore || 0).toFixed(2))}/
                  {technicalSkills.totalWeight}
                </span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {technicalSkillItems.map((item) => (
              <div
                key={item.aiCheckId || item.id}
                className="bg-blue-50 border border-blue-200 rounded-lg p-4 hover:shadow-md hover:bg-blue-100 transition-all"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900">{item.name}</h4>
                    {/* <p className="text-xs text-gray-500">{item.subCategory || 'Technical skill'}</p> */}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-gray-900">
                      {Number(
                        (item.weightedScore ?? item.score ?? 0).toFixed(2)
                      )}
                      <span className="text-xs text-gray-500">
                        /{item.weight ?? 10}
                      </span>
                    </div>
                  </div>
                </div>
                {item.summary && item.id && (
                  <div className="mt-3">
                    <button
                      onClick={() => toggleSummary(item.id as string)}
                      className="w-full flex items-center justify-between text-left text-xs text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      <span>{labels.viewSummary}</span>
                      {expandedSummaries[item.id] ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                    {expandedSummaries[item.id] && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <p className="text-xs text-gray-700">{item.summary}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-[#E3F2FD] flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-[#db8833]" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {labels.communicationAssessment}
          </h2>
          <p className="text-gray-500 text-sm">
            {labels.communicationSubtitle}
          </p>
          {softSkills && (
            <p className="text-gray-600 text-xs mt-1">
              {labels.softSkillsScore}{' '}
              <span className="font-semibold">
                {Number((softSkills.totalScore || 0).toFixed(2))}/
                {softSkills.totalWeight}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Score Overview Cards */}
      <div className="grid grid-cols-1 gap-6 mb-8">
        {softSkillItems.map((item) => {
          // Check if we should use multi-criteria display
          const hasCriteriaResults =
            item.criteriaResults && item.criteriaResults.length > 0;
          const hasParsableCriteria =
            (item.strengths || []).some((s) =>
              s.point.toLowerCase().includes('criterion')
            ) ||
            (item.weaknesses || []).some((w) =>
              w.point.toLowerCase().includes('criterion')
            );

          // Use multi-criteria display if criteriaResults exist OR if we can parse criteria from strengths/weaknesses
          if (hasCriteriaResults || hasParsableCriteria) {
            return (
              <MultiCriteriaCommunicationDisplay
                key={item.aiCheckId || item.id}
                item={item}
                sbarStatus={sbarStatus}
                tcTypeRequirement={tcTypeRequirement}
                labels={labels}
              />
            );
          }

          // Legacy display for old format
          return (
            <div
              key={item.aiCheckId || item.id}
              className={`rounded-lg border-2 ${getScoreBgColor(item.score || 0)} overflow-hidden`}
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-md bg-emerald-50 flex items-center justify-center">
                        <Target className="w-4 h-4 text-emerald-600" />
                      </div>
                      <h3 className="font-semibold text-gray-900">
                        {item.name} Score
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600">
                      {item.summary || 'Communication skill'}
                    </p>
                  </div>
                  <div className={`flex-shrink-0`}>
                    <div
                      className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 ${getBadgeBgColor(item.score || 0)}`}
                    >
                      <span
                        className={`text-sm font-medium ${getScoreColor(item.score || 0)}`}
                      >
                        {getPerformanceLabel(item.score || 0)}:{' '}
                        <span className="font-bold">
                          {Number(
                            (item.weightedScore ?? item.score ?? 0).toFixed(0)
                          )}
                          %
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-8">
                  <div
                    className={`h-full rounded-full ${(item.score || 0) >= 8 ? 'bg-emerald-500' : (item.score || 0) >= 6 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{
                      width: `${Math.min(100, Math.max(0, ((item.weightedScore ?? item.score ?? 0) / (item.weight || item.maxScore || 10)) * 100))}%`,
                    }}
                  />
                </div>

                {/* Strengths and Weaknesses Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                  <ListBlock
                    title={labels.strengths.toUpperCase()}
                    tone="good"
                    items={item.strengths || []}
                    noItemsLabel={labels.noItemsIdentified}
                  />
                  <ListBlock
                    title={labels.weaknesses.toUpperCase()}
                    tone="warn"
                    items={item.weaknesses || []}
                    noItemsLabel={labels.noItemsIdentified}
                  />
                </div>

                {Array.isArray(item.recommendations) &&
                  item.recommendations.length > 0 && (
                    <div
                      data-pdf-nobreak
                      className="mt-8 p-6 rounded-xl border border-blue-100 bg-blue-50/50 space-y-4"
                    >
                      <h4 className="text-sm font-bold text-gray-900">
                        {labels.recommendations}
                      </h4>
                      <ul className="space-y-2">
                        {item.recommendations.map((rec: string, i: number) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-sm text-blue-800/80"
                          >
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
