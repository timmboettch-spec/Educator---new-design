import JSZip from 'jszip';
import { fetchReportById } from '../../api/reportTranscriptApi';
import { resolveStudentReportBlobId } from '../../api/resolveStudentReportBlobId';
import {
  buildStudentReportPDF,
  type ReportDataForPDF,
  type GeneratePDFOptions,
} from '../../student-reports/generateStudentReportPDF';
import type { SimulationReport } from '../../redux/class/SimsCompletedreportsRedux';

// ─── Types

export type StudentNameById = Record<string, string>;

export type StudentIdentity = {
  studentName?: string;
  studentCode?: string;
  studentEmail?: string;
  className?: string;
};
export type StudentIdentityById = Record<string, StudentIdentity>;

// ─── Helpers

function resolveReportBlobId(r: SimulationReport): string {
  return resolveStudentReportBlobId(r as unknown as Record<string, unknown>);
}

function resolveClassName(
  r: SimulationReport,
  studentIdentityById: StudentIdentityById
): string | undefined {
  const studentId = r.student_id ?? r.userId ?? '';
  return studentIdentityById[studentId]?.className ?? undefined;
}

function safeName(
  r: SimulationReport,
  studentNameById: StudentNameById
): string {
  const name =
    r.student_name ??
    r.studentName ??
    (r.student_id ? studentNameById[r.student_id] : undefined) ??
    (r.userId ? studentNameById[r.userId] : undefined) ??
    r.student_code ??
    r.studentCode ??
    r.student_id ??
    r.userId ??
    'student';
  return name
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 40);
}

function safeSimTitle(r: SimulationReport): string {
  return (
    r.scenarioTitle ??
    r.scenario_title ??
    r.simulation_name ??
    r.scenarioId ??
    r.scenario_id ??
    'report'
  )
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 40);
}

// ─── Public API

export async function generateMultiReportPDF(
  reports: SimulationReport[],
  filename: string,
  studentNameById: StudentNameById = {},
  studentIdentityById: StudentIdentityById = {}
): Promise<void> {
  if (reports.length === 0) return;

  if (reports.length === 1) {
    const r = reports[0];
    const reportId = resolveReportBlobId(r);
    if (!reportId) return;
    const fullReport = (await fetchReportById(reportId)) as ReportDataForPDF;
    const opts: GeneratePDFOptions = {
      reportId,
      displayClassName: resolveClassName(r, studentIdentityById),
      filename: filename.replace(/\.pdf$/i, ''),
    };
    buildStudentReportPDF(fullReport, opts);
    return;
  }

  // Multiple: zip them up
  const zip = new JSZip();
  for (const r of reports) {
    const reportId = resolveReportBlobId(r);
    if (!reportId) continue;
    try {
      const fullReport = (await fetchReportById(reportId)) as ReportDataForPDF;
      const opts: GeneratePDFOptions = {
        reportId,
        displayClassName: resolveClassName(r, studentIdentityById),
        returnDoc: true,
      };
      const doc = buildStudentReportPDF(fullReport, opts);
      zip.file(
        `${safeName(r, studentNameById)}_${safeSimTitle(r)}.pdf`,
        doc.output('arraybuffer')
      );
    } catch {
      // skip individual failures silently
    }
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/\.pdf$/i, '.zip');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function generateZipOfPDFs(
  reports: SimulationReport[],
  zipFilename = 'reports.zip',
  studentNameById: StudentNameById = {},
  studentIdentityById: StudentIdentityById = {}
): Promise<void> {
  const zip = new JSZip();
  const usedFilenames = new Map<string, number>();

  for (const r of reports) {
    const reportId = resolveReportBlobId(r);
    if (!reportId) continue;
    try {
      const fullReport = (await fetchReportById(reportId)) as ReportDataForPDF;
      const opts: GeneratePDFOptions = {
        reportId,
        displayClassName: resolveClassName(r, studentIdentityById),
        returnDoc: true,
      };
      const doc = buildStudentReportPDF(fullReport, opts);
      const baseFilename = `${safeName(r, studentNameById)}_${safeSimTitle(r)}.pdf`;
      const count = usedFilenames.get(baseFilename) ?? 0;
      usedFilenames.set(baseFilename, count + 1);
      const uniqueFilename =
        count === 0
          ? baseFilename
          : baseFilename.replace(/\.pdf$/, `_${count + 1}.pdf`);
      zip.file(uniqueFilename, doc.output('arraybuffer'));
    } catch {
      // skip individual failures silently
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
