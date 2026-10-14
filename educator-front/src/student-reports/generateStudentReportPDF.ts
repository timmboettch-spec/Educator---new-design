import jsPDF from 'jspdf';
import { sanitizePdfText } from '../utils/sanitizePdf';
import { translateSequencingPhrase } from './translateSequencingPhrase';

type StrengthOrWeakness = string | { point?: string; example?: string };

interface StrengthOrWeaknessObj {
  point?: string;
  example?: string;
}

interface ActionDetail {
  type?: string;
  title?: string;
  isOptional?: boolean;
  isCorrect?: boolean;
  attemptsCount?: number;
}

interface RubricLikeItem {
  id?: string;
  aiCheckId?: string;
  name?: string;
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

interface CommunicationAssessment {
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
    strengths?: string[];
    weaknesses?: string[];
    recommendations?: string[];
  };
  [key: string]: unknown;
}

export interface ReportDataForPDF {
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
  score?: number;
  summary?: string;
  mode?: 'Practice' | 'Assessment' | string;
  debriefReflection?: string;
  strengths?: StrengthOrWeakness[];
  improvements?: StrengthOrWeakness[];
  feedback?: unknown;
  summaryByCategory?: Record<string, unknown>;
  communicationAssessment?: CommunicationAssessment;
  mandatoryActions?: unknown[];
  optionalActions?: unknown[];
  [key: string]: unknown;
}

export interface GeneratePDFOptions {
  reportId: string;
  displayClassName?: string;
  returnDoc?: boolean;
  filename?: string;
  language?: 'en' | 'es';
}

const swPoint = (s: StrengthOrWeakness): string =>
  typeof s === 'string' ? s : (s?.point ?? '');

const swExample = (s: StrengthOrWeakness): string | undefined =>
  typeof s === 'string' ? undefined : (s as StrengthOrWeaknessObj)?.example;

function fmtDateTime(value: unknown, locale = 'en-US'): string {
  if (!value) return '';
  try {
    const d = new Date(value as string | number | Date);
    if (!isNaN(d.getTime())) {
      const month = d.toLocaleString(locale, { month: 'long' });
      return `${month} ${d.getDate()}, ${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
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
      const months = locale === 'es-ES' ? monthsEs : monthsEn;
      const monthName = months[parseInt(match[1], 10) - 1] || match[1];
      return `${monthName} ${match[2]}, ${match[3]} ${match[4]}`;
    }
    return str;
  } catch {
    return String(value);
  }
}

function fmtSimulationTime(
  realTimestamp: string,
  report: ReportDataForPDF,
  locale = 'en-US'
): string {
  try {
    const configuredStartRaw = report.scenario?.simulationStartTime;
    if (!configuredStartRaw || !report.scenarioStartTime)
      return fmtDateTime(realTimestamp, locale);
    const configuredStart = new Date(configuredStartRaw);
    const realStart = new Date(report.scenarioStartTime);
    const realTime = new Date(realTimestamp);
    const elapsedMs = realTime.getTime() - realStart.getTime();
    const simTime = new Date(configuredStart.getTime() + elapsedMs);
    const month = simTime.toLocaleString(locale, { month: 'long' });
    return `${month} ${simTime.getDate()}, ${simTime.getFullYear()} ${String(simTime.getHours()).padStart(2, '0')}:${String(simTime.getMinutes()).padStart(2, '0')}`;
  } catch {
    return fmtDateTime(realTimestamp, locale);
  }
}

function computeSbarStatus(report: ReportDataForPDF): string | null {
  const actions = report.summaryByCategory?.actions as
    Array<{ title?: string; details?: string }> | undefined;
  if (!Array.isArray(actions)) return null;
  const sbarEntries = actions.filter(
    (a) => a.title === 'Team Communication' && a.details?.includes('Result:')
  );
  if (sbarEntries.length === 0) return null;
  const statuses = sbarEntries
    .map((e) => {
      const m = e.details?.match(/Result:\s*(\w+)/i);
      return m ? String(m[1]) : null;
    })
    .filter(Boolean);
  if (statuses.some((s) => s?.toLowerCase() === 'satisfactory'))
    return 'Satisfactory';
  const last = statuses[statuses.length - 1] ?? null;
  if (last?.toLowerCase() === 'not' || last?.toLowerCase() === 'not attempted')
    return null;
  const lastRaw = sbarEntries[sbarEntries.length - 1]?.details ?? '';
  const fullMatch = lastRaw.match(
    /Result:\s*(Not Attempted|Satisfactory|Unsatisfactory)/i
  );
  if (fullMatch && fullMatch[1].toLowerCase() === 'not attempted') return null;
  return last;
}

interface MedGradingResult {
  medicationId?: string;
  medicationName: string;
  orderTitle?: string;
  overallScore: number;
  totalExpected: number;
  totalCorrect: number;
  mandatory?: boolean;
  comparisons: Array<{
    field: string;
    expected: unknown;
    actual: unknown;
    isCorrect: boolean;
  }>;
}

function computeMedicationGradingResults(
  report: ReportDataForPDF
): MedGradingResult[] {
  const results: MedGradingResult[] = [];
  const entries = (report.summaryByCategory?.medications ?? []) as Array<{
    administrationDetails?: {
      orderTitle?: string;
      gradingResult?: MedGradingResult;
    };
  }>;
  for (const entry of entries) {
    const gr = entry.administrationDetails?.gradingResult;
    if (gr) {
      results.push({
        ...gr,
        orderTitle:
          entry.administrationDetails?.orderTitle || gr.medicationName,
      });
    }
  }
  return results;
}

export function buildStudentReportPDF(
  report: ReportDataForPDF,
  opts: GeneratePDFOptions
): jsPDF {
  const { reportId, displayClassName, filename } = opts;
  const isEs = (opts.language ?? 'en') === 'es';
  const dateLocale = isEs ? 'es-ES' : 'en-US';

  const L = {
    practiceReport: isEs ? 'Informe de Práctica' : 'Practice Report',
    assessmentReport: isEs ? 'Informe de Evaluación' : 'Assessment Report',
    studentCode: isEs ? 'Código del Estudiante: ' : 'Student Code: ',
    classLabel: isEs ? 'Clase: ' : 'Class: ',
    simulationStarted: isEs ? 'Simulación Iniciada: ' : 'Simulation Started: ',
    simulationSubmitted: isEs
      ? 'Simulación Enviada: '
      : 'Simulation Submitted: ',
    reportGenerated: isEs ? 'Informe Generado: ' : 'Report Generated: ',
    overallScore: isEs
      ? 'Puntuación de Rendimiento General: '
      : 'Overall Performance Score: ',
    executiveSummary: isEs ? 'Resumen Ejecutivo:' : 'Executive Summary:',
    exceptional: isEs ? 'EXCEPCIONAL' : 'EXCEPTIONAL',
    meetsExpectation: isEs ? 'CUMPLE LAS EXPECTATIVAS' : 'MEETS EXPECTATION',
    needsImprovement: isEs ? 'NECESITA MEJORAR' : 'NEEDS IMPROVEMENT',
    weight: isEs ? 'Peso' : 'Weight',
    teamCommunication: isEs ? 'COMUNICACIÓN DEL EQUIPO' : 'TEAM COMMUNICATION',
    satisfactory: isEs ? 'SATISFACTORIO' : 'SATISFACTORY',
    unsatisfactory: isEs ? 'INSATISFACTORIO' : 'UNSATISFACTORY',
    notDone: isEs ? 'NO REALIZADO' : 'NOT DONE',
    strengths: isEs ? 'Fortalezas:' : 'Strengths:',
    weaknesses: isEs
      ? 'Debilidades / Oportunidades:'
      : 'Weaknesses / Opportunities:',
    optionalMedications: isEs
      ? 'Medicamentos Opcionales Completados:'
      : 'Optional Medications Completed:',
    optionalActions: isEs
      ? 'Acciones Opcionales Completadas:'
      : 'Optional Actions Completed:',
    medicationCorrect: isEs
      ? 'Medicamento administrado correctamente'
      : 'Medication performed correctly',
    recommendations: isEs ? 'Recomendaciones:' : 'Recommendations:',
    noItemsIdentified: isEs
      ? 'No se identificaron elementos.'
      : 'No items identified.',
    noItems: isEs ? 'Sin elementos.' : 'No items.',
    strengthsUpper: isEs ? 'FORTALEZAS' : 'STRENGTHS',
    weaknessesUpper: isEs ? 'DEBILIDADES' : 'WEAKNESSES',
    improvementRecs: isEs
      ? 'Recomendaciones de Mejora'
      : 'Improvement Recommendations',
    categoryActions: isEs
      ? 'Acciones e Intervenciones'
      : 'Actions & Interventions',
    categoryMedications: isEs ? 'Medicamentos' : 'Medications',
    categoryPpe: isEs ? 'EPP, Privacidad y Seguridad' : 'PPE, Privacy & Safety',
    categoryDocumentation: isEs
      ? 'Calidad de la Documentación Clínica'
      : 'Clinical Documentation Quality',
    categoryCommunication: isEs ? 'Comunicación' : 'Communication',
    categorySequencing: isEs
      ? 'Secuenciación y Priorización'
      : 'Sequencing & Prioritization',
  };

  // Translate known fixed backend-generated strings when language is Spanish.
  const translateStr = (text: string): string => {
    if (!isEs) return text;
    // "None identified." / "No items identified." — match HS student-app PDF wording.
    if (/^none identified\.?$/i.test(text.trim()))
      return 'No se identificaron elementos.';
    if (/^no items identified\.?$/i.test(text.trim()))
      return 'No se identificaron elementos.';
    // Medication error
    if (text === 'Medication was not administered correctly.')
      return 'El medicamento no se administr\u00f3 correctamente.';
    // "X of Y mandatory medication order(s) were administered correctly."
    const partialMatch = text.match(
      /^(\d+) of (\d+) mandatory medication order\(s\) were administered correctly\.$/i
    );
    if (partialMatch)
      return `${partialMatch[1]} de ${partialMatch[2]} orden(es) de medicamentos obligatorios se administraron correctamente.`;
    // "All mandatory medication orders were administered correctly."
    if (
      /^all mandatory medication orders were administered correctly\.$/i.test(
        text
      )
    )
      return 'Todos los medicamentos obligatorios se administraron correctamente.';
    // "No medication orders were administered."
    if (/^no medication orders were administered\.$/i.test(text))
      return 'No se administraron \u00f3rdenes de medicamentos.';
    // "X mandatory medication order(s) were missed."
    const missedMatch = text.match(
      /^(\d+) mandatory medication order\(s\) were missed\.$/i
    );
    if (missedMatch)
      return `${missedMatch[1]} orden(es) de medicamentos obligatorios no se administraron.`;

    // Rubric summary paragraphs sometimes append these medication phrases at
    // the end of an otherwise-Spanish paragraph (e.g. "…confort del paciente.
    // All mandatory medication orders were administered correctly."). Run the
    // same phrases as substring replacements so the tail is translated too.
    let out = text;
    out = out.replace(
      /All mandatory medication orders were administered correctly\./gi,
      'Todas las \u00f3rdenes de medicamentos obligatorios se administraron correctamente.'
    );
    out = out.replace(
      /(\d+) of (\d+) mandatory medication order\(s\) were administered correctly\./gi,
      '$1 de $2 orden(es) de medicamentos obligatorios se administraron correctamente.'
    );
    out = out.replace(
      /No medication orders were administered\./gi,
      'No se administraron \u00f3rdenes de medicamentos.'
    );
    out = out.replace(
      /(\d+) mandatory medication order\(s\) were missed\./gi,
      '$1 orden(es) de medicamentos obligatorios no se administraron.'
    );
    return out;
  };

  // Sequencing / label translator — handles rubric strength/weakness points,
  // examples, and recommendation strings emitted verbatim in English by the
  // backend (e.g. "Overall Sequencing: Grouped items were performed in
  // appropriate sequence", "Correctly sequenced: (Subgroup A) Patient Name
  // Date of Birth", "Timing requirement met: Date of Birth within 1 min of
  // Patient Name"). Falls through to identity when language is English.
  const translatePoint = (text: string | undefined | null): string => {
    if (!text) return '';
    if (!isEs) return text;
    // Documentation-quality strength/weakness bullet titles arrive verbatim in
    // English from the backend (mirrors DOC_POINT_ES in rubrics-section.tsx).
    const DOC_POINT_ES_PDF: Record<string, string> = {
      'assessment findings documented via action tab observations':
        'Hallazgos de evaluación documentados mediante observaciones de la pestaña de acciones',
      'assessment findings documented':
        'Hallazgos de evaluación documentados mediante observaciones de la pestaña de acciones',
      'interventions documented via action tab observations':
        'Intervenciones documentadas mediante observaciones de la pestaña de acciones',
      'interventions documented':
        'Intervenciones documentadas mediante observaciones de la pestaña de acciones',
      'vital signs documented': 'Signos vitales documentados',
      'medical & health history updated':
        'Historia médica y de salud actualizada',
      'medical and health history updated':
        'Historia médica y de salud actualizada',
      'medical history updated': 'Historia médica y de salud actualizada',
      'medical and health history tab updated':
        'Ficha de historial médico y de salud actualizada',
      'patient emotional response documented':
        'Respuesta emocional del paciente documentada',
      'patient education documented': 'Educación al paciente documentada',
      'actions, assessment & intervention documentation':
        'Documentación de acciones, evaluación e intervención',
      'actions, assessment and intervention documentation':
        'Documentación de acciones, evaluación e intervención',
    };
    const docKey = text.trim().toLowerCase();
    if (DOC_POINT_ES_PDF[docKey]) {
      return DOC_POINT_ES_PDF[docKey];
    }
    // First apply fixed medication/summary phrase swaps (translateStr),
    // then run the sequencing translator so both types of strings get
    // localised.
    const step1 = translateStr(text);
    return translateSequencingPhrase(step1, 'es');
  };

  const FONT_SIZE_TITLE = 18;
  const FONT_SIZE_SECTION = 14;
  const FONT_SIZE_SUBHEADER = 12;
  const FONT_SIZE_BODY = 10;
  const FONT_SIZE_SMALL = 9;

  const pdf = new jsPDF();
  let yPos = 20;

  const sbarStatus = computeSbarStatus(report);
  // TC is "configured" if any Team Communication entry exists in summaryByCategory.actions
  const isTcConfigured = (
    (report.summaryByCategory?.actions as
      Array<{ title?: string }> | undefined) ?? []
  ).some((a) => a.title === 'Team Communication');
  const medicationGradingResults = computeMedicationGradingResults(report);

  const rubrics = report.communicationAssessment?.rubrics;
  const hasRubrics =
    !!rubrics?.items && Object.keys(rubrics.items || {}).length > 0;
  const technicalSkills = report.communicationAssessment?.technicalSkills;
  const softSkills = report.communicationAssessment?.softSkills;

  const executiveSummaryText = rubrics?.overallSummary || report?.summary || '';
  const score = report.score;
  const reportData = {
    score,
    summary: executiveSummaryText,
    strengths: (rubrics?.strengths || []) as StrengthOrWeakness[],
    improvements: (rubrics?.improvements || []) as StrengthOrWeakness[],
    feedback: rubrics?.feedback,
  };

  const getSimulationDateTime = () =>
    report.scenarioStartTime
      ? fmtSimulationTime(report.scenarioStartTime, report, dateLocale)
      : fmtDateTime(report.createdAt, dateLocale);
  const getSimulationSubmittedTime = () =>
    report.scenarioEndTime
      ? fmtSimulationTime(report.scenarioEndTime, report, dateLocale)
      : fmtDateTime(report.createdAt, dateLocale);
  const getSimulationReportGeneratedTime = () =>
    fmtDateTime(report.createdAt, dateLocale);

  const scenarioTitle =
    report.scenarioTitle || report.scenarioId?.replace(/-/g, ' ') || 'N/A';
  const simulationStarted = getSimulationDateTime();
  const simulationSubmitted = getSimulationSubmittedTime();

  pdf.setFontSize(FONT_SIZE_TITLE);
  pdf.setFont('helvetica', 'bold');
  pdf.text(
    report.mode === 'Practice' ? L.practiceReport : L.assessmentReport,
    20,
    yPos
  );
  pdf.setFont('helvetica', 'normal');
  yPos += 15;

  pdf.setFontSize(FONT_SIZE_BODY);
  const studentCodeLines = pdf.splitTextToSize(
    sanitizePdfText(`${L.studentCode}${report.userId || 'N/A'}`),
    170
  ) as string[];
  pdf.text(studentCodeLines, 20, yPos);
  yPos += studentCodeLines.length * 6 + 4;

  const classLines = pdf.splitTextToSize(
    sanitizePdfText(
      `${L.classLabel}${displayClassName || report.studentClass || 'N/A'}`
    ),
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
    sanitizePdfText(`${L.simulationStarted}${simulationStarted || 'N/A'}`),
    170
  ) as string[];
  pdf.text(startedLines, 20, yPos);
  yPos += startedLines.length * 6 + 4;

  const submittedLines = pdf.splitTextToSize(
    sanitizePdfText(`${L.simulationSubmitted}${simulationSubmitted || 'N/A'}`),
    170
  ) as string[];
  pdf.text(submittedLines, 20, yPos);
  yPos += submittedLines.length * 6 + 4;

  const generatedLines = pdf.splitTextToSize(
    sanitizePdfText(
      `${L.reportGenerated}${getSimulationReportGeneratedTime() || 'N/A'}`
    ),
    170
  ) as string[];
  pdf.text(generatedLines, 20, yPos);
  yPos += generatedLines.length * 6 + 10;

  if (report.mode !== 'Practice') {
    pdf.setFontSize(FONT_SIZE_SECTION);
    pdf.setFont('helvetica', 'bold');
    pdf.text(sanitizePdfText(`${L.overallScore}${score || 0}%`), 20, yPos);
    pdf.setFont('helvetica', 'normal');
    yPos += 15;
  }

  pdf.setFontSize(FONT_SIZE_SECTION);
  pdf.setFont('helvetica', 'bold');
  pdf.text(L.executiveSummary, 20, yPos);
  yPos += 8;
  pdf.setFontSize(FONT_SIZE_BODY);
  pdf.setFont('helvetica', 'normal');
  const summaryLines = pdf.splitTextToSize(
    sanitizePdfText(reportData.summary),
    170
  ) as string[];
  pdf.text(summaryLines, 20, yPos);
  yPos += summaryLines.length * 5 + 15;

  if (hasRubrics && rubrics?.items) {
    if (yPos > 240) {
      pdf.addPage();
      yPos = 20;
    }

    const itemsArray: RubricLikeItem[] = Object.values(rubrics.items);

    const grouped = new Map<string, RubricLikeItem[]>();
    for (const item of itemsArray) {
      const key = item?.subCategory || 'Other';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item);
    }

    // Consolidate Medications into the Actions section (mirrors HS app behaviour)
    {
      // Include Spanish aliases because the backend may pre-translate `subCategory`
      // (e.g. "Acciones e Intervenciones", "Medicamentos") for Spanish reports.
      const actionKeys = [
        'action',
        'actions',
        'actions & interventions',
        'actions and interventions',
        'actions & medications',
        'actions and medications',
        'expected actions',
        'acciones',
        'acciones e intervenciones',
        'acciones y medicamentos',
        'acciones esperadas',
      ];
      const medicationKeys = [
        'medications',
        'medication',
        'medicamentos',
        'medicamento',
      ];
      let actionGroupKey: string | undefined;
      let medicationGroupKey: string | undefined;
      for (const key of grouped.keys()) {
        const lk = key.toLowerCase().trim();
        if (!actionGroupKey && actionKeys.some((ak) => lk === ak))
          actionGroupKey = key;
        if (!medicationGroupKey && medicationKeys.some((mk) => lk === mk))
          medicationGroupKey = key;
      }
      if (actionGroupKey && medicationGroupKey) {
        const actionItems = grouped.get(actionGroupKey)!;
        const medItems = grouped.get(medicationGroupKey)!;
        const primaryAction = actionItems[0];
        const primaryMed = medItems[0];
        if (primaryAction && primaryMed) {
          const mergedScore = Math.min(
            primaryAction.score ?? 100,
            primaryMed.score ?? 100
          );
          const mergedWeight =
            (primaryAction.weight ?? 0) + (primaryMed.weight ?? 0);
          const mergedSummary = [primaryAction.summary, primaryMed.summary]
            .filter(Boolean)
            .join(' ');
          // Match HS-online reference: merge strengths / weaknesses / actionDetails,
          // but do NOT concatenate recommendations — HS-online only inherits
          // primaryAction.recommendations via the spread. Concatenating here caused
          // duplicate "No items identified." bullets when the backend returned the
          // same placeholder in both action and medication rubric items.
          const mergedRecommendations = Array.from(
            new Set(
              (primaryAction.recommendations ?? [])
                .map((r) => (r ?? '').toString().trim())
                .filter(Boolean)
            )
          );
          const mergedItem: RubricLikeItem = {
            ...primaryAction,
            score: mergedScore,
            weight: mergedWeight,
            summary: mergedSummary || primaryAction.summary,
            strengths: [
              ...(primaryAction.strengths ?? []),
              ...(primaryMed.strengths ?? []),
            ],
            weaknesses: [
              ...(primaryAction.weaknesses ?? []),
              ...(primaryMed.weaknesses ?? []),
            ],
            actionDetails: [
              ...(primaryAction.actionDetails ?? []),
              ...(primaryMed.actionDetails ?? []),
            ],
            recommendations: mergedRecommendations,
          };
          grouped.set(actionGroupKey, [mergedItem, ...actionItems.slice(1)]);
          grouped.delete(medicationGroupKey);
        }
      }
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
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return 0;
      }
    );

    for (const [subCategory, items] of sortedGroupEntries) {
      if (yPos > 250) {
        pdf.addPage();
        yPos = 20;
      }
      yPos += 4;

      for (const item of items) {
        // Match HS-online layout: only force a page break when the item
        // header would land near the bottom margin. The previous `> 240`
        // check was too aggressive and left a large blank tail on the
        // prior page whenever a preceding rubric ended just past 240 mm
        // (e.g. Communication) before a compact rubric (e.g. Sequencing).
        if (yPos > 260) {
          pdf.addPage();
          yPos = 20;
        }

        // Match HS-online score-band rules (frontend/app/reports/[id]/page.tsx ~L1497):
        //   sequencing/prioritization → > 90 EXC, >= 75 MEETS, else NI
        //   documentation             → >= 70 EXC, >= 51 MEETS, else NI
        //   everything else           → > 90 EXC, >= 75 MEETS, else NI
        const scoreLabel = (() => {
          if (item?.score === undefined) return '';
          const sub = (subCategory ?? '').toLowerCase();
          const name = (item?.name ?? '').toLowerCase();
          const isSequencing =
            /sequencing|prioritization|secuenciaci[oó]n|priorizaci[oó]n/.test(
              sub
            ) ||
            /sequencing|prioritization|secuenciaci[oó]n|priorizaci[oó]n/.test(
              name
            ) ||
            sub === 'timeline' ||
            sub === 'timing';
          const isDocumentation =
            sub === 'documentation' || sub === 'clinical documentation';
          if (isDocumentation) {
            return item.score >= 70
              ? L.exceptional
              : item.score >= 51
                ? L.meetsExpectation
                : L.needsImprovement;
          }
          if (isSequencing) {
            return item.score > 90
              ? L.exceptional
              : item.score >= 75
                ? L.meetsExpectation
                : L.needsImprovement;
          }
          return item.score > 90
            ? L.exceptional
            : item.score >= 75
              ? L.meetsExpectation
              : L.needsImprovement;
        })();

        const subCategoryNormMap: Record<string, string> = {
          // English keys (subCategory can arrive as English from backend)
          action: L.categoryActions,
          actions: L.categoryActions,
          'actions & interventions': L.categoryActions,
          'actions and interventions': L.categoryActions,
          'actions & medications': L.categoryActions,
          'actions and medications': L.categoryActions,
          'expected actions': L.categoryPpe,
          medications: L.categoryMedications,
          medication: L.categoryMedications,
          ppe: L.categoryPpe,
          'ppe, privacy, & safety actions': L.categoryPpe,
          'privacy & safety': L.categoryPpe,
          'ppe, privacy and safety': L.categoryPpe,
          'ppe, privacy & safety': L.categoryPpe,
          'ppe, privacy, and safety': L.categoryPpe,
          'ppe, privacy, & safety': L.categoryPpe,
          documentation: L.categoryDocumentation,
          'clinical documentation': L.categoryDocumentation,
          'clinical documentation quality': L.categoryDocumentation,
          communication: L.categoryCommunication,
          'professional communication': L.categoryCommunication,
          timeline: L.categorySequencing,
          timing: L.categorySequencing,
          'sequencing & prioritization': L.categorySequencing,
          // Spanish keys — backend may pre-translate subCategory / item.name for es reports.
          acciones: L.categoryActions,
          'acciones e intervenciones': L.categoryActions,
          'acciones y medicamentos': L.categoryActions,
          'acciones esperadas': L.categoryActions,
          medicamentos: L.categoryMedications,
          medicamento: L.categoryMedications,
          epp: L.categoryPpe,
          'epp, privacidad y seguridad': L.categoryPpe,
          'privacidad y seguridad': L.categoryPpe,
          'documentaci\u00f3n': L.categoryDocumentation,
          'documentaci\u00f3n cl\u00ednica': L.categoryDocumentation,
          'calidad de la documentaci\u00f3n cl\u00ednica':
            L.categoryDocumentation,
          'comunicaci\u00f3n': L.categoryCommunication,
          'comunicaci\u00f3n profesional': L.categoryCommunication,
          'secuenciaci\u00f3n': L.categorySequencing,
          'secuenciaci\u00f3n y priorizaci\u00f3n': L.categorySequencing,
          'cronolog\u00eda': L.categorySequencing,
        };
        const normalizedLabel =
          subCategoryNormMap[(subCategory ?? '').toLowerCase().trim()] ??
          subCategoryNormMap[(item?.name ?? '').toLowerCase().trim()] ??
          item?.name ??
          subCategory;

        pdf.setFontSize(FONT_SIZE_SUBHEADER);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(251, 96, 51);
        pdf.text(sanitizePdfText(normalizedLabel.toUpperCase()), 20, yPos);
        if (scoreLabel) {
          pdf.setFontSize(8);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(0, 0, 0);
          pdf.text(
            sanitizePdfText(scoreLabel),
            190 - pdf.getTextWidth(scoreLabel),
            yPos
          );
        }
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'normal');
        yPos += 8;

        pdf.setFontSize(FONT_SIZE_SMALL);
        pdf.setTextColor(150, 150, 150);
        pdf.text(`${L.weight} ${item?.weight ?? 20}%`, 20, yPos);
        pdf.setTextColor(0, 0, 0);
        yPos += 7;

        if (item?.summary) {
          pdf.setFontSize(FONT_SIZE_BODY);
          const itemSummaryLines = pdf.splitTextToSize(
            sanitizePdfText(translateStr(item.summary)),
            170
          ) as string[];
          pdf.text(itemSummaryLines, 20, yPos);
          yPos += itemSummaryLines.length * 5 + 6;
        }

        // Team Communication badge
        const isCommunicationItem =
          (item?.subCategory ?? '').toLowerCase() === 'communication' ||
          (item?.subCategory ?? '').toLowerCase() ===
            'professional communication' ||
          (item?.name ?? '').toLowerCase().includes('communication');
        if (isCommunicationItem && (sbarStatus || isTcConfigured)) {
          if (yPos > 265) {
            pdf.addPage();
            yPos = 20;
          }
          pdf.setFontSize(FONT_SIZE_BODY);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(29, 78, 216);
          pdf.text(L.teamCommunication, 20, yPos);
          const labelWidth = pdf.getTextWidth(L.teamCommunication);
          const isNotAttempted = !sbarStatus;
          const isSatisfactory = sbarStatus?.toLowerCase() === 'satisfactory';
          const sbarLabel = isNotAttempted
            ? L.notDone
            : isSatisfactory
              ? L.satisfactory
              : L.unsatisfactory;
          const sbarColor: [number, number, number] = isNotAttempted
            ? [133, 77, 14]
            : isSatisfactory
              ? [5, 150, 105]
              : [185, 28, 28];
          pdf.setTextColor(...sbarColor);
          pdf.text(sanitizePdfText(sbarLabel), 20 + labelWidth + 4, yPos);
          pdf.setTextColor(0, 0, 0);
          pdf.setFont('helvetica', 'normal');
          yPos += 10;
        }

        // Strengths
        const seenStrengths = new Set<string>();
        const strengths: StrengthOrWeakness[] = (
          Array.isArray(item?.strengths) ? item.strengths : []
        ).filter((it) => {
          const key = swPoint(it).trim().toLowerCase();
          if (!key || seenStrengths.has(key)) return false;
          seenStrengths.add(key);
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
          pdf.text(L.strengths, 20, yPos);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(0, 0, 0);
          yPos += 6;
          for (const it of strengths) {
            if (yPos > 270) {
              pdf.addPage();
              yPos = 20;
            }
            const ptLines = pdf.splitTextToSize(
              sanitizePdfText(`• ${translatePoint(swPoint(it))}`) as string,
              160
            ) as string[];
            pdf.text(ptLines, 25, yPos);
            yPos += ptLines.length * 5 + 1;
            // Only render the strength "example" for the Medications rubric —
            // HS-online's PDF gates this on the item being medication-related
            // and produces the fixed "Medicamento administrado correctamente."
            // subtitle. For every other rubric (e.g. Clinical Documentation,
            // Communication) the backend sometimes ships stray example text
            // (occasionally a leftover medication string) that lands under an
            // unrelated bullet, so suppress it entirely there to avoid the
            // misaligned "Medicamento administrado correctamente." line
            // appearing under a documentation strength.
            const isMedItemStrength =
              (item?.subCategory ?? '').toLowerCase() === 'medications' ||
              (item?.name ?? '').toLowerCase() === 'medications';
            if (isMedItemStrength) {
              const ex = swExample(it);
              if (ex) {
                pdf.setFont('helvetica', 'italic');
                const exLines = pdf.splitTextToSize(
                  sanitizePdfText(`  "${translatePoint(ex)}"`),
                  155
                ) as string[];
                pdf.text(exLines, 30, yPos);
                pdf.setFont('helvetica', 'normal');
                yPos += exLines.length * 4 + 2;
              }
            }
          }
          yPos += 5;
        }

        // Weaknesses
        const seenWeaknesses = new Set<string>();
        const weaknesses: StrengthOrWeakness[] = (
          Array.isArray(item?.weaknesses) ? item.weaknesses : []
        ).filter((it) => {
          const key = swPoint(it).trim().toLowerCase();
          if (!key || seenWeaknesses.has(key)) return false;
          seenWeaknesses.add(key);
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
          pdf.text(L.weaknesses, 20, yPos);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(0, 0, 0);
          yPos += 6;
          for (const it of weaknesses) {
            if (yPos > 270) {
              pdf.addPage();
              yPos = 20;
            }
            const ptLines = pdf.splitTextToSize(
              sanitizePdfText(`• ${translatePoint(swPoint(it))}`) as string,
              160
            ) as string[];
            pdf.text(ptLines, 25, yPos);
            yPos += ptLines.length * 5 + 1;
            const ex = swExample(it);
            if (ex) {
              pdf.setFont('helvetica', 'italic');
              const exLines = pdf.splitTextToSize(
                sanitizePdfText(`  "${translatePoint(ex)}"`),
                155
              ) as string[];
              pdf.text(exLines, 30, yPos);
              pdf.setFont('helvetica', 'normal');
              yPos += exLines.length * 4 + 2;
            }
          }
          yPos += 5;
        }

        // Optional Actions
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
        // Always render the "Optional <Actions|Medications> Completed:" header (matches HS layout).
        // When there are no completed optional items, render an italic "Sin elementos." fallback.
        {
          if (yPos > 260) {
            pdf.addPage();
            yPos = 20;
          }
          pdf.setFontSize(FONT_SIZE_BODY);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(180, 120, 0);
          pdf.text(
            isMedItem ? L.optionalMedications : L.optionalActions,
            20,
            yPos
          );
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(0, 0, 0);
          yPos += 6;
          if (optionalDone.length === 0) {
            pdf.setFont('helvetica', 'italic');
            pdf.setTextColor(120, 120, 120);
            pdf.text(sanitizePdfText(L.noItems), 25, yPos);
            pdf.setFont('helvetica', 'normal');
            pdf.setTextColor(0, 0, 0);
            yPos += 5;
          } else {
            for (const d of optionalDone) {
              if (yPos > 270) {
                pdf.addPage();
                yPos = 20;
              }
              const optLines = pdf.splitTextToSize(
                sanitizePdfText(`• ${translatePoint(d.title || '')}`),
                160
              ) as string[];
              pdf.text(optLines, 25, yPos);
              yPos += optLines.length * 5 + 1;
              if (isMedItem) {
                pdf.setFont('helvetica', 'italic');
                pdf.setFontSize(FONT_SIZE_SMALL);
                pdf.setTextColor(120, 120, 120);
                pdf.text(L.medicationCorrect, 30, yPos);
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(FONT_SIZE_BODY);
                pdf.setTextColor(0, 0, 0);
                yPos += 5;
              }
            }
          }
          yPos += 5;
        }

        // Recommendations
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
          pdf.text(L.recommendations, 20, yPos);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(0, 0, 0);
          yPos += 6;
          for (const rec of item.recommendations) {
            if (yPos > 270) {
              pdf.addPage();
              yPos = 20;
            }
            const recLines = pdf.splitTextToSize(
              sanitizePdfText(`• ${translatePoint(rec)}`) as string,
              160
            ) as string[];
            pdf.text(recLines, 25, yPos);
            yPos += recLines.length * 5 + 1;
          }
          yPos += 5;
        }
      }
      yPos += 4;
    }
  }

  // ── Technical Skills Assessment (non-rubrics)
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
      `Technical Skills Score: ${Number((technicalSkills.totalScore || 0).toFixed(2))}/${technicalSkills.totalWeight || 'N/A'}`,
      20,
      yPos
    );
    yPos += 8;

    const techItemsMap = new Map<string, RubricLikeItem>();
    Object.values(technicalSkills.items).forEach((item) => {
      const key = item.subCategory || item.name || item.aiCheckId || item.id;
      if (!key) return;
      if (techItemsMap.has(key)) {
        const existing = techItemsMap.get(key)!;
        if (
          (item.score || 0) > (existing.score || 0) ||
          ((item.score || 0) === (existing.score || 0) &&
            item.summary &&
            !existing.summary)
        )
          techItemsMap.set(key, item);
      } else {
        techItemsMap.set(key, item);
      }
    });

    Array.from(techItemsMap.values()).forEach((item) => {
      if (yPos > 240) {
        pdf.addPage();
        yPos = 20;
      }
      pdf.setFontSize(FONT_SIZE_BODY);
      pdf.setFont('helvetica', 'bold');
      pdf.text(sanitizePdfText(`${item.name}`), 20, yPos);
      pdf.setFont('helvetica', 'normal');
      yPos += 6;
      if (item.summary) {
        const itemSummaryLines = pdf.splitTextToSize(
          sanitizePdfText(item.summary),
          170
        ) as string[];
        pdf.text(itemSummaryLines, 25, yPos);
        yPos += itemSummaryLines.length * 4 + 5;
      }
      yPos += 3;
    });
    yPos += 10;
  }

  // ── Communication Assessment - Soft Skills (non-rubrics)
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

    Object.values(softSkills.items ?? {}).forEach((item) => {
      if (yPos > 260) {
        pdf.addPage();
        yPos = 20;
      }
      const performanceLabel =
        (item.score || 0) >= 8
          ? L.exceptional
          : (item.score || 0) >= 6
            ? L.meetsExpectation
            : L.needsImprovement;
      pdf.setFontSize(FONT_SIZE_BODY);
      pdf.setFont('helvetica', 'bold');
      pdf.text(sanitizePdfText(`${item.name}`), 20, yPos);
      yPos += 6;
      pdf.setFontSize(FONT_SIZE_SMALL);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Performance: ${performanceLabel}`, 25, yPos);
      yPos += 5;
      const softSumLines = pdf.splitTextToSize(
        sanitizePdfText(item.summary || 'Communication skill'),
        170
      ) as string[];
      pdf.setFontSize(FONT_SIZE_BODY);
      pdf.text(softSumLines, 25, yPos);
      yPos += softSumLines.length * 4 + 4;

      const strArr: StrengthOrWeakness[] = Array.isArray(item.strengths)
        ? item.strengths
        : [];
      if (yPos > 270) {
        pdf.addPage();
        yPos = 20;
      }
      pdf.setFontSize(FONT_SIZE_BODY);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 128, 0);
      pdf.text(L.strengthsUpper, 20, yPos);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);
      yPos += 5;
      if (strArr.length === 0) {
        pdf.text(sanitizePdfText(L.noItemsIdentified), 25, yPos);
        yPos += 5;
      } else {
        for (const it of strArr) {
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
          const ex = swExample(it);
          if (ex) {
            const exLines = pdf.splitTextToSize(
              sanitizePdfText(`"${ex}"`),
              150
            ) as string[];
            pdf.text(exLines, 35, yPos);
            yPos += exLines.length * 4 + 2;
          }
        }
        yPos += 3;
      }

      const wkArr: StrengthOrWeakness[] = Array.isArray(item.weaknesses)
        ? item.weaknesses
        : [];
      if (yPos > 270) {
        pdf.addPage();
        yPos = 20;
      }
      pdf.setFontSize(FONT_SIZE_BODY);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(200, 120, 0);
      pdf.text(L.weaknessesUpper, 20, yPos);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);
      yPos += 5;
      if (wkArr.length === 0) {
        pdf.text(sanitizePdfText(L.noItemsIdentified), 25, yPos);
        yPos += 5;
      } else {
        for (const it of wkArr) {
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
          const ex = swExample(it);
          if (ex) {
            const exLines = pdf.splitTextToSize(
              sanitizePdfText(`"${ex}"`),
              150
            ) as string[];
            pdf.text(exLines, 35, yPos);
            yPos += exLines.length * 4 + 2;
          }
        }
        yPos += 3;
      }

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
        pdf.text(L.improvementRecs, 20, yPos);
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
            sanitizePdfText(`• ${rec}`) as string,
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

  // ── Technical Skills overview (non-rubrics)
  if (!hasRubrics && report.communicationAssessment?.technicalSkills) {
    const ts = report.communicationAssessment.technicalSkills;
    if (yPos > 240) {
      pdf.addPage();
      yPos = 20;
    }
    pdf.setFontSize(FONT_SIZE_SECTION);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Technical Skills overview:', 20, yPos);
    pdf.setFont('helvetica', 'normal');
    yPos += 8;

    if ((ts.overallstrengths?.length ?? 0) > 0) {
      pdf.setFontSize(FONT_SIZE_SUBHEADER);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 128, 0);
      pdf.text(L.strengths, 20, yPos);
      yPos += 6;
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(FONT_SIZE_BODY);
      pdf.setFont('helvetica', 'normal');
      ts.overallstrengths!.forEach((s) => {
        const t =
          typeof s === 'string'
            ? s
            : `${(s as StrengthOrWeaknessObj).point || ''}${(s as StrengthOrWeaknessObj).example ? `: "${(s as StrengthOrWeaknessObj).example}"` : ''}`;
        const ln = pdf.splitTextToSize(
          sanitizePdfText(`• ${t}`) as string,
          170
        ) as string[];
        pdf.text(ln, 25, yPos);
        yPos += ln.length * 4 + 2;
      });
      yPos += 5;
    }
    if ((ts.overallweaknesses?.length ?? 0) > 0) {
      pdf.setFontSize(FONT_SIZE_SUBHEADER);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(200, 0, 0);
      pdf.text(L.weaknesses, 20, yPos);
      yPos += 6;
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(FONT_SIZE_BODY);
      pdf.setFont('helvetica', 'normal');
      ts.overallweaknesses!.forEach((s) => {
        const t =
          typeof s === 'string'
            ? s
            : `${(s as StrengthOrWeaknessObj).point || ''}${(s as StrengthOrWeaknessObj).example ? `: "${(s as StrengthOrWeaknessObj).example}"` : ''}`;
        const ln = pdf.splitTextToSize(
          sanitizePdfText(`• ${t}`) as string,
          170
        ) as string[];
        pdf.text(ln, 25, yPos);
        yPos += ln.length * 4 + 2;
      });
      yPos += 5;
    }
    if ((ts.overallrecommendations?.length ?? 0) > 0) {
      pdf.setFontSize(FONT_SIZE_SUBHEADER);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 100, 200);
      pdf.text(L.recommendations, 20, yPos);
      yPos += 6;
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(FONT_SIZE_BODY);
      pdf.setFont('helvetica', 'normal');
      ts.overallrecommendations!.forEach((rec) => {
        const ln = pdf.splitTextToSize(
          sanitizePdfText(`• ${rec}`) as string,
          170
        ) as string[];
        pdf.text(ln, 25, yPos);
        yPos += ln.length * 4 + 2;
      });
      yPos += 10;
    }
  }

  // ── Soft Skills overview (non-rubrics)
  if (!hasRubrics && report.communicationAssessment?.softSkills) {
    const ss = report.communicationAssessment.softSkills;
    if (yPos > 240) {
      pdf.addPage();
      yPos = 20;
    }
    pdf.setFontSize(FONT_SIZE_SECTION);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Soft Skills overview:', 20, yPos);
    pdf.setFont('helvetica', 'normal');
    yPos += 8;

    if ((ss.overallstrengths?.length ?? 0) > 0) {
      pdf.setFontSize(FONT_SIZE_SUBHEADER);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 128, 0);
      pdf.text(L.strengths, 20, yPos);
      yPos += 6;
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(FONT_SIZE_BODY);
      pdf.setFont('helvetica', 'normal');
      ss.overallstrengths!.forEach((s) => {
        const t =
          typeof s === 'string'
            ? s
            : `${(s as StrengthOrWeaknessObj).point || ''}${(s as StrengthOrWeaknessObj).example ? `: "${(s as StrengthOrWeaknessObj).example}"` : ''}`;
        const ln = pdf.splitTextToSize(
          sanitizePdfText(`• ${t}`) as string,
          170
        ) as string[];
        pdf.text(ln, 25, yPos);
        yPos += ln.length * 4 + 2;
      });
      yPos += 5;
    }
    if ((ss.overallweaknesses?.length ?? 0) > 0) {
      pdf.setFontSize(FONT_SIZE_SUBHEADER);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(200, 0, 0);
      pdf.text(L.weaknesses, 20, yPos);
      yPos += 6;
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(FONT_SIZE_BODY);
      pdf.setFont('helvetica', 'normal');
      ss.overallweaknesses!.forEach((s) => {
        const t =
          typeof s === 'string'
            ? s
            : `${(s as StrengthOrWeaknessObj).point || ''}${(s as StrengthOrWeaknessObj).example ? `: "${(s as StrengthOrWeaknessObj).example}"` : ''}`;
        const ln = pdf.splitTextToSize(
          sanitizePdfText(`• ${t}`) as string,
          170
        ) as string[];
        pdf.text(ln, 25, yPos);
        yPos += ln.length * 4 + 2;
      });
      yPos += 5;
    }
    const softSkillRecs = ss.overallrecommendations;
    if (Array.isArray(softSkillRecs) && softSkillRecs.length > 0) {
      if (yPos > 230) {
        pdf.addPage();
        yPos = 20;
      }
      pdf.setFontSize(FONT_SIZE_SUBHEADER);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 100, 200);
      pdf.text(L.recommendations, 20, yPos);
      yPos += 6;
      pdf.setFontSize(FONT_SIZE_BODY);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(0, 0, 0);
      (softSkillRecs as string[]).forEach((rec) => {
        const ln = pdf.splitTextToSize(
          sanitizePdfText(`• ${rec}`) as string,
          170
        ) as string[];
        const h = ln.length * 4 + 2;
        if (yPos + h > 270) {
          pdf.addPage();
          yPos = 20;
        }
        pdf.text(ln, 25, yPos);
        yPos += h;
      });
      yPos += 10;
    }
  }

  // ── Overall Strengths / Weaknesses / Recommendations (from communicationAssessment.overall) ──
  const overall = report.communicationAssessment?.overall;
  if (!hasRubrics && (overall?.strengths?.length ?? 0) > 0) {
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
    overall!.strengths!.forEach((s) => {
      const ln = pdf.splitTextToSize(
        sanitizePdfText(`• ${s}`) as string,
        170
      ) as string[];
      pdf.text(ln, 25, yPos);
      yPos += ln.length * 4 + 2;
    });
    yPos += 10;
  }
  if (!hasRubrics && (overall?.weaknesses?.length ?? 0) > 0) {
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
    overall!.weaknesses!.forEach((s) => {
      const ln = pdf.splitTextToSize(
        sanitizePdfText(`• ${s}`) as string,
        170
      ) as string[];
      pdf.text(ln, 25, yPos);
      yPos += ln.length * 4 + 2;
    });
    yPos += 10;
  }
  if (!hasRubrics && (overall?.recommendations?.length ?? 0) > 0) {
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
    overall!.recommendations!.forEach((s) => {
      const ln = pdf.splitTextToSize(
        sanitizePdfText(`• ${s}`) as string,
        170
      ) as string[];
      pdf.text(ln, 25, yPos);
      yPos += ln.length * 4 + 2;
    });
    yPos += 10;
  }

  // ── Key Strengths (from reportData)
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
    reportData.strengths.forEach((s: StrengthOrWeakness) => {
      const ln = pdf.splitTextToSize(
        sanitizePdfText(`• ${swPoint(s)}`) as string,
        170
      ) as string[];
      pdf.text(ln, 25, yPos);
      yPos += ln.length * 4 + 2;
    });
    yPos += 10;
  }

  // ── Areas for Improvement (from reportData)
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
    reportData.improvements.forEach((imp: StrengthOrWeakness) => {
      const ln = pdf.splitTextToSize(
        sanitizePdfText(`• ${swPoint(imp)}`) as string,
        170
      ) as string[];
      pdf.text(ln, 25, yPos);
      yPos += ln.length * 4 + 2;
    });
    yPos += 10;
  }

  // ── Debrief Reflection
  if (report.debriefReflection) {
    if (yPos > 240) {
      pdf.addPage();
      yPos = 20;
    }
    pdf.setFontSize(FONT_SIZE_SECTION);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Debrief Reflection:', 20, yPos);
    yPos += 8;
    pdf.setFontSize(FONT_SIZE_BODY);
    pdf.setFont('helvetica', 'italic');
    const debriefLines = pdf.splitTextToSize(
      sanitizePdfText(`"${report.debriefReflection}"`),
      170
    ) as string[];
    pdf.text(debriefLines, 20, yPos);
    pdf.setFont('helvetica', 'normal');
  }

  // ── Save
  if (!opts.returnDoc) {
    const filePrefix =
      report.mode === 'Practice' ? 'practice-report' : 'assessment-report';
    const saveAs = filename ?? `${filePrefix}-${reportId}`;
    pdf.save(`${saveAs}.pdf`);
  }

  return pdf;
}

export function downloadStudentReportPDF(
  report: ReportDataForPDF,
  opts: GeneratePDFOptions
): void {
  buildStudentReportPDF(report, { ...opts, returnDoc: false });
}

export function buildStudentReportPDFBase64(
  report: ReportDataForPDF,
  opts: GeneratePDFOptions
): string {
  const pdf = buildStudentReportPDF(report, { ...opts, returnDoc: true });
  const dataUri = pdf.output('datauristring') as string;
  return dataUri.replace(/^data:application\/pdf;base64,/, '');
}
