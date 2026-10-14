import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  GetClassSimulationReports,
  resetClassReports,
  selectClassReports,
  selectClassReportsStatus,
  type SimulationReport,
} from '../../../redux/class/SimsCompletedreportsRedux';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import FormField from '../../ui/FormField';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { type SimulationItem } from '@/types';
import type { Student } from '../../../types/Class_types';

interface Props {
  sim: SimulationItem;
  className?: string;
  classId?: string;
  students?: Student[];
  onClose: () => void;
  disabled?: boolean;
}

interface GradeRow {
  studentName: string;
  studentId: string;
  score: string;
  attempt: string;
  submissionDate: string;
  simsCompleted: string;
}

const HEADERS = [
  'Student Name',
  'Student Code',
  'Score',
  'Attempt',
  'Submission Date',
  'Sims Completed',
];

function isUuidLike(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

function buildStudentLookup(students?: Student[]): Map<string, Student> {
  const map = new Map<string, Student>();
  for (const s of students ?? []) {
    const keys = [s.id, s.user_id, s.student_id].filter(Boolean) as string[];
    for (const key of keys) map.set(String(key), s);
  }
  return map;
}

function buildFilename(className: string | undefined, simName: string): string {
  return [className, simName, 'grades']
    .filter(Boolean)
    .join('_')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');
}

function formatScore(r: SimulationReport): string {
  const raw = r.score ?? r.scoreJson?.overallScore ?? null;
  if (raw === null) return r.performanceLabel ?? '—';
  const pct =
    raw <= 1 && raw >= 0
      ? Math.round(Number(raw) * 100)
      : Math.round(Number(raw));
  return `${pct}%`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString('en-US');
}

function toAttemptNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value))
    return Math.max(0, Math.trunc(value));
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.trunc(parsed));
  }
  return null;
}

function extractAttemptFromReport(r: SimulationReport): number | null {
  const raw = r as unknown as Record<string, unknown>;
  const reportData =
    raw['report_data'] && typeof raw['report_data'] === 'object'
      ? (raw['report_data'] as Record<string, unknown>)
      : undefined;

  const candidates: unknown[] = [
    r.attempt,
    raw['attempt'],
    raw['attempts'],
    raw['attempt_count'],
    raw['attempts_count'],
    raw['attemptNo'],
    raw['attempt_no'],
    raw['attemptNumber'],
    reportData?.['attempt'],
    reportData?.['attempts'],
    reportData?.['attempt_count'],
    reportData?.['attempts_count'],
    reportData?.['attemptNo'],
    reportData?.['attempt_no'],
    reportData?.['attemptNumber'],
  ];

  for (const candidate of candidates) {
    const parsed = toAttemptNumber(candidate);
    if (parsed !== null) return parsed;
  }

  return null;
}

function toRow(r: GradeRow): string[] {
  return [
    r.studentName,
    r.studentId,
    r.score,
    r.attempt,
    r.submissionDate,
    r.simsCompleted,
  ];
}

function exportPDF(
  rows: GradeRow[],
  className: string | undefined,
  simTitle: string
): void {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.setTextColor(234, 88, 12);
  doc.text('Grade Report', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Class      : ${className ?? '—'}`, 14, 28);
  doc.text(`Simulation : ${simTitle}`, 14, 35);
  autoTable(doc, {
    startY: 42,
    head: [HEADERS],
    body: rows.map(toRow),
    headStyles: { fillColor: [234, 88, 12], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [255, 247, 237] },
    styles: { fontSize: 9, cellPadding: 3 },
  });
  doc.save(`${buildFilename(className, simTitle)}.pdf`);
}

export default function ExportGradeModal({
  sim,
  className,
  classId,
  students,
  onClose,
  disabled,
}: Props) {
  const dispatch = useAppDispatch();
  const [exporting, setExporting] = useState(false);
  const classReports = useAppSelector(selectClassReports);
  const reportsStatus = useAppSelector(selectClassReportsStatus);
  const studentLookup = buildStudentLookup(students);

  useEffect(() => {
    if (classId) {
      dispatch(resetClassReports());
      dispatch(GetClassSimulationReports({ classId }));
    }
  }, [classId, dispatch]);

  // Filter reports that belong to this simulation by ID or normalized title
  const simId = String(sim.simulation_id ?? sim.id ?? '').trim();
  const normTitle = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
  const simReports = classReports.filter((r: SimulationReport) => {
    const rId = String(
      r.scenarioId ?? r.simulation_id ?? r.scenario_id ?? ''
    ).trim();
    if (simId && rId && rId === simId) return true;
    const rTitle = normTitle(
      r.scenarioTitle ?? r.simulation_name ?? r.scenario_title ?? ''
    );
    const sTitle = normTitle(sim.simulation_title ?? '');
    return sTitle && rTitle && rTitle === sTitle;
  });

  // Group by student, then build one GradeRow per student from blob data only
  const studentMap = new Map<string, SimulationReport[]>();
  for (const r of simReports) {
    const key = r.userId ?? r.student_id ?? r.studentName ?? r.key ?? r.id;
    if (!studentMap.has(key)) studentMap.set(key, []);
    studentMap.get(key)!.push(r);
  }

  const gradeRows: GradeRow[] = Array.from(studentMap.values()).map(
    (reports) => {
      // Best attempt = highest score
      const best = reports.reduce((a, b) => {
        const aScore = a.score ?? a.scoreJson?.overallScore ?? -1;
        const bScore = b.score ?? b.scoreJson?.overallScore ?? -1;
        return Number(aScore) >= Number(bScore) ? a : b;
      });
      const bestRaw = best as unknown as Record<string, unknown>;
      const lookupKeys = [
        best.userId,
        best.student_id,
        bestRaw['user_id'] as string | undefined,
        bestRaw['student_id'] as string | undefined,
        best.id,
      ].filter(Boolean) as string[];
      const matchedStudent = lookupKeys
        .map((k) => studentLookup.get(String(k)))
        .find((s): s is Student => Boolean(s));
      const fallbackStudentId = best.student_id ?? best.userId ?? '—';
      const studentId =
        matchedStudent?.student_id ??
        (fallbackStudentId && !isUuidLike(fallbackStudentId)
          ? fallbackStudentId
          : '—');
      const resolvedName =
        matchedStudent?.student_name ??
        best.studentName ??
        best.student_name ??
        studentId;
      const attemptFromBlob = reports.reduce((max, report) => {
        const v = extractAttemptFromReport(report);
        return v != null ? Math.max(max, v) : max;
      }, 0);
      const attemptCount =
        attemptFromBlob > 0 ? attemptFromBlob : reports.length;

      return {
        studentName: resolvedName,
        studentId,
        score: formatScore(best),
        attempt: String(attemptCount),
        submissionDate: formatDate(best.scenarioEndTime ?? best.completed_at),
        simsCompleted: String(reports.length),
      };
    }
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 300));
      exportPDF(gradeRows, className, sim.simulation_title);
      onClose();
    } catch {
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Export Grade Report">
      <div className="space-y-5">
        <FormField label="Class Name">
          <Input
            value={className ?? ''}
            readOnly
            inputClassName="bg-gray-50 text-gray-500 cursor-not-allowed"
          />
        </FormField>

        <FormField label="Simulation Name">
          <Input
            value={sim.simulation_title}
            readOnly
            inputClassName="bg-gray-50 text-gray-500 cursor-not-allowed"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={exporting}
            className="w-full h-11 rounded-full"
          >
            Back
          </Button>
          <Button
            type="button"
            variant="gradient"
            onClick={handleExport}
            disabled={
              disabled ||
              exporting ||
              reportsStatus === 'loading' ||
              gradeRows.length === 0
            }
            className="w-full h-11 rounded-full flex items-center justify-center gap-2"
          >
            {exporting ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Exporting…
              </>
            ) : (
              <>
                <Download size={15} /> Export
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
