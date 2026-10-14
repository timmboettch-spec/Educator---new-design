import { motion } from 'framer-motion';
import { jsPDF } from 'jspdf';
import {
  ArrowLeft,
  ArrowRight,
  Download,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  FileText,
  List,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type ComponentProps,
} from 'react';

import { api } from './studentReportApi';
import { resolveDisplayClassName } from './resolveDisplayClassName';
import { sanitizePdfText, cn } from '../lib/utils';
import { generatePdfFromElement } from '../lib/pdfCapture';
import {
  type ReportDataForPDF,
  buildStudentReportPDF,
} from './generateStudentReportPDF';

import CommunicationSection from './communication-section';
import type { CommunicationSectionLabels } from './communication-section';
import RubricsSection from './rubrics-section';
import type { RubricsLabels } from './rubrics-section';
import loginEn from '../locales/auth/login/en.json';
import loginEs from '../locales/auth/login/es.json';

type SupportedLang = 'en' | 'es';
const getStoredLanguage = (): SupportedLang => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem('app_language')?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

type StrengthOrWeakness = string | { point?: string; example?: string };

const swPoint = (s: StrengthOrWeakness): string =>
  typeof s === 'string' ? s : (s?.point ?? '');
const swExample = (s: StrengthOrWeakness): string | undefined =>
  typeof s === 'string' ? undefined : s?.example;

interface ActionDetail {
  type?: string;
  title?: string;
  [key: string]: unknown;
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
  actionDetails?: ActionDetail[];
}

interface SkillBucket {
  totalScore?: number;
  totalWeight?: number;
  items?: Record<string, RubricLikeItem>;
  overallstrengths?: StrengthOrWeakness[];
  overallweaknesses?: StrengthOrWeakness[];
  overallrecommendations?: string[];
}

interface CommunicationAssessmentShape {
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

interface ApiErrorLike {
  response?: { status?: number };
  message?: string;
}

interface ReportData {
  id?: string;
  createdAt?: string;
  scenario?: { simulationStartTime?: string };
  scenarioId?: string;
  scenarioTitle?: string;
  scenarioStartTime?: string;
  scenarioEndTime?: string;
  studentName?: string;
  studentClass?: string;
  userId?: string;
  key?: string;
  score?: number;
  summary?: string;
  mode?: 'Practice' | 'Assessment';
  debriefReflection?: string;
  strengths?: StrengthOrWeakness[];
  improvements?: StrengthOrWeakness[];
  feedback?: unknown;
  summaryByCategory?: Record<string, unknown>;
  communicationAssessment?: CommunicationAssessmentShape;
  mandatoryActions?: unknown[];
  optionalActions?: unknown[];
  // Permissive index for additional backend fields
  [key: string]: unknown;
}

export interface StudentReportViewProps {
  reportId: string;
  onBack?: () => void;
  onViewTranscript?: (reportId: string) => void;
  onEmailReport?: () => void;
  onRegisterPdfGenerator?: (fn: (() => string | null) | null) => void;
  variant?: 'student' | 'educator';
  classNameOverride?: string;
}

export default function StudentReportView({
  reportId,
  onBack,
  onViewTranscript,
  onEmailReport,
  onRegisterPdfGenerator,
  variant = 'student',
  classNameOverride,
}: StudentReportViewProps) {
  const [language, setLanguage] = useState<'en' | 'es'>(getStoredLanguage);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'app_language') {
        setLanguage(e.newValue?.toLowerCase() === 'es' ? 'es' : 'en');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const locale = language === 'es' ? loginEs : loginEn;
  const rL = locale.studentReport;
  const commLabels: CommunicationSectionLabels =
    rL.communication as CommunicationSectionLabels;
  const rubricLabels: RubricsLabels = rL.rubric as RubricsLabels;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [report, setReport] = useState<ReportData | null>(null);
  const [generatedDate, setGeneratedDate] = useState<string>('');
  const [scenarioSimulationStartTime, setScenarioSimulationStartTime] =
    useState<string>('');
  const [mandatoryMedicationTitles, setMandatoryMedicationTitles] = useState<
    string[]
  >([]);
  const [scenarioRubricConfig, setScenarioRubricConfig] = useState<
    Array<{ id: string; weight: number; subCategory: string }>
  >([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isEmailing, setIsEmailing] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [jumpSections, setJumpSections] = useState<
    Array<{ id: string; title: string }>
  >([]);
  const [isJumpOpen, setIsJumpOpen] = useState(false);
  const jumpRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (jumpRef.current && !jumpRef.current.contains(event.target as Node)) {
        setIsJumpOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const refreshJumpSections = useCallback(() => {
    if (typeof document === 'undefined') return;
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>('[data-jump-section]')
    );
    const sections = elements
      .map((el) => ({
        id: el.id,
        title: el.getAttribute('data-jump-title') || el.id,
      }))
      .filter((s) => Boolean(s.id && s.title));
    setJumpSections(sections);
  }, []);

  useEffect(() => {
    refreshJumpSections();
    const t1 = setTimeout(refreshJumpSections, 100);
    const t2 = setTimeout(refreshJumpSections, 400);
    const t3 = setTimeout(refreshJumpSections, 1000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [report, loading, refreshJumpSections]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({
    history: true,
    vitals: true,
    actions: true,
    medications: true,
    assessment: true,
    followup: true,
    demographics: true,
  });
  const [expandedSummaries, setExpandedSummaries] = useState<
    Record<string, boolean>
  >({
    empathy: false,
    clarity: false,
  });
  // Team Communication type requirement from scenario config (Mandatory | Optional | Distractor)
  const [tcTypeRequirement, setTcTypeRequirement] = useState<
    string | undefined
  >(undefined);
  const displayClassName = useMemo(
    () =>
      resolveDisplayClassName(
        report?.studentClass,
        classNameOverride,
        report?.studentName
      ),
    [report?.studentClass, classNameOverride, report?.studentName]
  );

  const pdfGenerator = useMemo<(() => string | null) | null>(() => {
    if (!report) return null;

    return () => {
      try {
        const pdf = buildStudentReportPDF(report as ReportDataForPDF, {
          reportId: report.id ?? report.key ?? reportId,
          displayClassName,
          returnDoc: true,
          language,
        });
        const dataUri = pdf.output('datauristring') as string;
        return dataUri.replace(/^data:application\/pdf;base64,/, '');
      } catch {
        return null;
      }
    };
  }, [report, displayClassName, reportId]);

  useEffect(() => {
    if (!onRegisterPdfGenerator) return undefined;
    onRegisterPdfGenerator(pdfGenerator);
    return () => {
      onRegisterPdfGenerator(null);
    };
  }, [onRegisterPdfGenerator, pdfGenerator]);
  // Fetch report dynamically with retry logic to handle Azure Blob Storage synchronization delays
  useEffect(() => {
    if (!reportId) {
      return;
    }

    let retryCount = 0;
    const maxRetries = variant === 'educator' ? 1 : 10;
    const retryDelay = 2000; // 2 seconds between retries

    const fetchReport = async () => {
      try {
        const data = await api.getAdminReportsById(reportId);
        setReport(data as unknown as ReportData);

        // Set generated date (include time for fallback cases)
        setGeneratedDate(formatDateTime(data.createdAt));
        setLoading(false);

        // Scenario details enrich the rubric UI — load after the report is visible.
        const simTimeFromReport = data?.scenario?.simulationStartTime;
        if (simTimeFromReport) {
          setScenarioSimulationStartTime(simTimeFromReport);
        }
        if (data?.scenarioId) {
          try {
            const scenario = await api.getScenario(data.scenarioId);
            if (!simTimeFromReport && scenario?.simulationStartTime) {
              setScenarioSimulationStartTime(scenario.simulationStartTime);
            }
            const orders = (
              scenario as {
                orders?: Array<{
                  title?: string;
                  category?: string;
                  medicationConfig?: { gradingConfig?: { enabled?: boolean } };
                }>;
              } | null
            )?.orders;
            if (Array.isArray(orders)) {
              const titles = orders
                .filter(
                  (o) =>
                    o?.category === 'Medication' &&
                    o?.medicationConfig?.gradingConfig?.enabled === true
                )
                .map((o) => (o.title ?? '').trim())
                .filter((t) => t.length > 0);
              setMandatoryMedicationTitles(titles);
            }
            // Extract rubric configuration for weights
            const rubricConfig = (
              scenario as {
                grading?: {
                  rubric?: Array<{
                    id: string;
                    weight: number;
                    subCategory: string;
                  }>;
                };
              } | null
            )?.grading?.rubric;
            if (Array.isArray(rubricConfig)) {
              setScenarioRubricConfig(rubricConfig);
            }
            // Extract Team Communication type requirement — only when TC is enabled
            // AND TC data actually exists in this report (i.e., TC was part of this
            // simulation session). This prevents the badge from showing when the
            // scenario config has TC enabled but the student never encountered it.
            const tcReq = (
              scenario as {
                teamCommunication?: {
                  typeRequirement?: string;
                  isButtonEnabled?: boolean;
                };
              } | null
            )?.teamCommunication?.typeRequirement;
            const tcEnabled =
              (
                scenario as {
                  teamCommunication?: { isButtonEnabled?: boolean };
                } | null
              )?.teamCommunication?.isButtonEnabled === true;
            const tcInReportData =
              Array.isArray(data.summaryByCategory?.actions) &&
              (
                data.summaryByCategory!.actions as Array<{ title?: string }>
              ).some((a) => a.title === 'Team Communication');
            if (tcReq && tcEnabled && tcInReportData) {
              setTcTypeRequirement(tcReq);
            }
          } catch {
            // non-critical, ignore
          }
        }
      } catch (err: unknown) {
        const apiErr = err as ApiErrorLike | undefined;
        const status = apiErr?.response?.status;
        const isNotFound = status === 404;

        if (isNotFound && retryCount < maxRetries) {
          retryCount++;
          setTimeout(fetchReport, retryDelay);
        } else {
          setError(
            variant === 'educator'
              ? 'Unable to load this report. Please try again.'
              : 'Failed to load report. If you just finished a simulation, please wait a minute and refresh the page.'
          );
          setLoading(false);
        }
      }
    };

    fetchReport();
  }, [reportId]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _toggleCategory = (category: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const toggleSummary = (type: string) => {
    setExpandedSummaries((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _getCategoryDisplayName = (category: string): string => {
    return `[${category || 'summary'}]`;
  };

  const formatDateTime = (value: unknown) => {
    if (!value) {
      return '';
    }
    const dateLocale = language === 'es' ? 'es-ES' : 'en-US';
    try {
      const d = new Date(value as string | number | Date);
      if (!isNaN(d.getTime())) {
        const month = d.toLocaleString(dateLocale, { month: 'long' });
        const day = d.getDate();
        const year = d.getFullYear();
        const hours = d.getHours().toString().padStart(2, '0');
        const minutes = d.getMinutes().toString().padStart(2, '0');
        return `${month} ${day}, ${year} ${hours}:${minutes}`;
      }
      // Handle pre-formatted strings like "05/18/2026 18:45" — reformat
      const str = String(value);
      const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(.+)$/);
      if (match) {
        const monthsEn = [
          'January',
          'February',
          'March',
          'April',
          'May',
          'June',
          'July',
          'August',
          'September',
          'October',
          'November',
          'December',
        ];
        const monthsEs = [
          'enero',
          'febrero',
          'marzo',
          'abril',
          'mayo',
          'junio',
          'julio',
          'agosto',
          'septiembre',
          'octubre',
          'noviembre',
          'diciembre',
        ];
        const months = language === 'es' ? monthsEs : monthsEn;
        const monthName = months[parseInt(match[1], 10) - 1] || match[1];
        return `${monthName} ${match[2]}, ${match[3]} ${match[4]}`;
      }
      return str;
    } catch {
      return String(value);
    }
  };

  // Format simulation time based on configured scenario start time
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _formatSimulationTime = (realTimestamp: string) => {
    try {
      // Prefer the sim-start time captured in local state (populated from the
      // scenario API on load); fall back to the value embedded in the report.
      const simStart =
        scenarioSimulationStartTime || report?.scenario?.simulationStartTime;
      if (!simStart || !report?.scenarioStartTime) {
        return formatDateTime(realTimestamp);
      }

      // Parse configured simulation start time (e.g., "2026-06-06T03:05:00")
      const configuredStart = new Date(simStart);
      const realStart = new Date(report.scenarioStartTime);
      const realTime = new Date(realTimestamp);

      // Calculate elapsed milliseconds from real start
      const elapsedMs = realTime.getTime() - realStart.getTime();

      // Add elapsed time to configured simulation start time
      const simulationTime = new Date(configuredStart.getTime() + elapsedMs);

      const dateLocale = language === 'es' ? 'es-ES' : 'en-US';
      const month = simulationTime.toLocaleString(dateLocale, {
        month: 'long',
      });
      const day = simulationTime.getDate();
      const year = simulationTime.getFullYear();
      const hours = simulationTime.getHours().toString().padStart(2, '0');
      const minutes = simulationTime.getMinutes().toString().padStart(2, '0');
      return `${month} ${day}, ${year} ${hours}:${minutes}`;
    } catch {
      return formatDateTime(realTimestamp);
    }
  };

  // Format the real start time of the simulation session
  const getSimulationDateTime = () => {
    if (report?.scenarioStartTime) {
      return formatDateTime(report.scenarioStartTime);
    }
    return generatedDate;
  };

  // Compute submitted time: use real time when the simulation was submitted
  const getSimulationSubmittedTime = () => {
    if (report?.scenarioEndTime) {
      return formatDateTime(report.scenarioEndTime);
    }
    return generatedDate;
  };

  // Compute report-generated time: use real time when the report was created
  const getSimulationReportGeneratedTime = () => {
    if (report?.createdAt) {
      return formatDateTime(report.createdAt);
    }
    return generatedDate;
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _normalizeSummaryItems = (val: unknown): unknown[] => {
    if (Array.isArray(val)) {
      return val;
    }
    if (val && typeof val === 'object') {
      const results: unknown[] = [];
      for (const inner of Object.values(val as Record<string, unknown>)) {
        if (Array.isArray(inner)) {
          results.push(...inner);
        }
      }
      return results;
    }
    return [];
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _getScoreColor = (score: number) => {
    if (score >= 90) {
      return 'text-emerald-700';
    }
    if (score >= 75) {
      return 'text-blue-700';
    }
    if (score >= 60) {
      return 'text-amber-700';
    }
    return 'text-rose-700';
  };

  // Handle back navigation
  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#db8833] mb-4" />
        <p className="text-gray-600 text-lg">
          {variant === 'educator'
            ? 'Loading student report...'
            : 'Finalizing your Assessment Report...'}
        </p>
        <p className="text-gray-400 text-sm mt-2 font-medium">
          {variant === 'educator'
            ? 'Fetching assessment data for this student.'
            : 'This may take a few moments while we sync the data.'}
        </p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-gray-50">
        <div className="bg-white p-8 rounded-lg border border-gray-200 max-w-md text-center shadow-sm">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Unable to Load Report
          </h2>
          <p className="text-gray-600 mb-6">
            {error || 'Report not found or access denied.'}
          </p>
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-2 px-5 py-2.5 border-2 border-[#C23D00] text-[#C23D00] rounded-lg font-semibold hover:bg-[#FFF4EC] transition-colors outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C23D00] focus-visible:ring-offset-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Extract dynamic data
  const score = report.score;
  const rubrics = report?.communicationAssessment?.rubrics;
  const hasRubrics =
    !!rubrics?.items && Object.keys(rubrics.items || {}).length > 0;
  const executiveSummaryText = rubrics?.overallSummary || report?.summary || '';
  const reportData = {
    score,
    summary: executiveSummaryText,
    strengths: rubrics?.strengths || [],
    improvements: rubrics?.improvements || [],
    feedback: rubrics?.feedback,
  };

  // Extract medication grading results from summaryByCategory
  const medicationGradingResults: Array<{
    medicationId?: string;
    medicationName: string;
    orderTitle?: string;
    overallScore: number;
    totalExpected: number;
    totalCorrect: number;
    mandatory?: boolean;
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
  }> = [];

  const medicationEntries = (report.summaryByCategory?.medications ||
    []) as Array<{
    administrationDetails?: {
      medicationId?: string;
      medicationName?: string;
      orderTitle?: string;
      gradingResult?: {
        medicationId?: string;
        medicationName: string;
        overallScore: number;
        totalExpected: number;
        totalCorrect: number;
        mandatory?: boolean;
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
    };
  }>;

  for (const entry of medicationEntries) {
    const gradingResult = entry.administrationDetails?.gradingResult;
    if (gradingResult) {
      medicationGradingResults.push({
        ...gradingResult,
        orderTitle:
          entry.administrationDetails?.orderTitle ||
          gradingResult.medicationName,
      });
    }
  }

  // Extract communication assessment data
  const communicationAssessment = report.communicationAssessment || {};
  const softSkills = communicationAssessment.softSkills || undefined;
  const technicalSkills = communicationAssessment.technicalSkills || undefined;

  // Extract Team Communication SBAR status
  const sbarStatus = (() => {
    const actions = report.summaryByCategory?.actions as
      | Array<{
          title?: string;
          details?: string;
        }>
      | undefined;
    if (!Array.isArray(actions)) {
      return null; // No Team Communication configured
    }

    // Collect all Team Communication result entries across all attempts
    const sbarEntries = (
      actions as Array<{ title?: string; details?: string }>
    ).filter(
      (action) =>
        action.title === 'Team Communication' &&
        action.details?.includes('Result:')
    );

    if (sbarEntries.length === 0) {
      return null; // Team Communication not configured
    }

    // Use best-attempt scoring: if ANY attempt was Satisfactory, the overall
    // result is Satisfactory. This prevents an early unsatisfactory attempt
    // from overriding a later successful one.
    const statuses = sbarEntries
      .map((entry) => {
        const match = entry.details?.match(/Result:\s*(\w+)/i);
        return match ? String(match[1]) : null;
      })
      .filter(Boolean);

    if (statuses.some((s) => s?.toLowerCase() === 'satisfactory')) {
      return 'Satisfactory';
    }
    const last = statuses[statuses.length - 1] ?? null;
    // "Not Attempted" means the student never opened TC — treat as null so
    // Optional/Distractor scenarios correctly show the "NOT DONE" badge
    if (
      last?.toLowerCase() === 'not' ||
      last?.toLowerCase() === 'not attempted'
    ) {
      return null;
    }
    // Handle multi-word "Not Attempted" stored as single token by regex
    const lastRaw = sbarEntries[sbarEntries.length - 1]?.details ?? '';
    const fullMatch = lastRaw.match(
      /Result:\s*(Not Attempted|Satisfactory|Unsatisfactory)/i
    );
    if (fullMatch && fullMatch[1].toLowerCase() === 'not attempted') {
      return null;
    }
    return last;
  })();

  // "Inappropriate Actions" (distractors) is an admin-only PDF section. The
  // `variant` prop is currently narrowed to "student" | "educator", so this
  // resolves to `false` at runtime for both student and educator builds. We
  // derive it from `variant` (rather than hard-coding `false`) so the guarded
  // sections remain wired to a real runtime signal and can be enabled by an
  // admin build without further edits.
  const isAdminView: boolean = (variant as string) === 'admin';

  const handleDownloadPDF = async () => {
    if (!report) return;
    setIsGeneratingPDF(true);
    try {
      const rLAny = rL as Record<string, unknown>;
      const rubricAny = (rL.rubric || {}) as Record<string, unknown>;
      const reportIdLabelRaw =
        typeof rLAny.reportId === 'string'
          ? rLAny.reportId
          : typeof rubricAny.reportId === 'string'
            ? rubricAny.reportId
            : 'Report ID';
      const reportIdLabel = reportIdLabelRaw
        ? reportIdLabelRaw.replace(/:$/, '').trim()
        : 'Report ID';

      await generatePdfFromElement({
        elementId: 'report-printable',
        fileName: `report-${reportId}.pdf`,
        reportId,
        labels: {
          reportId: reportIdLabel,
          page: typeof rubricAny.page === 'string' ? rubricAny.page : 'Page',
          of: typeof rubricAny.of === 'string' ? rubricAny.of : 'of',
        },
        onCloneExtra: (clonedEl) => {
          const hideEls = clonedEl.querySelectorAll<HTMLElement>('.pdf-hide');
          hideEls.forEach((el) => {
            el.style.display = 'none';
          });
          if (clonedEl.classList.contains('pdf-hide')) {
            clonedEl.style.display = 'none';
          }

          const pdfOnlyEls =
            clonedEl.querySelectorAll<HTMLElement>('[data-pdfonly]');
          pdfOnlyEls.forEach((el) => {
            el.style.display = 'inline-block';
          });
          if (clonedEl.hasAttribute('data-pdfonly')) {
            clonedEl.style.display = 'inline-block';
          }

          const scoreLabels = clonedEl.querySelectorAll<HTMLElement>(
            '[data-pdf-scorelabel]'
          );
          scoreLabels.forEach((el) => {
            el.style.color = '#5f6060';
          });
          const scoreCard = clonedEl.querySelector<HTMLElement>(
            '#sec-score, [data-pdf-scorecard]'
          );
          if (scoreCard) {
            scoreCard.style.background = '#ffffff';
            scoreCard.style.backgroundImage = 'none';
            scoreCard.style.backgroundColor = '#ffffff';
          }
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to generate report PDF:', err);
      alert('An error occurred while generating the PDF. Please try again.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // ── DEAD CODE TOMBSTONE — kept only so git history is intact ──────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleDownloadPDF_legacy = () => {
    setIsGeneratingPDF(true);

    // Text-based PDF generation
    try {
      const pdf = new jsPDF();
      let yPos = 20;

      // Font Size Constants for Consistency
      const FONT_SIZE_TITLE = 18;
      const FONT_SIZE_SECTION = 14;
      const FONT_SIZE_SUBHEADER = 12;
      const FONT_SIZE_BODY = 10;
      const FONT_SIZE_SMALL = 9;

      // Header
      pdf.setFontSize(FONT_SIZE_TITLE);
      pdf.setFont('helvetica', 'bold');
      pdf.text(
        report?.mode === 'Practice' ? 'Practice Report' : 'Assessment Report',
        20,
        yPos
      );
      pdf.setFont('helvetica', 'normal');
      yPos += 15;

      const scenarioTitle =
        report?.scenarioTitle ||
        report?.scenarioId?.replace(/-/g, ' ') ||
        'N/A';

      const simulationStarted = getSimulationDateTime();
      const simulationSubmitted = getSimulationSubmittedTime();

      // Scenario Info
      pdf.setFontSize(FONT_SIZE_BODY);
      const studentCodeLines = pdf.splitTextToSize(
        sanitizePdfText(`Student Code: ${report?.userId || 'N/A'}`),
        170
      ) as string[];
      pdf.text(studentCodeLines, 20, yPos);
      yPos += studentCodeLines.length * 6 + 4;

      const classLines = pdf.splitTextToSize(
        sanitizePdfText(`Class: ${displayClassName || 'N/A'}`),
        170
      ) as string[];
      pdf.text(classLines, 20, yPos);
      yPos += classLines.length * 6 + 4;

      const scenarioLines = pdf.splitTextToSize(
        sanitizePdfText(`Sim: ${scenarioTitle}`),
        170
      ) as string[];
      pdf.text(scenarioLines, 20, yPos);
      yPos += scenarioLines.length * 6 + 4;

      const startedLines = pdf.splitTextToSize(
        sanitizePdfText(`Simulation Started: ${simulationStarted || 'N/A'}`),
        170
      ) as string[];
      pdf.text(startedLines, 20, yPos);
      yPos += startedLines.length * 6 + 4;

      const submittedLines = pdf.splitTextToSize(
        sanitizePdfText(
          `Simulation Submitted: ${simulationSubmitted || 'N/A'}`
        ),
        170
      ) as string[];
      pdf.text(submittedLines, 20, yPos);
      yPos += submittedLines.length * 6 + 4;

      const generatedLines = pdf.splitTextToSize(
        sanitizePdfText(
          `Report Generated: ${getSimulationReportGeneratedTime() || 'N/A'}`
        ),
        170
      ) as string[];
      pdf.text(generatedLines, 20, yPos);
      yPos += generatedLines.length * 6 + 10;

      // Overall Score (Assessment Mode only)
      if (report?.mode !== 'Practice') {
        pdf.setFontSize(FONT_SIZE_SECTION);
        pdf.setFont('helvetica', 'bold');
        pdf.text(
          sanitizePdfText(`Overall Performance Score: ${score || 0}%`),
          20,
          yPos
        );
        pdf.setFont('helvetica', 'normal');
        yPos += 15;
      }

      // Executive Summary
      pdf.setFontSize(FONT_SIZE_SECTION);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Executive Summary:', 20, yPos);
      yPos += 8;
      pdf.setFontSize(FONT_SIZE_BODY);
      pdf.setFont('helvetica', 'normal');
      const summaryLines = pdf.splitTextToSize(
        sanitizePdfText(reportData.summary),
        170
      ) as string[];
      pdf.text(summaryLines, 20, yPos);
      yPos += summaryLines.length * 5 + 15;

      // Communication Assessment (matches on-page conditional UI)
      if (hasRubrics && rubrics?.items) {
        if (yPos > 240) {
          pdf.addPage();
          yPos = 20;
        }

        pdf.setFontSize(FONT_SIZE_SECTION);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Communication Assessment', 20, yPos);
        pdf.setFont('helvetica', 'normal');
        yPos += 10;

        // Preserve "first-seen" category ordering (matches RubricsSection)
        const itemsArray: RubricLikeItem[] = rubrics?.items
          ? Object.values(rubrics.items)
          : [];

        const grouped = new Map<string, RubricLikeItem[]>();
        for (const item of itemsArray) {
          const key = item?.subCategory || 'Other';
          if (!grouped.has(key)) {
            grouped.set(key, []);
          }
          grouped.get(key)!.push(item);
        }

        const pdfCategoryOrder = [
          'Action',
          'Actions & Interventions',
          'Medications',
          'Expected Actions',
          'PPE, Privacy, & Safety Actions',
          'PPE',
          'Privacy & Safety',
          'Documentation',
          'Clinical Documentation',
          'Communication',
          'Professional Communication',
          'Timeline',
          'Timing',
        ];
        const sortedGroupEntries = Array.from(grouped.entries()).sort(
          ([a], [b]) => {
            const ai = pdfCategoryOrder.findIndex(
              (c) => a.toLowerCase() === c.toLowerCase()
            );
            const bi = pdfCategoryOrder.findIndex(
              (c) => b.toLowerCase() === c.toLowerCase()
            );
            if (ai !== -1 && bi !== -1) {
              return ai - bi;
            }
            if (ai !== -1) {
              return -1;
            }
            if (bi !== -1) {
              return 1;
            }
            return 0;
          }
        );

        for (const [subCategory, items] of sortedGroupEntries) {
          // ── SubCategory group header: text first, line below ──────────
          if (yPos > 250) {
            pdf.addPage();
            yPos = 20;
          }
          yPos += 4;

          for (const item of items) {
            if (yPos > 240) {
              pdf.addPage();
              yPos = 20;
            }

            // Item name (bold) + qualitative rating only (no numerical score)
            const scoreLabel =
              item?.score !== undefined
                ? `${item.score >= 80 ? 'EXCEPTIONAL' : item.score >= 50 ? 'MEETS EXPECTATION' : 'NEEDS IMPROVEMENT'}`
                : '';
            const subCategoryNormMap: Record<string, string> = {
              action: 'Action',
              'actions & interventions': 'Action',
              'actions and interventions': 'Action',
              'expected actions': 'Expected Actions',
              medications: 'Medications',
              medication: 'Medications',
              ppe: 'PPE',
              'ppe, privacy, & safety actions': 'PPE',
              'privacy & safety': 'PPE',
              documentation: 'Documentation',
              'clinical documentation': 'Documentation',
              communication: 'Communication',
              'professional communication': 'Communication',
              timeline: 'Sequencing & Prioritization',
              timing: 'Sequencing & Prioritization',
              'sequencing & prioritization': 'Sequencing & Prioritization',
            };
            const subCategoryKey = (subCategory ?? '').toLowerCase().trim();
            const normalizedLabel =
              subCategoryNormMap[subCategoryKey] ?? item?.name ?? subCategory;
            pdf.setFontSize(FONT_SIZE_SUBHEADER);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(251, 96, 51);
            pdf.text(sanitizePdfText(normalizedLabel.toUpperCase()), 20, yPos);
            if (scoreLabel) {
              pdf.setFontSize(8);
              pdf.setFont('helvetica', 'normal');
              pdf.setTextColor(0, 0, 0);
              const scoreX = 190 - pdf.getTextWidth(scoreLabel);
              pdf.text(sanitizePdfText(scoreLabel), scoreX, yPos);
            }
            pdf.setTextColor(0, 0, 0);
            pdf.setFont('helvetica', 'normal');
            yPos += 8;

            // Weight %
            pdf.setFontSize(FONT_SIZE_SMALL);
            pdf.setTextColor(150, 150, 150);
            pdf.text(`Weight ${item?.weight ?? 20}%`, 20, yPos);
            pdf.setTextColor(0, 0, 0);
            yPos += 7;

            if (item?.summary) {
              pdf.setFontSize(FONT_SIZE_BODY);
              const itemSummaryLines = pdf.splitTextToSize(
                sanitizePdfText(item.summary),
                170
              ) as string[];
              pdf.text(itemSummaryLines, 20, yPos);
              yPos += itemSummaryLines.length * 5 + 6;
            }

            // Team Communication badge (Communication rubric only)
            const isCommunicationItem =
              (item?.subCategory ?? '').toLowerCase() === 'communication' ||
              (item?.subCategory ?? '').toLowerCase() ===
                'professional communication' ||
              (item?.name ?? '').toLowerCase().includes('communication');
            if (isCommunicationItem && sbarStatus) {
              if (yPos > 265) {
                pdf.addPage();
                yPos = 20;
              }
              pdf.setFontSize(FONT_SIZE_BODY);
              pdf.setFont('helvetica', 'bold');
              pdf.setTextColor(29, 78, 216); // blue
              pdf.text('TEAM COMMUNICATION', 20, yPos);
              const labelWidth = pdf.getTextWidth('TEAM COMMUNICATION');
              const sbarColor =
                sbarStatus.toLowerCase() === 'satisfactory'
                  ? ([5, 150, 105] as [number, number, number]) // green
                  : ([185, 28, 28] as [number, number, number]); // red
              pdf.setTextColor(...sbarColor);
              pdf.text(
                sanitizePdfText(sbarStatus.toUpperCase()),
                20 + labelWidth + 4,
                yPos
              );
              pdf.setTextColor(0, 0, 0);
              pdf.setFont('helvetica', 'normal');
              yPos += 10;
            }

            // Strengths (deduplicated by point text — matches app-version)
            const seenStrengthPoints = new Set<string>();
            const strengths: StrengthOrWeakness[] = (
              Array.isArray(item?.strengths) ? item.strengths : []
            ).filter((it) => {
              const key = swPoint(it).trim().toLowerCase();
              if (!key || seenStrengthPoints.has(key)) {
                return false;
              }
              seenStrengthPoints.add(key);
              return true;
            });
            if (strengths.length > 0) {
              if (yPos > 265) {
                pdf.addPage();
                yPos = 20;
              }
              pdf.setFontSize(FONT_SIZE_BODY);
              pdf.setFont('helvetica', 'bold');
              pdf.setTextColor(0, 128, 0);
              pdf.text('Strengths:', 20, yPos);
              pdf.setFont('helvetica', 'normal');
              pdf.setTextColor(0, 0, 0);
              yPos += 6;
              for (const it of strengths) {
                if (yPos > 270) {
                  pdf.addPage();
                  yPos = 20;
                }
                const ptLines = pdf.splitTextToSize(
                  sanitizePdfText(`• ${swPoint(it)}`),
                  160
                ) as string[];
                pdf.text(ptLines, 25, yPos);
                yPos += ptLines.length * 5 + 1;
              }
              yPos += 5;
            }

            // Weaknesses (deduplicated by point text — matches app-version)
            const seenWeaknessPoints = new Set<string>();
            const weaknesses: StrengthOrWeakness[] = (
              Array.isArray(item?.weaknesses) ? item.weaknesses : []
            ).filter((it) => {
              const key = swPoint(it).trim().toLowerCase();
              if (!key || seenWeaknessPoints.has(key)) {
                return false;
              }
              seenWeaknessPoints.add(key);
              return true;
            });
            if (weaknesses.length > 0) {
              if (yPos > 265) {
                pdf.addPage();
                yPos = 20;
              }
              pdf.setFontSize(FONT_SIZE_BODY);
              pdf.setFont('helvetica', 'bold');
              pdf.setTextColor(200, 80, 0);
              pdf.text('Weaknesses:', 20, yPos);
              pdf.setFont('helvetica', 'normal');
              pdf.setTextColor(0, 0, 0);
              yPos += 6;
              for (const it of weaknesses) {
                if (yPos > 270) {
                  pdf.addPage();
                  yPos = 20;
                }
                const ptLines = pdf.splitTextToSize(
                  sanitizePdfText(`• ${swPoint(it)}`),
                  160
                ) as string[];
                pdf.text(ptLines, 25, yPos);
                yPos += ptLines.length * 5 + 1;
                const exText = swExample(it);
                if (exText) {
                  pdf.setFont('helvetica', 'italic');
                  const exLines = pdf.splitTextToSize(
                    sanitizePdfText(`  "${exText}"`),
                    155
                  ) as string[];
                  pdf.text(exLines, 30, yPos);
                  pdf.setFont('helvetica', 'normal');
                  yPos += exLines.length * 4 + 2;
                }
              }
              yPos += 5;
            }

            // Optional Actions Completed (matches UI order: before Recommendations)
            // For the Medications item, derive optional medications from medicationGradingResults
            // because the raw rubric item doesn't carry actionDetails for optional medications.
            const isMedItem =
              (item?.subCategory ?? '').toLowerCase() === 'medications' ||
              (item?.name ?? '').toLowerCase() === 'medications';
            const optionalDoneFromMeds = isMedItem
              ? medicationGradingResults
                  .filter((r) => r.mandatory === false && r.overallScore >= 100)
                  .map((r) => ({
                    title: r.orderTitle || r.medicationName,
                    isCorrect: true,
                  }))
              : [];
            const optionalDone = isMedItem
              ? optionalDoneFromMeds
              : (item?.actionDetails ?? []).filter(
                  (d) =>
                    d.isOptional === true &&
                    (d.type === 'vital'
                      ? (d.attemptsCount ?? 0) > 0
                      : d.isCorrect === true)
                );
            if (optionalDone.length > 0) {
              if (yPos > 260) {
                pdf.addPage();
                yPos = 20;
              }
              pdf.setFontSize(FONT_SIZE_BODY);
              pdf.setFont('helvetica', 'bold');
              pdf.setTextColor(180, 120, 0);
              pdf.text(
                isMedItem
                  ? 'Optional Medications Completed:'
                  : 'Optional Actions Completed:',
                20,
                yPos
              );
              pdf.setFont('helvetica', 'normal');
              pdf.setTextColor(0, 0, 0);
              yPos += 6;
              for (const d of optionalDone) {
                if (yPos > 270) {
                  pdf.addPage();
                  yPos = 20;
                }
                const optLines = pdf.splitTextToSize(
                  sanitizePdfText(`• ${d.title || ''}`),
                  160
                ) as string[];
                pdf.text(optLines, 25, yPos);
                yPos += optLines.length * 5 + 1;
                if (isMedItem) {
                  pdf.setFont('helvetica', 'italic');
                  pdf.setFontSize(FONT_SIZE_SMALL);
                  pdf.setTextColor(120, 120, 120);
                  pdf.text('Medication performed correctly', 30, yPos);
                  pdf.setFont('helvetica', 'normal');
                  pdf.setFontSize(FONT_SIZE_BODY);
                  pdf.setTextColor(0, 0, 0);
                  yPos += 5;
                }
              }
              yPos += 5;
            }

            // Improvement Recommendations (rubric item) — skip for Medications
            const isMedicationsItem =
              (item?.subCategory ?? '').toLowerCase() === 'medications' ||
              (item?.name ?? '').toLowerCase() === 'medications';
            if (
              !isMedicationsItem &&
              Array.isArray(item?.recommendations) &&
              item.recommendations.length > 0
            ) {
              if (yPos > 260) {
                pdf.addPage();
                yPos = 20;
              }
              pdf.setFontSize(FONT_SIZE_BODY);
              pdf.setFont('helvetica', 'bold');
              pdf.setTextColor(37, 99, 235);
              pdf.text('Recommendations:', 20, yPos);
              pdf.setFont('helvetica', 'normal');
              pdf.setTextColor(0, 0, 0);
              yPos += 6;
              for (const rec of item.recommendations) {
                if (yPos > 270) {
                  pdf.addPage();
                  yPos = 20;
                }
                const recLines = pdf.splitTextToSize(
                  sanitizePdfText(`• ${rec}`),
                  160
                ) as string[];
                pdf.text(recLines, 25, yPos);
                yPos += recLines.length * 5 + 1;
              }
              yPos += 5;
            }

            // Inappropriate Actions (Distractors) - ONLY FOR ADMINS
            const distractors =
              isAdminView &&
              item?.subCategory?.toLowerCase() === 'action' &&
              Array.isArray(item?.actionDetails) &&
              item.actionDetails.some((d) => d.type === 'distractor');

            if (distractors) {
              if (yPos > 240) {
                pdf.addPage();
                yPos = 20;
              }

              pdf.setFontSize(FONT_SIZE_SECTION);
              pdf.setTextColor(0, 0, 0);
              pdf.setFont('helvetica', 'bold');
              pdf.text('Inappropriate Actions', 20, yPos);
              yPos += 8;
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(FONT_SIZE_BODY);

              const distSummary =
                'During this simulation, one or more actions were performed that are classified as inappropriate or distractor actions within the context of this scenario. These actions were not aligned with the expected clinical pathway or the defined scenario objectives. Although identified as inappropriate, these actions do not impact the overall score or grading for this simulation. This section is provided solely for learning and professional development purposes and is intended to support performance improvement.';
              const distLines = pdf.splitTextToSize(
                distSummary,
                170
              ) as string[];
              pdf.text(distLines, 20, yPos);
              yPos += distLines.length * 5 + 5;

              pdf.text('Inappropriate actions may reflect:', 20, yPos);
              yPos += 6;

              for (const dist of item.actionDetails!.filter(
                (d) => d.type === 'distractor'
              )) {
                if (yPos > 270) {
                  pdf.addPage();
                  yPos = 20;
                }
                pdf.text(sanitizePdfText(`• ${dist?.title || ''}`), 25, yPos);
                yPos += 6;
              }
              yPos += 5;

              pdf.setFontSize(FONT_SIZE_SUBHEADER);
              pdf.setFont('helvetica', 'bold');
              pdf.text('Improvement Recommendations', 20, yPos);
              yPos += 6;
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(FONT_SIZE_BODY);

              const recIntro =
                'The actions listed above were inappropriate within the context of this scenario. These actions should generally be avoided in similar clinical situations unless clearly supported by patient assessment findings. Recommendations for improving future performance:';
              const recLines = pdf.splitTextToSize(recIntro, 170) as string[];
              pdf.text(recLines, 20, yPos);
              yPos += recLines.length * 5 + 5;

              [
                'Avoid initiating interventions without confirmed clinical need.',
                "Refrain from performing tasks that are not aligned with the scenario's primary priorities.",
                'Ensure patient data is reassessed thoroughly before taking action.',
                'Maintain focus on primary objectives before addressing secondary or unrelated tasks.',
                'Pause and verify clinical reasoning when uncertainty arises.',
              ].forEach((rec) => {
                if (yPos > 275) {
                  pdf.addPage();
                  yPos = 20;
                }
                pdf.text(sanitizePdfText(`- ${rec}`), 25, yPos);
                yPos += 5;
              });

              yPos += 6;
              pdf.setFontSize(FONT_SIZE_SMALL);
              pdf.setTextColor(0, 0, 0);
              pdf.text(
                'This report is made available for administrative review through the admin side of the application.',
                20,
                yPos
              );
              yPos += 12;

              pdf.setFontSize(FONT_SIZE_BODY);
              pdf.setFont('helvetica', 'bold');
              pdf.text('Disclaimer:', 20, yPos);
              yPos += 5;
              pdf.setFont('helvetica', 'normal');
              pdf.setFontSize(FONT_SIZE_BODY);

              const disclaimerText =
                'This section is intended for educational feedback only. The inappropriate actions identified here do not impact your score for this simulation. They are highlighted to support reflection, strengthen clinical reasoning, and promote safe practice in future patient encounters.';
              const disclaimerLines = pdf.splitTextToSize(
                disclaimerText,
                170
              ) as string[];
              pdf.text(disclaimerLines, 20, yPos);
              yPos += disclaimerLines.length * 5 + 10;
            }
          }
          yPos += 4;
        }
      }

      // Standard (non-rubrics) CommunicationSection view
      // Technical Skills Assessment - Individual Items
      if (!hasRubrics && technicalSkills?.items) {
        if (yPos > 240) {
          pdf.addPage();
          yPos = 20;
        }
        pdf.setFontSize(FONT_SIZE_SECTION);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Technical Skills Assessment:', 20, yPos);
        yPos += 8;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(FONT_SIZE_BODY);
        pdf.text('Evaluation of clinical and technical competencies', 20, yPos);
        yPos += 5;
        pdf.text(
          `Technical Skills Score: ${Number(
            (technicalSkills.totalScore || 0).toFixed(2)
          )}/${technicalSkills.totalWeight || 'N/A'}`,
          20,
          yPos
        );
        yPos += 8;

        const technicalSkillsRaw = Object.values(technicalSkills.items);
        const technicalSkillItemsMap = new Map<string, RubricLikeItem>();

        technicalSkillsRaw.forEach((item) => {
          const key =
            item.subCategory || item.name || item.aiCheckId || item.id;
          if (!key) {
            return;
          }
          if (technicalSkillItemsMap.has(key)) {
            const existing = technicalSkillItemsMap.get(key)!;
            if (
              (item.score || 0) > (existing.score || 0) ||
              ((item.score || 0) === (existing.score || 0) &&
                item.summary &&
                !existing.summary)
            ) {
              technicalSkillItemsMap.set(key, item);
            }
          } else {
            technicalSkillItemsMap.set(key, item);
          }
        });

        const technicalSkillItems = Array.from(technicalSkillItemsMap.values());

        technicalSkillItems.forEach((item) => {
          if (yPos > 240) {
            pdf.addPage();
            yPos = 20;
          }
          pdf.setFontSize(FONT_SIZE_BODY);
          pdf.setFont('helvetica', 'bold');
          // Numerical scores removed to match in-app display
          pdf.text(sanitizePdfText(`${item.name}`), 20, yPos);
          pdf.setFont('helvetica', 'normal');
          yPos += 6;
          if (item.summary) {
            pdf.setFontSize(FONT_SIZE_BODY);
            const itemSummaryLines = pdf.splitTextToSize(
              sanitizePdfText(item.summary),
              170
            ) as string[];
            pdf.text(itemSummaryLines, 25, yPos);
            yPos += itemSummaryLines.length * 4 + 5;
          }
          yPos += 3;

          // Note: the "Inappropriate Actions" section is shown only in the Rubrics UI for admins.
          if (
            hasRubrics &&
            isAdminView &&
            item.subCategory?.toLowerCase() === 'action' &&
            item.actionDetails?.some((d) => d.type === 'distractor')
          ) {
            if (yPos > 220) {
              pdf.addPage();
              yPos = 20;
            }

            pdf.setFontSize(FONT_SIZE_SECTION);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Inappropriate Actions', 20, yPos);
            yPos += 8;

            pdf.setFontSize(FONT_SIZE_BODY);
            pdf.setFont('helvetica', 'normal');
            const distSummary =
              'During this simulation, one or more actions were performed that are classified as inappropriate or distractor actions within the context of this scenario. These actions were not aligned with the expected clinical pathway or the defined scenario objectives. Although identified as inappropriate, these actions do not impact the overall score or grading for this simulation. This section is provided solely for learning and professional development purposes and is intended to support performance improvement.';
            const summaryLines = pdf.splitTextToSize(
              sanitizePdfText(distSummary),
              170
            ) as string[];
            pdf.text(summaryLines, 20, yPos);
            yPos += summaryLines.length * 5 + 5;

            pdf.text('Inappropriate actions may reflect:', 20, yPos);
            yPos += 6;

            item.actionDetails
              .filter((d) => d.type === 'distractor')
              .forEach((dist) => {
                if (yPos > 270) {
                  pdf.addPage();
                  yPos = 20;
                }
                pdf.text(sanitizePdfText(`• ${dist.title}`), 25, yPos);
                yPos += 6;
              });

            yPos += 5;
            if (yPos > 230) {
              pdf.addPage();
              yPos = 20;
            }

            pdf.setFontSize(FONT_SIZE_SUBHEADER);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Improvement Recommendations', 20, yPos);
            yPos += 6;

            pdf.setFontSize(FONT_SIZE_BODY);
            pdf.setFont('helvetica', 'normal');
            const recIntro =
              'The actions listed above were inappropriate within the context of this scenario. These actions should generally be avoided in similar clinical situations unless clearly supported by patient assessment findings. Recommendations for improving future performance:';
            const recLines = pdf.splitTextToSize(
              sanitizePdfText(recIntro),
              170
            ) as string[];
            pdf.text(recLines, 20, yPos);
            yPos += recLines.length * 5 + 5;

            [
              'Avoid initiating interventions without confirmed clinical need.',
              "Refrain from performing tasks that are not aligned with the scenario's primary priorities.",
              'Ensure patient data is reassessed thoroughly before taking action.',
              'Maintain focus on primary objectives before addressing secondary or unrelated tasks.',
              'Pause and verify clinical reasoning when uncertainty arises.',
            ].forEach((rec) => {
              if (yPos > 275) {
                pdf.addPage();
                yPos = 20;
              }
              pdf.text(`- ${rec}`, 25, yPos);
              yPos += 5;
            });

            yPos += 10;
            if (yPos > 250) {
              pdf.addPage();
              yPos = 20;
            }

            pdf.setFontSize(FONT_SIZE_BODY);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Disclaimer:', 20, yPos);
            yPos += 5;
            pdf.setFont('helvetica', 'normal');
            const disclaimerText =
              'This section is intended for educational feedback only. The inappropriate actions identified here do not impact your score for this simulation. They are highlighted to support reflection, strengthen clinical reasoning, and promote safe practice in future patient encounters.';
            const disclaimerLines = pdf.splitTextToSize(
              sanitizePdfText(disclaimerText),
              170
            ) as string[];
            pdf.text(disclaimerLines, 20, yPos);
            yPos += disclaimerLines.length * 5 + 10;
          }
        });
        yPos += 10;
      }

      // Communication Assessment - Individual Items
      if (!hasRubrics && softSkills?.items) {
        if (yPos > 240) {
          pdf.addPage();
          yPos = 20;
        }
        pdf.setFontSize(FONT_SIZE_SECTION);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Communication Assessment:', 20, yPos);
        yPos += 8;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(FONT_SIZE_BODY);
        pdf.text(
          'Evaluation of patient interaction and communication skills',
          20,
          yPos
        );
        yPos += 8;

        const softSkillItems = Object.values(softSkills.items ?? {});

        softSkillItems.forEach((item) => {
          if (yPos > 260) {
            pdf.addPage();
            yPos = 20;
          }

          const performanceLabel =
            (item.score || 0) >= 8
              ? 'EXCEPTIONAL'
              : (item.score || 0) >= 6
                ? 'MEETS EXPECTATION'
                : 'NEEDS IMPROVEMENT';

          pdf.setFontSize(FONT_SIZE_BODY);
          pdf.setFont('helvetica', 'bold');
          // Numerical score removed to match in-app display - only show name
          pdf.text(sanitizePdfText(`${item.name}`), 20, yPos);
          yPos += 6;
          pdf.setFontSize(FONT_SIZE_SMALL);
          pdf.setFont('helvetica', 'normal');
          pdf.text(`Performance: ${performanceLabel}`, 25, yPos);
          yPos += 5;

          const summaryText = item.summary || 'Communication skill';
          const itemSummaryLines = pdf.splitTextToSize(
            sanitizePdfText(summaryText),
            170
          ) as string[];
          pdf.setFontSize(FONT_SIZE_BODY);
          pdf.text(itemSummaryLines, 25, yPos);
          yPos += itemSummaryLines.length * 4 + 4;

          // Strengths
          const strengths: StrengthOrWeakness[] = Array.isArray(item.strengths)
            ? item.strengths
            : [];
          if (yPos > 270) {
            pdf.addPage();
            yPos = 20;
          }
          pdf.setFontSize(FONT_SIZE_BODY);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(0, 128, 0);
          pdf.text('STRENGTHS', 20, yPos);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(0, 0, 0);
          yPos += 5;

          if (strengths.length === 0) {
            pdf.text(sanitizePdfText('No items identified.'), 25, yPos);
            yPos += 5;
          } else {
            for (const it of strengths) {
              if (yPos > 270) {
                pdf.addPage();
                yPos = 20;
              }
              const ptLines = pdf.splitTextToSize(
                sanitizePdfText(`• ${swPoint(it)}`),
                155
              ) as string[];
              pdf.text(ptLines, 25, yPos);
              yPos += ptLines.length * 5 + 1;
              const exText = swExample(it);
              if (exText) {
                const exLines = pdf.splitTextToSize(
                  sanitizePdfText(`"${exText}"`),
                  150
                ) as string[];
                pdf.text(exLines, 35, yPos);
                yPos += exLines.length * 4 + 2;
              }
            }
            yPos += 3;
          }

          // Weaknesses
          const weaknesses: StrengthOrWeakness[] = Array.isArray(
            item.weaknesses
          )
            ? item.weaknesses
            : [];
          if (yPos > 270) {
            pdf.addPage();
            yPos = 20;
          }
          pdf.setFontSize(FONT_SIZE_BODY);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(200, 120, 0);
          pdf.text('WEAKNESSES', 20, yPos);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(0, 0, 0);
          yPos += 5;

          if (weaknesses.length === 0) {
            pdf.text(sanitizePdfText('No items identified.'), 25, yPos);
            yPos += 5;
          } else {
            for (const it of weaknesses) {
              if (yPos > 270) {
                pdf.addPage();
                yPos = 20;
              }
              const ptLines = pdf.splitTextToSize(
                sanitizePdfText(`• ${swPoint(it)}`),
                155
              ) as string[];
              pdf.text(ptLines, 25, yPos);
              yPos += ptLines.length * 5 + 1;
              const exText = swExample(it);
              if (exText) {
                const exLines = pdf.splitTextToSize(
                  sanitizePdfText(`"${exText}"`),
                  150
                ) as string[];
                pdf.text(exLines, 35, yPos);
                yPos += exLines.length * 4 + 2;
              }
            }
            yPos += 3;
          }

          // Improvement Recommendations (per soft-skill item)
          if (
            Array.isArray(item.recommendations) &&
            item.recommendations.length > 0
          ) {
            if (yPos > 270) {
              pdf.addPage();
              yPos = 20;
            }
            pdf.setFontSize(FONT_SIZE_BODY);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(0, 100, 200);
            pdf.text('Improvement Recommendations', 20, yPos);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(0, 0, 0);
            yPos += 5;

            pdf.setFontSize(FONT_SIZE_BODY);
            for (const rec of item.recommendations) {
              if (yPos > 270) {
                pdf.addPage();
                yPos = 20;
              }
              const recLines = pdf.splitTextToSize(
                sanitizePdfText(`• ${rec}`),
                155
              ) as string[];
              pdf.text(recLines, 25, yPos);
              yPos += recLines.length * 5 + 1;
            }
            yPos += 3;
          }
        });
        yPos += 10;
      }

      // Technical Skills Assessment overview (shown only in non-rubrics UI)
      if (!hasRubrics && report.communicationAssessment?.technicalSkills) {
        if (yPos > 240) {
          pdf.addPage();
          yPos = 20;
        }
        pdf.setFontSize(FONT_SIZE_SECTION);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Technical Skills overview:', 20, yPos);
        pdf.setFont('helvetica', 'normal');
        yPos += 8;

        if (
          (report.communicationAssessment.technicalSkills.overallstrengths
            ?.length ?? 0) > 0
        ) {
          pdf.setFontSize(FONT_SIZE_SUBHEADER);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(0, 128, 0);
          pdf.text('Strengths:', 20, yPos);
          yPos += 6;
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(FONT_SIZE_BODY);
          pdf.setFont('helvetica', 'normal');
          (
            report.communicationAssessment?.technicalSkills?.overallstrengths ??
            []
          ).forEach((strength) => {
            const strengthText =
              typeof strength === 'string'
                ? strength
                : `${strength.point || ''}${strength.example ? `: "${strength.example}"` : ''}`;
            const strengthLines = pdf.splitTextToSize(
              sanitizePdfText(`• ${strengthText}`),
              170
            ) as string[];
            pdf.text(strengthLines, 25, yPos);
            yPos += strengthLines.length * 4 + 2;
          });
          yPos += 5;
        }

        if (
          (report.communicationAssessment?.technicalSkills?.overallweaknesses
            ?.length ?? 0) > 0
        ) {
          pdf.setFontSize(FONT_SIZE_SUBHEADER);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(200, 0, 0);
          pdf.text('Weaknesses:', 20, yPos);
          yPos += 6;
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(FONT_SIZE_BODY);
          pdf.setFont('helvetica', 'normal');
          (
            report.communicationAssessment?.technicalSkills
              ?.overallweaknesses ?? []
          ).forEach((weakness) => {
            const weaknessText =
              typeof weakness === 'string'
                ? weakness
                : `${weakness.point || ''}${weakness.example ? `: "${weakness.example}"` : ''}`;
            const weaknessLines = pdf.splitTextToSize(
              sanitizePdfText(`• ${weaknessText}`),
              170
            ) as string[];
            pdf.text(weaknessLines, 25, yPos);
            yPos += weaknessLines.length * 4 + 2;
          });
          yPos += 5;
        }

        if (
          (report.communicationAssessment?.technicalSkills
            ?.overallrecommendations?.length ?? 0) > 0
        ) {
          pdf.setFontSize(FONT_SIZE_SUBHEADER);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(0, 100, 200);
          pdf.text('Recommendations:', 20, yPos);
          yPos += 6;
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(FONT_SIZE_BODY);
          pdf.setFont('helvetica', 'normal');
          (
            report.communicationAssessment?.technicalSkills
              ?.overallrecommendations ?? []
          ).forEach((rec: string) => {
            const recLines = pdf.splitTextToSize(
              sanitizePdfText(`• ${rec}`),
              170
            ) as string[];
            pdf.text(recLines, 25, yPos);
            yPos += recLines.length * 4 + 2;
          });
          yPos += 10;
        }
      }
      // Soft Skills Assessment
      if (!hasRubrics && report.communicationAssessment?.softSkills) {
        if (yPos > 240) {
          pdf.addPage();
          yPos = 20;
        }
        pdf.setFontSize(FONT_SIZE_SECTION);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Soft Skills overview:', 20, yPos);
        pdf.setFont('helvetica', 'normal');
        yPos += 8;

        // Overall strengths, weaknesses, recommendations for soft skills
        if (
          (report.communicationAssessment.softSkills.overallstrengths?.length ??
            0) > 0
        ) {
          pdf.setFontSize(FONT_SIZE_SUBHEADER);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(0, 128, 0);
          pdf.text('Strengths:', 20, yPos);
          yPos += 6;
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(FONT_SIZE_BODY);
          pdf.setFont('helvetica', 'normal');
          (
            report.communicationAssessment?.softSkills?.overallstrengths ?? []
          ).forEach((strength) => {
            const strengthText =
              typeof strength === 'string'
                ? strength
                : `${strength.point || ''}${strength.example ? `: "${strength.example}"` : ''}`;
            const strengthLines = pdf.splitTextToSize(
              sanitizePdfText(`• ${strengthText}`),
              170
            ) as string[];
            pdf.text(strengthLines, 25, yPos);
            yPos += strengthLines.length * 4 + 2;
          });
          yPos += 5;
        }

        if (
          (report.communicationAssessment?.softSkills?.overallweaknesses
            ?.length ?? 0) > 0
        ) {
          pdf.setFontSize(FONT_SIZE_SUBHEADER);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(200, 0, 0);
          pdf.text('Weaknesses:', 20, yPos);
          yPos += 6;
          pdf.setTextColor(0, 0, 0);
          pdf.setFontSize(FONT_SIZE_BODY);
          pdf.setFont('helvetica', 'normal');
          (
            report.communicationAssessment?.softSkills?.overallweaknesses ?? []
          ).forEach((weakness) => {
            const weaknessText =
              typeof weakness === 'string'
                ? weakness
                : `${weakness.point || ''}${weakness.example ? `: "${weakness.example}"` : ''}`;
            const weaknessLines = pdf.splitTextToSize(
              sanitizePdfText(`• ${weaknessText}`),
              170
            ) as string[];
            pdf.text(weaknessLines, 25, yPos);
            yPos += weaknessLines.length * 4 + 2;
          });
          yPos += 5;
        }

        const softSkillRecs =
          report?.communicationAssessment?.softSkills?.overallrecommendations;

        if (Array.isArray(softSkillRecs) && softSkillRecs.length > 0) {
          // Ensure space for section
          if (yPos > 230) {
            pdf.addPage();
            yPos = 20;
          }

          pdf.setFontSize(FONT_SIZE_SUBHEADER);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(0, 100, 200);
          pdf.text('Recommendations:', 20, yPos);
          yPos += 6;

          pdf.setFontSize(FONT_SIZE_BODY);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(0, 0, 0);

          softSkillRecs.forEach((rec: string) => {
            const lines = pdf.splitTextToSize(
              sanitizePdfText(`• ${rec}`),
              170
            ) as string[];
            const height = lines.length * 4 + 2;

            if (yPos + height > 270) {
              pdf.addPage();
              yPos = 20;
            }

            pdf.text(lines, 25, yPos);
            yPos += height;
          });

          yPos += 10;
        }
      }

      // Overall Strengths (from communication assessment)
      if (
        !hasRubrics &&
        (report.communicationAssessment?.overall?.strengths?.length ?? 0) > 0
      ) {
        if (yPos > 250) {
          pdf.addPage();
          yPos = 20;
        }
        pdf.setFontSize(FONT_SIZE_SECTION);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0, 128, 0);
        pdf.text('Overall Strengths:', 20, yPos);
        yPos += 8;
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(FONT_SIZE_BODY);
        pdf.setFont('helvetica', 'normal');
        (report.communicationAssessment?.overall?.strengths ?? []).forEach(
          (strength: StrengthOrWeakness) => {
            const point =
              typeof strength === 'string' ? strength : (strength?.point ?? '');
            const strengthLines = pdf.splitTextToSize(
              sanitizePdfText(`• ${point}`),
              170
            ) as string[];
            pdf.text(strengthLines, 25, yPos);
            yPos += strengthLines.length * 4 + 2;
          }
        );
        yPos += 10;
      }

      // Overall Weaknesses (from communication assessment)
      if (
        !hasRubrics &&
        (report.communicationAssessment?.overall?.weaknesses?.length ?? 0) > 0
      ) {
        if (yPos > 250) {
          pdf.addPage();
          yPos = 20;
        }
        pdf.setFontSize(FONT_SIZE_SECTION);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(200, 0, 0);
        pdf.text('Overall Weaknesses:', 20, yPos);
        yPos += 8;
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(FONT_SIZE_BODY);
        pdf.setFont('helvetica', 'normal');
        (report.communicationAssessment?.overall?.weaknesses ?? []).forEach(
          (weakness: StrengthOrWeakness) => {
            const point =
              typeof weakness === 'string' ? weakness : (weakness?.point ?? '');
            const weaknessLines = pdf.splitTextToSize(
              sanitizePdfText(`• ${point}`),
              170
            ) as string[];
            pdf.text(weaknessLines, 25, yPos);
            yPos += weaknessLines.length * 4 + 2;
          }
        );
        yPos += 10;
      }

      // Overall Recommendations (from communication assessment)
      if (
        !hasRubrics &&
        (report.communicationAssessment?.overall?.recommendations?.length ??
          0) > 0
      ) {
        if (yPos > 250) {
          pdf.addPage();
          yPos = 20;
        }
        pdf.setFontSize(FONT_SIZE_SECTION);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(0, 100, 200);
        pdf.text('Overall Areas for Improvement:', 20, yPos);
        yPos += 8;
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(FONT_SIZE_BODY);
        pdf.setFont('helvetica', 'normal');
        (
          report.communicationAssessment?.overall?.recommendations ?? []
        ).forEach((rec: string) => {
          const recLines = pdf.splitTextToSize(
            sanitizePdfText(`• ${rec}`),
            170
          ) as string[];
          pdf.text(recLines, 25, yPos);
          yPos += recLines.length * 4 + 2;
        });
        yPos += 10;
      }

      // Key Strengths (from report data)
      if ((reportData.strengths?.length ?? 0) > 0) {
        if (yPos > 250) {
          pdf.addPage();
          yPos = 20;
        }
        pdf.setFontSize(FONT_SIZE_SECTION);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Key Strengths:', 20, yPos);
        yPos += 8;
        pdf.setFontSize(FONT_SIZE_BODY);
        pdf.setFont('helvetica', 'normal');
        (reportData.strengths ?? []).forEach((strength: StrengthOrWeakness) => {
          const point =
            typeof strength === 'string' ? strength : (strength?.point ?? '');
          const strengthLines = pdf.splitTextToSize(
            sanitizePdfText(`• ${point}`),
            170
          ) as string[];
          pdf.text(strengthLines, 25, yPos);
          yPos += strengthLines.length * 4 + 2;
        });
        yPos += 10;
      }

      // Areas for Improvement (from report data)
      if ((reportData.improvements?.length ?? 0) > 0) {
        if (yPos > 250) {
          pdf.addPage();
          yPos = 20;
        }
        pdf.setFontSize(FONT_SIZE_SECTION);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Areas for Improvement:', 20, yPos);
        yPos += 8;
        pdf.setFontSize(FONT_SIZE_BODY);
        pdf.setFont('helvetica', 'normal');
        (reportData.improvements ?? []).forEach(
          (improvement: StrengthOrWeakness) => {
            const point =
              typeof improvement === 'string'
                ? improvement
                : (improvement?.point ?? '');
            const improvementLines = pdf.splitTextToSize(
              sanitizePdfText(`• ${point}`),
              170
            ) as string[];
            pdf.text(improvementLines, 25, yPos);
            yPos += improvementLines.length * 4 + 2;
          }
        );
        yPos += 10;
      }

      // Debrief Reflection (shown at the bottom — matches report page layout)
      if (report?.debriefReflection) {
        if (yPos > 240) {
          pdf.addPage();
          yPos = 20;
        }
        pdf.setFontSize(FONT_SIZE_SECTION);
        pdf.setFont('helvetica', 'bold');
        pdf.text(sanitizePdfText(`${rL.debriefReflection}:`), 20, yPos);
        yPos += 8;
        pdf.setFontSize(FONT_SIZE_BODY);
        pdf.setFont('helvetica', 'italic');
        const debriefLines = pdf.splitTextToSize(
          sanitizePdfText(`"${report.debriefReflection}"`),
          170
        ) as string[];
        pdf.text(debriefLines, 20, yPos);
        pdf.setFont('helvetica', 'normal');
        yPos += debriefLines.length * 5 + 15;
      }

      const filePrefix =
        report?.mode === 'Practice' ? 'practice-report' : 'assessment-report';
      pdf.save(`${filePrefix}-${reportId}.pdf`);
      setIsGeneratingPDF(false);
    } catch {
      setIsGeneratingPDF(false);
      alert('An error occurred while generating the PDF. Please try again.');
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleEmailReport = async () => {
    if (!report) {
      return;
    }

    if (onEmailReport) {
      onEmailReport();
      return;
    }

    try {
      setIsEmailing(true);
      alert('Email is not configured for this view.');
    } catch {
      alert('Unable to send the email right now. Please try again.');
    } finally {
      setIsEmailing(false);
    }
  };

  // Get summary categories from report
  const summaryCategories = report?.summaryByCategory || {};
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _categoryEntries = Object.entries(summaryCategories).filter(
    ([category]) => category !== 'demographics'
  );

  return (
    <div className="min-h-screen bg-[#f5f6f8] pb-6 sm:pb-10">
      {/* Sticky Top Action Bar Container */}
      <div className="pdf-hide sticky top-0 z-40 bg-[#f5f6f8]/95 backdrop-blur-md border-b border-gray-200/80 shadow-2xs py-3.5 mb-6 transition-all">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 border border-gray-200/90 shadow-[0_2px_8px_rgba(15,23,42,0.04)] hover:bg-gray-50 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600" />
            {rL.backToReports || 'Back to Reports'}
          </button>

          <div className="flex flex-wrap items-center gap-3">
            {/* Custom Jump To Dropdown Pill */}
            <div className="relative" ref={jumpRef}>
              <button
                type="button"
                onClick={() => {
                  refreshJumpSections();
                  setIsJumpOpen((prev) => !prev);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-white border border-gray-200/90 px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-[0_2px_8px_rgba(15,23,42,0.04)] hover:bg-gray-50 hover:text-gray-900 transition-all cursor-pointer select-none"
              >
                <List className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <span>{rL.rubric?.jumpTo || 'Jump To'}</span>
                <ChevronDown
                  className={cn(
                    'w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0',
                    isJumpOpen && 'rotate-180'
                  )}
                />
              </button>

              {isJumpOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] rounded-2xl bg-white border border-gray-200/90 shadow-[0_12px_32px_rgba(15,23,42,0.12),0_4px_12px_rgba(15,23,42,0.06)] py-2 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 mb-1">
                    {rL.rubric?.jumpTo || 'Jump To Section'}
                  </div>
                  <div className="max-h-[70vh] overflow-y-auto py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {jumpSections.map((sec) => (
                      <button
                        key={sec.id}
                        type="button"
                        title={sec.title}
                        onClick={() => {
                          setIsJumpOpen(false);
                          const el = document.getElementById(sec.id);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth' });
                          }
                        }}
                        className="w-full text-left px-4 py-2.5 text-xs sm:text-sm font-medium text-gray-700 hover:text-[#db8833] hover:bg-[#F3F4F6] transition-all flex items-center justify-between group cursor-pointer"
                      >
                        <span className="line-clamp-1 pr-2" title={sec.title}>
                          {sec.title}
                        </span>
                        <ArrowRight className="w-4 h-4 text-[#db8833] opacity-0 group-hover:opacity-100 transition-all duration-150 flex-shrink-0 ml-2 group-hover:translate-x-0.5" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* View Transcript Pill */}
            <button
              onClick={() => onViewTranscript?.(reportId)}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 border border-gray-200/90 shadow-[0_2px_8px_rgba(15,23,42,0.04)] hover:bg-gray-50 transition-all cursor-pointer"
            >
              <FileText className="w-4 h-4 text-gray-600" />
              <span>{rL.viewTranscript || 'VIEW TRANSCRIPT'}</span>
            </button>

            {/* PDF Download Pill */}
            <button
              onClick={handleDownloadPDF}
              disabled={isGeneratingPDF}
              className="pdf-hide inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 border border-gray-200/90 shadow-[0_2px_8px_rgba(15,23,42,0.04)] hover:bg-gray-50 transition-all cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4 text-gray-600" />
              <span>
                {isGeneratingPDF
                  ? rL.rubric?.generating || 'Generating...'
                  : rL.rubric?.pdf || 'PDF'}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div id="report-printable" className="max-w-5xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-transparent p-0"
        >
          {/* Header Card */}
          <div
            data-pdf-card
            className="bg-white rounded-[16px] border border-gray-200 px-6 sm:px-10 pt-6 pb-5 mb-6 text-center shadow-[0_2px_10px_rgba(15,23,42,0.04)]"
          >
            <h1 className="text-xl sm:text-[22px] font-bold text-[#db8833] mb-5 tracking-tight">
              {report?.mode === 'Practice'
                ? rL.practiceReport
                : rL.assessmentReport}
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
              <div className="bg-[#f3f4f6] rounded-xl px-4 py-4 flex flex-col items-center text-center">
                <h3 className="font-bold uppercase tracking-[0.08em] text-[11px] text-[#5f6060] mb-1.5">
                  {rL.simulationStarted}
                </h3>
                <p className="text-[#111827] font-bold text-sm">
                  {getSimulationDateTime() || rL.loading}
                </p>
              </div>
              <div className="bg-[#f3f4f6] rounded-xl px-4 py-4 flex flex-col items-center text-center">
                <h3 className="font-bold uppercase tracking-[0.08em] text-[11px] text-[#5f6060] mb-1.5">
                  {rL.simulationSubmitted}
                </h3>
                <p className="text-[#111827] font-bold text-sm">
                  {getSimulationSubmittedTime() || rL.loading}
                </p>
              </div>
              <div className="bg-[#f3f4f6] rounded-xl px-4 py-4 flex flex-col items-center text-center">
                <h3 className="font-bold uppercase tracking-[0.08em] text-[11px] text-[#5f6060] mb-1.5">
                  {rL.reportGenerated}
                </h3>
                <p className="text-[#111827] font-bold text-sm">
                  {getSimulationReportGeneratedTime() || rL.loading}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-1 text-xs sm:text-sm mt-1">
              {/* Student Code */}
              <div className="flex items-center gap-1">
                <span className="text-[#db8833] font-medium">
                  {rL.studentCode}
                </span>
                <span className="text-[#5f6060] font-semibold">
                  {report?.userId ?? 'N/A'}
                </span>
              </div>
              {/* Class */}
              {displayClassName && (
                <>
                  <span className="text-gray-300">•</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[#db8833] font-medium">
                      {rL.class}
                    </span>
                    <span className="text-[#5f6060] font-semibold">
                      {displayClassName}
                    </span>
                  </div>
                </>
              )}
              {/* Scenario */}
              <div className="flex items-center gap-1">
                <span className="text-gray-300 mx-1">•</span>
                <span className="text-[#db8833] font-medium">{rL.sim}</span>
                <span className="text-[#5f6060] font-semibold">
                  {report?.scenarioTitle ||
                    report?.scenarioId?.replace(/-/g, ' ') ||
                    'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Overall Performance Score - Assessment Mode only */}
          {report?.mode !== 'Practice' && (
            <div
              id="sec-score"
              data-jump-section
              data-jump-title={
                rL.overallPerformanceScore || 'Overall Performance Score'
              }
              data-pdf-card
              data-pdf-scorecard
              className="scroll-mt-16 sm:scroll-mt-20 rounded-[20px] pt-7 pb-6 px-6 sm:px-10 mb-6 text-center flex flex-col items-center shadow-[0_4px_16px_rgba(237,98,31,0.2)] bg-[linear-gradient(279.14deg,#F28B20,#ED621F)]"
            >
              <div
                data-pdf-scorelabel
                className="text-[12px] uppercase tracking-[0.16em] font-bold text-white mb-4"
              >
                {rL.overallPerformanceScore}
              </div>

              {(() => {
                const finalScore = typeof score === 'number' ? score : 0;

                return (
                  <>
                    <div className="bg-white rounded-2xl px-8 py-3.5 inline-flex items-center justify-center gap-3.5 shadow-md mb-3 min-w-[220px] sm:min-w-[280px]">
                      {finalScore >= 95 ? (
                        <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-[#d4af37] fill-[#d4af37] flex-shrink-0" />
                      ) : finalScore >= 86 ? (
                        <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-[#9ca3af] fill-[#9ca3af] flex-shrink-0" />
                      ) : finalScore >= 80 ? (
                        <Trophy className="w-8 h-8 sm:w-10 sm:h-10 text-[#cd7f32] fill-[#cd7f32] flex-shrink-0" />
                      ) : null}
                      <span className="text-4xl sm:text-5xl font-extrabold text-[#db8833] tracking-tight leading-none">
                        {finalScore}
                      </span>
                    </div>

                    <div
                      data-pdf-scorelabel
                      className="text-white font-medium text-xs sm:text-sm"
                    >
                      {rL.rubric?.outOf100 || 'out of 100'}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 gap-8">
            {/* Left Column - Summary & Feedback */}
            <div className="lg:col-span-2 space-y-8">
              {/* Executive Summary */}
              {(() => {
                const execScore: number = typeof score === 'number' ? score : 0;

                const getScoreBandInfo = (val: number) => {
                  if (val > 90) {
                    return {
                      label: rL.rubric?.exceptional || 'EXCEPTIONAL',
                      tier: 'exceptional',
                    };
                  }
                  if (val >= 75) {
                    return {
                      label:
                        rL.rubric?.meetsExpectations || 'MEETS EXPECTATIONS',
                      tier: 'meets',
                    };
                  }
                  return {
                    label: rL.rubric?.needsImprovement || 'NEEDS IMPROVEMENT',
                    tier: 'needs_improvement',
                  };
                };

                const band = getScoreBandInfo(execScore);
                const isPractice = report?.mode === 'Practice';
                const displayText = isPractice
                  ? band.label.toUpperCase()
                  : `${band.label.toUpperCase()} (${Math.round(execScore)}%)`;

                return (
                  <div
                    id="exec-summary"
                    data-pdf-card
                    data-jump-section
                    data-jump-title={rL.executiveSummary || 'Executive Summary'}
                    className="scroll-mt-16 sm:scroll-mt-20 bg-white rounded-[16px] border border-gray-200 p-6 shadow-[0_2px_10px_rgba(15,23,42,0.04)]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <div>
                        <h2 className="text-base sm:text-lg font-bold text-[#db8833] leading-tight">
                          {rL.executiveSummary}
                        </h2>
                        <p className="text-[#5f6060] text-xs mt-0.5">
                          {rL.executiveSummarySubtitle}
                        </p>
                      </div>

                      <div className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold uppercase tracking-wider">
                        {band.tier === 'exceptional' && (
                          <Trophy className="w-4 h-4 text-amber-500 fill-amber-400 flex-shrink-0" />
                        )}
                        {band.tier === 'meets' && (
                          <Trophy className="w-4 h-4 text-slate-400 fill-slate-300 flex-shrink-0" />
                        )}
                        <span
                          className={
                            band.tier === 'exceptional'
                              ? 'text-[#1d4ed8] font-bold'
                              : band.tier === 'meets'
                                ? 'text-emerald-700 font-bold'
                                : 'text-red-700 font-bold'
                          }
                        >
                          {displayText}
                        </span>
                      </div>
                    </div>
                    <div className="pl-4 border-l-[3px] border-[#db8833]">
                      <p className="text-[#374151] leading-relaxed text-sm">
                        {reportData.summary}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Communication Assessment */}
              {report.communicationAssessment && (
                <div id="sec-rubrics" className="scroll-mt-16 sm:scroll-mt-20">
                  <div
                    data-pdf-card
                    className="bg-white rounded-2xl border border-gray-200/90 p-4 sm:p-6 shadow-[0_4px_14px_rgba(15,23,42,0.04)]"
                  >
                    {hasRubrics ? (
                      <RubricsSection
                        mode={report?.mode}
                        rubrics={
                          rubrics as unknown as ComponentProps<
                            typeof RubricsSection
                          >['rubrics']
                        }
                        userRole={undefined}
                        mandatoryActions={
                          report.mandatoryActions as ActionDetail[] | undefined
                        }
                        optionalActions={
                          report.optionalActions as ActionDetail[] | undefined
                        }
                        medicationGradingResults={medicationGradingResults}
                        mandatoryMedicationTitles={mandatoryMedicationTitles}
                        sbarStatus={sbarStatus}
                        scenarioRubricConfig={scenarioRubricConfig}
                        tcTypeRequirement={tcTypeRequirement}
                        labels={rubricLabels}
                        language={language as 'en' | 'es'}
                        onFlatScoreComputed={() => {
                          // Keep score in Educator App identical to Student App (derived directly from report.score)
                        }}
                      />
                    ) : (
                      <CommunicationSection
                        communicationAssessment={report.communicationAssessment}
                        expandedSummaries={expandedSummaries}
                        toggleSummary={toggleSummary}
                        softSkills={
                          softSkills as unknown as ComponentProps<
                            typeof CommunicationSection
                          >['softSkills']
                        }
                        technicalSkills={
                          technicalSkills as unknown as ComponentProps<
                            typeof CommunicationSection
                          >['technicalSkills']
                        }
                        sbarStatus={sbarStatus}
                        tcTypeRequirement={tcTypeRequirement}
                        labels={commLabels}
                      />
                    )}
                  </div>
                </div>
              )}

              {!hasRubrics && (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {report.communicationAssessment?.softSkills && (
                      <OverallSkillAssessment
                        title="Soft Skills Overview"
                        icon={<Target className="w-5 h-5 text-emerald-600" />}
                        strengths={
                          report.communicationAssessment?.softSkills
                            .overallstrengths as unknown as ComponentProps<
                            typeof OverallSkillAssessment
                          >['strengths']
                        }
                        weaknesses={
                          report.communicationAssessment?.softSkills
                            .overallweaknesses as unknown as ComponentProps<
                            typeof OverallSkillAssessment
                          >['weaknesses']
                        }
                        recommendations={
                          report.communicationAssessment?.softSkills
                            .overallrecommendations
                        }
                      />
                    )}
                    {report.communicationAssessment?.technicalSkills && (
                      <OverallSkillAssessment
                        title="Technical Skills Overview"
                        icon={<Zap className="w-5 h-5 text-blue-600" />}
                        strengths={
                          report.communicationAssessment?.technicalSkills
                            .overallstrengths as unknown as ComponentProps<
                            typeof OverallSkillAssessment
                          >['strengths']
                        }
                        weaknesses={
                          report.communicationAssessment?.technicalSkills
                            .overallweaknesses as unknown as ComponentProps<
                            typeof OverallSkillAssessment
                          >['weaknesses']
                        }
                        recommendations={
                          report.communicationAssessment?.technicalSkills
                            .overallrecommendations
                        }
                      />
                    )}
                  </div>
                  {(report.communicationAssessment?.overall?.strengths
                    ?.length ?? 0) > 0 && (
                    <div className="bg-white rounded-2xl border border-emerald-200 p-6 shadow-[0_4px_14px_rgba(16,185,129,0.08)]">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                          <CheckCircle className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <h2 className="text-xl font-semibold text-gray-900">
                            Strengths
                          </h2>
                          <p className="text-gray-500 text-sm">
                            Areas of strong performance
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {report.communicationAssessment?.overall?.strengths?.map(
                          (strength: StrengthOrWeakness, index: number) => (
                            <div
                              key={index}
                              data-pdf-nobreak
                              className="flex items-start gap-3 p-4 bg-emerald-50/50 rounded-lg border border-emerald-100"
                            >
                              <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center mt-0.5">
                                <CheckCircle className="w-4 h-4 text-white" />
                              </div>
                              <span className="text-gray-700 font-medium">
                                {swPoint(strength)}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                  {(report.communicationAssessment?.overall?.weaknesses
                    ?.length ?? 0) > 0 && (
                    <div className="bg-white rounded-2xl border border-red-200 p-6 shadow-[0_4px_14px_rgba(239,68,68,0.08)]">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                          <AlertCircle className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                          <h2 className="text-xl font-semibold text-gray-900">
                            Weaknesses
                          </h2>
                          <p className="text-gray-500 text-sm">
                            Areas needing attention
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {report.communicationAssessment?.overall?.weaknesses?.map(
                          (weakness: StrengthOrWeakness, index: number) => (
                            <div
                              key={index}
                              data-pdf-nobreak
                              className="flex items-start gap-3 p-4 bg-red-50/50 rounded-lg border border-red-100"
                            >
                              <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center mt-0.5">
                                <span className="text-white text-xs font-bold">
                                  !
                                </span>
                              </div>
                              <span className="text-gray-700 font-medium">
                                {swPoint(weakness)}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                  {(report.communicationAssessment?.overall?.recommendations
                    ?.length ?? 0) > 0 && (
                    <div className="bg-white rounded-2xl border border-amber-200 p-6 shadow-[0_4px_14px_rgba(245,158,11,0.1)]">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                          <AlertCircle className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                          <h2 className="text-xl font-semibold text-gray-900">
                            {rL.areasForImprovement}
                          </h2>
                          <p className="text-gray-500 text-sm">
                            Actionable recommendations
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {report.communicationAssessment?.overall?.recommendations?.map(
                          (recommendation: string, index: number) => (
                            <div
                              key={index}
                              data-pdf-nobreak
                              className="flex items-start gap-3 p-4 bg-amber-50/50 rounded-lg border border-amber-100"
                            >
                              <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center mt-0.5">
                                <span className="text-white text-xs font-bold">
                                  !
                                </span>
                              </div>
                              <span className="text-gray-700 font-medium">
                                {recommendation}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Debrief Reflection */}
              {report.debriefReflection && (
                <div
                  id="debrief-reflection"
                  data-jump-section
                  data-jump-title={rL.debriefReflection || 'Debrief Reflection'}
                  data-pdf-card
                  className="scroll-mt-16 sm:scroll-mt-20 bg-white rounded-2xl border border-gray-200 p-6 shadow-[0_4px_14px_rgba(15,23,42,0.04)]"
                >
                  <div className="mb-4">
                    <h2 className="text-xl font-bold text-[#db8833]">
                      {rL.debriefReflection}
                    </h2>
                    <p className="text-[#5f6060] text-sm mt-0.5">
                      {rL.debriefSubtitle}
                    </p>
                  </div>
                  <div className="bg-[#f8fafc] rounded-xl p-5 border border-gray-100/90">
                    <p className="text-[#374151] leading-relaxed text-sm sm:text-[15px] break-words">
                      {report.debriefReflection}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Strengths & Improvements */}
            <div
              id="sec-insights"
              className="scroll-mt-16 sm:scroll-mt-20 space-y-8"
            >
              {/* Strengths Card */}
              {(reportData?.strengths?.length ?? 0) > 0 && (
                <div
                  data-pdf-card
                  className="bg-white rounded-2xl border border-emerald-200 p-6 shadow-[0_4px_14px_rgba(16,185,129,0.08)]"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">
                        {rL.keyStrengths}
                      </h2>
                      <p className="text-gray-500 text-sm">
                        {rL.keyStrengthsSubtitle}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {reportData.strengths.map(
                      (strength: StrengthOrWeakness, index: number) => (
                        <div
                          key={index}
                          data-pdf-nobreak
                          className="flex items-start gap-3 p-4 bg-emerald-50/50 rounded-lg border border-emerald-100 hover:border-emerald-200 transition-colors"
                        >
                          <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <svg
                              className="w-3 h-3 text-white"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                          <span className="text-gray-700 font-medium">
                            {swPoint(strength)}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Areas for Improvement Card */}
              {(reportData?.improvements?.length ?? 0) > 0 && (
                <div
                  data-pdf-card
                  className="bg-white rounded-2xl border border-amber-200 p-6 shadow-[0_4px_14px_rgba(245,158,11,0.1)]"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">
                        {rL.areasForImprovement}
                      </h2>
                      <p className="text-gray-500 text-sm">
                        {rL.areasForImprovementSubtitle}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {reportData?.improvements?.map(
                      (improvement: StrengthOrWeakness, index: number) => (
                        <div
                          key={index}
                          data-pdf-nobreak
                          className="flex items-start gap-3 p-4 bg-amber-50/50 rounded-lg border border-amber-100 hover:border-amber-200 transition-colors"
                        >
                          <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-white text-xs font-bold">
                              !
                            </span>
                          </div>
                          <span className="text-gray-700 font-medium">
                            {swPoint(improvement)}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Category Breakdown — collapsible summary of `report.summaryByCategory`.
              Wires up the local category-toggle state and helpers so callers can
              drill into each category's raw summary items without leaving the
              report page. Only renders when the report actually carries
              per-category data (otherwise the block is a no-op). */}

          {/* Footer */}
          <footer className="pdf-hide mt-8 bg-white rounded-[16px] border border-gray-200 px-5 sm:px-8 py-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
            <div className="flex flex-row items-center justify-between gap-4">
              <div className="text-sm font-medium text-gray-600">
                {rL.rubric?.reportId || 'Report ID:'}{' '}
                <strong className="text-gray-900 font-semibold">
                  {reportId}
                </strong>
              </div>
              <button
                type="button"
                onClick={() => {
                  try {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  } catch {
                    /* ignore */
                  }
                  try {
                    if (document.documentElement)
                      document.documentElement.scrollTo({
                        top: 0,
                        behavior: 'smooth',
                      });
                    if (document.body)
                      document.body.scrollTo({ top: 0, behavior: 'smooth' });
                  } catch {
                    /* ignore */
                  }
                  const anchor =
                    document.getElementById('report-top-anchor') ||
                    document.getElementById('report-printable');
                  if (anchor) {
                    try {
                      anchor.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                      });
                    } catch {
                      /* ignore */
                    }
                  }
                  try {
                    const elements = Array.from(document.querySelectorAll('*'));
                    for (const el of elements) {
                      if (el.scrollTop > 0) {
                        el.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }
                  } catch {
                    /* ignore */
                  }
                }}
                className="inline-flex items-center gap-2 rounded-full bg-white border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-900 shadow-2xs transition-all cursor-pointer select-none"
              >
                <span className="text-sm leading-none">↑</span>
                <span>{rL.rubric?.backToTop || 'Back to top'}</span>
              </button>
            </div>
          </footer>
        </motion.div>
      </div>
    </div>
  );
}
type StrengthWeakness = {
  point: string;
  example?: string;
};

interface OverallSkillAssessmentProps {
  title: string;
  icon: React.ReactNode;
  strengths?: StrengthWeakness[];
  weaknesses?: StrengthWeakness[];
  recommendations?: string[];
}

function OverallSkillAssessment({
  title,
  icon,
  strengths = [],
  weaknesses = [],
  recommendations = [],
}: OverallSkillAssessmentProps) {
  return (
    <div className="space-y-6">
      {/* Title */}
      <h3 className="font-semibold text-lg text-gray-900 flex items-center gap-2">
        {icon}
        {title}
      </h3>

      {/* Strengths */}
      {strengths.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-emerald-700 text-sm uppercase tracking-wider">
            Strengths
          </h4>
          {strengths.map((item, index) => (
            <div
              key={index}
              data-pdf-nobreak
              className="bg-emerald-50 rounded-lg p-4 border border-emerald-200"
            >
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg
                    className="w-3 h-3 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">{item.point}</p>
                  {item.example && (
                    <p className="text-sm text-gray-600 italic mt-1">
                      &quot;{item.example}&quot;
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Weaknesses */}
      {weaknesses.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium text-amber-700 text-sm uppercase tracking-wider">
            WEAKNESSES
          </h4>
          {weaknesses.map((item, index) => (
            <div
              key={index}
              data-pdf-nobreak
              className="bg-amber-50 rounded-lg p-4 border border-amber-200"
            >
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-bold">!</span>
                </div>
                <div>
                  <p className="font-medium text-gray-900">{item.point}</p>
                  {item.example && (
                    <p className="text-sm text-gray-600 italic mt-1">
                      &quot;{item.example}&quot;
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div
          data-pdf-nobreak
          className="bg-[#E3F2FD] rounded-lg p-6 border border-[#BBDEFB]"
        >
          <h4 className="font-semibold text-gray-900 mb-3">
            Improvement Recommendations
          </h4>
          <ul className="space-y-2">
            {recommendations.map((rec, index) => (
              <li key={index} className="flex items-start gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                <span className="text-gray-700">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
