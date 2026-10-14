import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { resolveStudentReportBlobId } from '../../../api/resolveStudentReportBlobId';
import loginEn from '../../../locales/auth/login/en.json';
import loginEs from '../../../locales/auth/login/es.json';

type SupportedLang = 'en' | 'es';
const LANGUAGE_STORAGE_KEY = 'app_language';
const getStoredLanguage = (): SupportedLang => {
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === 'es' ? 'es' : 'en';
};

import ExportReportModal from '../../../components/class/simulation/ExportReportModal';
import StudentEmailAccessCodeModal from '../../../components/class/student/StudentEmailAccessCodeModal';
import StudentEmailReportModal from '../../../components/class/student/StudentEmailReportModal';
import StudentReportsModal from '../../../components/class/student/StudentReportsModal';
import StudentReportView from '../../../student-reports/StudentReportView';
import {
  GetClassSimulationReports,
  selectClassReports,
} from '../../../redux/class/SimsCompletedreportsRedux';
import {
  selectEducatorReports,
  selectEducatorReportsStatus,
} from '../../../redux/reports/EducatorReportsRedux';
import { selectAllStudentCodes } from '../../../redux/class/GetClassRedux';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import type { Student } from '../../../types';
import PrintAccessCodeModal from '../PrintAccessCode';
import RegenerateAccessCodeModal from './RegenerateAccessCodeModal';
import RevokeAccessCodeModal from './RevokeAccessCodeModal';
import StudentModal from './StudentModal';
import SortableHeader from '../../common/SortableHeader';
import StatusBadge from '../../ui/StatusBadge';
import { Button } from '../../ui/Button';
import { useTranslation } from 'react-i18next';
import { useBulkReportReview } from '../../../hooks/useBulkReportReview';
import { SimulationReportSelectorType } from '../../../redux/api/reports/reports.types';
import { useClassRoster } from '../../../hooks/useClassRoster';
import { StudentSortField } from '../../../redux/api/students/students.types';
import { type ClassRosterRow } from '../../../redux/api/students/studentsService';
import { cn } from '../../../lib/utils';
import type { ClassAvailability } from '../../../utils/classUtils';
import { ClassAvailabilityTip } from '../ClassAvailabilityTip';
import { SkeletonRows } from '../../ui/Skeleton';
import {
  SKELETON_INITIAL_ROW_COUNT,
  SKELETON_REFETCH_ROW_COUNT,
} from '../../../utils/constants/skeleton';
import { InfiniteListFooter, LoadErrorMessage } from '../InfiniteListFooter';
import {
  buildUniqueStudentNames,
  normalizeStudentKey,
  reportMatchesStudent,
} from '../../../utils/matchStudentReport';

/** The roster's compact, uppercase code-status chip (design: educator-front). */
const codeStatusBadgeClassName =
  'px-2.5 py-0.5 text-[10px] leading-4 uppercase tracking-wide font-semibold';

interface ReviewMenuLabels {
  viewReports: string;
  markAllReviewed: string;
  markAllUnreviewed: string;
}

const getMenuItems = (
  isRevoked: boolean,
  isEmail: boolean,
  t: typeof loginEn.studentSubtable,
  labels: ReviewMenuLabels
) => [
  // {
  //   label: t.menuEditStudent,
  //   action: "edit",
  //   danger: false,
  //   disabled: false,
  // },

  {
    label: t.menuEmailCode,
    action: 'email_access_code',
    danger: false,
    disabled: isRevoked,
    hide: !isEmail,
  },
  {
    label: t.menuPrintCode,
    action: 'print_access_code',
    danger: false,
    disabled: isRevoked,
  },
  {
    label: t.menuRegenerateCode,
    action: 'regenerate_access_code',
    danger: false,
    disabled: false,
  },
  {
    label: t.menuRevokeCode,
    action: 'revoke_access_code',
    danger: false,
    disabled: isRevoked,
  },
  {
    label: labels.viewReports,
    action: 'view_reports',
    danger: false,
    disabled: false,
  },
  {
    label: t.menuEmailReports,
    action: 'email_reports',
    danger: false,
    disabled: false,
    hide: !isEmail,
  },
  {
    label: t.menuExportReports,
    action: 'export_reports',
    danger: false,
    disabled: false,
  },
  {
    label: labels.markAllReviewed,
    action: 'mark_all_reviewed',
    danger: false,
    disabled: false,
  },
  {
    label: labels.markAllUnreviewed,
    action: 'mark_all_unreviewed',
    danger: false,
    disabled: false,
  },
  {
    label: t.menuDeleteStudent,
    action: 'delete',
    danger: true,
    disabled: false,
  },
];

function PortalDropdown({
  anchorEl,
  onClose,
  onSelect,
  studentId,
  isRevoked,
  studentEmail,
  isClassInactive,
  t,
  labels,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onSelect: (action: string, studentId: string) => void;
  studentId: string;
  studentEmail: string | null | undefined;
  isRevoked: boolean;
  isClassInactive?: boolean;
  t: typeof loginEn.studentSubtable;
  labels: ReviewMenuLabels;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Stable ref so effects never go stale and don't need onClose in their deps
  const onCloseRef = useRef(onClose);
  // Render hidden off-screen at full width first so we can measure actual height
  const [style, setStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    visibility: 'hidden',
    top: -9999,
    left: -9999,
    width: 220,
  });

  // Keep ref current on every render without triggering effect re-runs
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  // Compute position synchronously BEFORE the browser paints → zero flash
  useLayoutEffect(() => {
    if (!anchorEl || !dropdownRef.current) return;
    const rect = anchorEl.getBoundingClientRect();
    const DROPDOWN_WIDTH = 220;
    const GAP = 6;
    const EDGE_PAD = 8;
    const actualHeight = dropdownRef.current.scrollHeight;
    const spaceBelow = window.innerHeight - rect.bottom - GAP;
    const spaceAbove = rect.top - GAP;

    let top: number;

    if (spaceBelow >= actualHeight) {
      // Enough room below — preferred position
      top = rect.bottom + GAP;
    } else if (spaceAbove >= actualHeight) {
      // Not enough below, but fits above — flip up
      top = rect.top - actualHeight - GAP;
    } else if (spaceBelow >= spaceAbove) {
      // More room below but still tight — anchor bottom to viewport edge so all items show
      top = window.innerHeight - actualHeight - EDGE_PAD;
    } else {
      // More room above — anchor top to viewport top edge so all items show
      top = EDGE_PAD;
    }

    top = Math.max(EDGE_PAD, top);

    const right = Math.max(EDGE_PAD, window.innerWidth - rect.right);
    setStyle({
      position: 'fixed',
      top,
      right,
      width: DROPDOWN_WIDTH,
      zIndex: 9999,
      visibility: 'visible',
    });
  }, [anchorEl]);

  useEffect(() => {
    if (!anchorEl) return;
    const dismiss = () => onCloseRef.current();
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [anchorEl]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest('[data-student-dropdown]') &&
        !target.closest('[data-student-trigger]')
      ) {
        onCloseRef.current();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // Keyboard navigation (Arrow / Tab / Escape)
  useEffect(() => {
    if (!anchorEl) return;

    const rafId = requestAnimationFrame(() => {
      const first = dropdownRef.current?.querySelector<HTMLElement>(
        'button:not([disabled])'
      );
      first?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!dropdownRef.current) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        (anchorEl as HTMLElement)?.focus();
        return;
      }
      const focusable = Array.from(
        dropdownRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled])'
        )
      );
      if (!focusable.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = focusable.indexOf(document.activeElement as HTMLElement);
        focusable[idx < focusable.length - 1 ? idx + 1 : 0]?.focus();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = focusable.indexOf(document.activeElement as HTMLElement);
        focusable[idx > 0 ? idx - 1 : focusable.length - 1]?.focus();
        return;
      }
      if (e.key === 'Tab') {
        const first2 = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first2) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first2?.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchorEl]);

  if (!anchorEl) return null;

  const menuItems = isClassInactive
    ? getMenuItems(isRevoked, studentEmail ? true : false, t, labels).map(
        (item) => ({
          ...item,
          disabled: true,
        })
      )
    : getMenuItems(isRevoked, studentEmail ? true : false, t, labels);

  return createPortal(
    <div
      ref={dropdownRef}
      style={style}
      data-student-dropdown="true"
      className="bg-white border border-gray-300 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
    >
      {menuItems.map(
        (item, index) =>
          !item.hide && (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                if (!item.disabled) onSelect(item.action, studentId);
              }}
              className={`
            w-full text-left px-5 py-3 text-sm font-normal transition-colors
            focus:outline-none focus-visible:bg-primary-100
            ${item.disabled ? 'text-gray-300 cursor-not-allowed' : item.danger ? 'text-red-500 hover:text-red-600 hover:bg-gray-50' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'}
            ${index !== menuItems.length - 1 ? 'border-b border-gray-100' : ''}
          `}
            >
              {item.label}
            </button>
          )
      )}
    </div>,
    document.body
  );
}

interface Props {
  classId: string;
  className: string;
  schoolName?: string;
  startDate?: string;
  endDate?: string;
  onStudentAdded: () => void;
  closeStudentMenu?: boolean;
  onStudentMenuOpen?: () => void;
  isClassInactive?: boolean;
  isStatus?: string;
  /** Ended classes can't take new students; inactive ones get a note. */
  availability?: ClassAvailability;
  defaultReportsStudentId?: string;
  defaultPinStudentId?: string;
}

export default function StudentSubTable({
  classId,
  className,
  schoolName,
  startDate,
  endDate,
  onStudentAdded,
  closeStudentMenu,
  onStudentMenuOpen,
  isClassInactive,
  isStatus,
  availability = 'open',
  defaultReportsStudentId,
  defaultPinStudentId,
}: Props) {
  const dispatch = useAppDispatch();
  const language = getStoredLanguage();
  const t = (language === 'es' ? loginEs : loginEn).studentSubtable;
  const { t: tRow } = useTranslation('classManagement');
  const { review } = useBulkReportReview();
  const reviewLabels: ReviewMenuLabels = {
    viewReports: tRow('rowActions.viewReport'),
    markAllReviewed: tRow('rowActions.markAllReviewed'),
    markAllUnreviewed: tRow('rowActions.markAllUnreviewed'),
  };
  // The roster scrolls with the app's native (orange) scrollbar; the gray overlay
  // indicator isn't used here because it sat above the pinned Set Up Guide.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const classReports = useAppSelector(selectClassReports);
  const educatorReports = useAppSelector(selectEducatorReports);
  const educatorReportsStatus = useAppSelector(selectEducatorReportsStatus);
  const allStudentCodes = useAppSelector(selectAllStudentCodes);
  const roster = useClassRoster(classId);
  const { t: tRoster } = useTranslation('classManagement', {
    keyPrefix: 'studentSubtable',
  });

  // The legacy shape the report matching and the row action modals take.
  const students = useMemo(
    () => roster.rows.map((row) => row.student),
    [roster.rows]
  );

  const uniqueStudentNames = useMemo(
    () => buildUniqueStudentNames(students),
    [students]
  );

  const reportsForClass = useMemo(() => {
    if (classReports.length > 0) return classReports;
    if (educatorReportsStatus !== 'succeeded' || educatorReports.length === 0) {
      return classReports;
    }

    const studentKeys = new Set<string>();
    for (const student of students) {
      const code = String(student.student_id ?? '')
        .trim()
        .toUpperCase();
      const normalized = normalizeStudentKey(code);
      if (code) studentKeys.add(code);
      if (normalized) studentKeys.add(normalized);
      const userId = String(student.id ?? '').trim();
      const userIdAlt = String(student.user_id ?? '').trim();
      if (userId) studentKeys.add(userId);
      if (userIdAlt) studentKeys.add(userIdAlt);
    }

    return educatorReports.filter((report) => {
      const rStudentId = String(report.student_id ?? '')
        .trim()
        .toUpperCase();
      const rStudentIdNorm = normalizeStudentKey(rStudentId);
      const rUserId = String(report.userId ?? '').trim();
      const rUserIdNorm = normalizeStudentKey(rUserId);
      return (
        (rStudentId && studentKeys.has(rStudentId)) ||
        (rStudentIdNorm && studentKeys.has(rStudentIdNorm)) ||
        (rUserId && studentKeys.has(rUserId)) ||
        (rUserIdNorm && studentKeys.has(rUserIdNorm))
      );
    });
  }, [classReports, educatorReports, educatorReportsStatus, students]);

  const [menuState, setMenuState] = useState<{
    studentId: string;
    anchor: HTMLElement;
  } | null>(null);
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [printStudent, setPrintStudent] = useState<Student | null>(null);
  const [regenerateStudent, setRegenerateStudent] = useState<Student | null>(
    null
  );
  const [revokeStudent, setRevokeStudent] = useState<Student | null>(null);
  const [pinnedStudentId, setPinnedStudentId] = useState<string | null>(null);
  const [pinnedPosition, setPinnedPosition] = useState<number>(-1);
  const [emailStudent, setEmailStudent] = useState<Student | null>(null);
  const subtablePdfGeneratorRef = useRef<(() => string | null) | null>(null);
  const [accessCodeStudent, setAccessCodeStudent] = useState<Student | null>(
    null
  );
  const [exportStudent, setExportStudent] = useState<Student | null>(null);
  const [reportsStudent, setReportsStudent] = useState<Student | null>(null);

  // Deep links: open or pin the target student. A target past the loaded rows
  // loads the next pages until it's found or the roster runs out (or a page
  // fails, so a broken request can't loop); only then is the link applied.
  const deepLinkAppliedRef = useRef(false);
  const {
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = roster;
  useEffect(() => {
    if (deepLinkAppliedRef.current || students.length === 0) return;
    const findStudent = (id: string | undefined) =>
      id ? students.find((s) => s.id === id || s.user_id === id) : undefined;
    const reportsMatch = findStudent(defaultReportsStudentId);
    const pinMatch = findStudent(defaultPinStudentId);
    const isTargetMissing =
      (!!defaultReportsStudentId && !reportsMatch) ||
      (!!defaultPinStudentId && !pinMatch);
    if (isTargetMissing && hasNextPage && !isFetchNextPageError) {
      if (!isFetchingNextPage) fetchNextPage();
      return;
    }
    deepLinkAppliedRef.current = true;
    if (reportsMatch) setReportsStudent(reportsMatch);
    if (pinMatch) setPinnedStudentId(String(pinMatch.id));
  }, [
    students,
    defaultReportsStudentId,
    defaultPinStudentId,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  ]);

  const headers: {
    label: string;
    field?: StudentSortField;
    centered?: boolean;
  }[] = [
    { label: t.headerStudentCode, field: StudentSortField.STUDENT_CODE },
    { label: t.headerStudentName, field: StudentSortField.NAME },
    {
      label: t.headerTimeSpent,
      field: StudentSortField.TIME_SPENT,
      centered: true,
    },
    {
      label: t.headerTimeRemaining,
      field: StudentSortField.TIME_REMAINING,
      centered: true,
    },
    {
      label: t.headerSimsCompleted,
      field: StudentSortField.SIMS_COMPLETED,
      centered: true,
    },
    { label: t.headerAvgScore, field: StudentSortField.SCORE, centered: true },
    {
      label: tRow('rowActions.reportsTranscripts'),
      field: StudentSortField.REPORTS,
      centered: true,
    },
    {
      label: tRow('rowActions.studentCodeStatus'),
      field: StudentSortField.CODE_STATUS,
      centered: true,
    },
    { label: t.headerActions, centered: true },
  ];

  // The header's accessible name and aria-sort carry its sort state.
  const getAriaSort = (field: StudentSortField) => {
    if (roster.sortField !== field || !roster.sortDirection) return 'none';
    return roster.sortDirection === 'asc' ? 'ascending' : 'descending';
  };
  const getSortStateLabel = (label: string, field: StudentSortField) =>
    tRow(`table.sortState.${getAriaSort(field)}`, { label });

  useEffect(() => {
    if (closeStudentMenu) setMenuState(null);
  }, [closeStudentMenu]);

  useEffect(() => {
    if (classReports.length > 0) return;
    if (educatorReportsStatus === 'succeeded' && educatorReports.length > 0)
      return;
    dispatch(GetClassSimulationReports({ classId }));
  }, [
    classId,
    classReports.length,
    dispatch,
    educatorReports.length,
    educatorReportsStatus,
  ]);

  const handleMenuAction = (action: string, studentId: string) => {
    setMenuState(null);
    const student = students.find((s) => String(s.id) === studentId) ?? null;
    if (!student) return;

    if (action === 'edit') {
      handleEditClick(student);
      return;
    }
    if (action === 'delete') {
      setEditingStudent(student);
      setShowDeleteConfirm(true);
      return;
    }
    if (action === 'print_access_code') {
      setPrintStudent(student);
      return;
    }
    if (action === 'regenerate_access_code') {
      setRegenerateStudent(student);
      return;
    }
    if (action === 'revoke_access_code') {
      setRevokeStudent(student);
      return;
    }
    if (action === 'email_reports') {
      setEmailStudent(student);
      return;
    }
    if (action === 'email_access_code') {
      setAccessCodeStudent(student);
      return;
    }
    if (action === 'export_reports') {
      setExportStudent(student);
      return;
    }
    if (action === 'view_reports') {
      setReportsStudent(student);
      return;
    }
    if (action === 'mark_all_reviewed' || action === 'mark_all_unreviewed') {
      if (!student.id) return;
      void review({
        type: SimulationReportSelectorType.STUDENT,
        ids: [student.id],
        reviewed: action === 'mark_all_reviewed',
        classId: student.class_id ?? classId,
      });
      return;
    }
  };
  // Server order; a student being edited stays where it was until the modal
  // closes, so the refetch after saving doesn't move it from under the user.
  const sortedRows = useMemo(() => {
    const rows = roster.rows;
    if (!pinnedStudentId || pinnedPosition === -1) return rows;
    const pinnedRow = rows.find((r) => r.id === pinnedStudentId);
    if (!pinnedRow) return rows;
    const without = rows.filter((r) => r.id !== pinnedStudentId);
    without.splice(Math.min(pinnedPosition, without.length), 0, pinnedRow);
    return without;
  }, [roster.rows, pinnedStudentId, pinnedPosition]);

  const getEmailReportSummaryForStudent = (student: Student) => {
    const toAttemptNumber = (value: unknown): number | null => {
      if (typeof value === 'number' && Number.isFinite(value))
        return Math.max(0, Math.trunc(value));
      if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return Math.max(0, Math.trunc(parsed));
      }
      return null;
    };

    const extractAttemptFromReport = (
      report: (typeof reportsForClass)[number]
    ): number | null => {
      const raw = report as unknown as Record<string, unknown>;
      const reportData =
        raw['report_data'] && typeof raw['report_data'] === 'object'
          ? (raw['report_data'] as Record<string, unknown>)
          : undefined;

      const candidates: unknown[] = [
        report.attempt,
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
    };

    const matches = reportsForClass.filter((r) =>
      reportMatchesStudent(student, r as unknown as Record<string, unknown>, {
        uniqueStudentNames,
      })
    );

    const byLatest = [...matches].sort((a, b) => {
      const aTs = new Date(
        a.scenarioEndTime ?? a.completed_at ?? a.created_at ?? 0
      ).getTime();
      const bTs = new Date(
        b.scenarioEndTime ?? b.completed_at ?? b.created_at ?? 0
      ).getTime();
      return bTs - aTs;
    });
    const latest = byLatest[0];
    const attemptFromBlob = matches.reduce((max, report) => {
      const v = extractAttemptFromReport(report);
      return v != null ? Math.max(max, v) : max;
    }, 0);

    const totalSecs = matches.reduce((sum, r) => {
      let t = r.totalTimeSeconds ?? 0;
      if (t > 86400) t = Math.round(t / 1000);
      return sum + t;
    }, 0);

    const formatTime = (secs: number): string => {
      if (secs <= 0) return '-';
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      if (h > 0) return `${h}h ${m}m`;
      if (m > 0) return `${m}m ${s}s`;
      return `${s}s`;
    };

    const rawScore = latest?.score ?? latest?.scoreJson?.overallScore ?? null;
    const normalizedScore =
      rawScore == null
        ? null
        : rawScore <= 1 && rawScore >= 0
          ? Math.round(rawScore * 100)
          : Math.round(rawScore);

    const reportKey = latest
      ? resolveStudentReportBlobId(latest as unknown as Record<string, unknown>)
      : '';
    const reportId =
      latest &&
      typeof (latest as unknown as Record<string, unknown>)['id'] === 'string'
        ? String((latest as unknown as Record<string, unknown>)['id'])
        : '';

    return {
      score: normalizedScore,
      attempt:
        attemptFromBlob > 0
          ? attemptFromBlob
          : matches.length > 0
            ? matches.length
            : null,
      time_spent: totalSecs > 0 ? formatTime(totalSecs) : null,
      sims_completed: matches.length > 0 ? String(matches.length) : null,
      scenario_title:
        latest?.scenarioTitle ??
        latest?.scenario_title ??
        latest?.simulation_name ??
        latest?.scenarioId ??
        null,
      report_key: reportKey || undefined,
      report_id: reportId || undefined,
    };
  };

  const handleEditClick = (student: Student) => {
    const position = sortedRows.findIndex((r) => r.id === String(student.id));
    setEditingStudent(student);
    setPinnedStudentId(String(student.id));
    setPinnedPosition(position);
    setMenuState(null);
  };

  const handleModalClose = () => {
    setIsAddStudentOpen(false);
    setEditingStudent(null);
    setShowDeleteConfirm(false);
    setPinnedStudentId(null);
    setPinnedPosition(-1);
  };

  const showName = sortedRows.some((row) => row.name !== '');
  const visibleColCount = 8 + (showName ? 1 : 0);
  const menuRow = menuState
    ? sortedRows.find((row) => row.id === menuState.studentId)
    : undefined;

  const renderRow = (row: ClassRosterRow) => (
    <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-4 py-3 font-medium text-sm text-left whitespace-nowrap">
        <span className="text-gray-700 font-semibold" title={row.studentCode}>
          {row.studentCode}
        </span>
      </td>
      {showName && (
        <td className="px-4 py-3 text-sm text-left text-gray-700">
          <span className="block truncate" title={row.name || undefined}>
            {row.name || '-'}
          </span>
        </td>
      )}
      <td className="px-4 py-3 text-sm text-gray-500 text-center whitespace-nowrap">
        {row.timeSpent}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 text-center whitespace-nowrap">
        {row.timeRemaining}
      </td>
      <td className="px-4 py-3 text-sm text-center whitespace-nowrap">
        <span
          className={
            row.hasCompletedSims
              ? 'text-green-600 font-semibold'
              : 'text-gray-500'
          }
        >
          {row.simsCompleted}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500 text-center whitespace-nowrap">
        {row.avgScore}
      </td>
      <td className="px-4 py-3 text-center">
        <button
          type="button"
          onClick={() => setReportsStudent(row.student)}
          className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-50 border border-gray-200 text-gray-600 text-xs rounded-full font-medium hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
        >
          {tRow('rowActions.reportsTranscripts')}
        </button>
      </td>
      <td className="px-4 py-3 text-center">
        {row.isCodeRevoked ? (
          <StatusBadge
            tone="danger"
            label={tRow('rowActions.codeRevoked')}
            className={cn(codeStatusBadgeClassName, 'bg-red-100 text-red-800')}
          />
        ) : (
          <StatusBadge
            tone="success"
            label={tRow('rowActions.codeActive')}
            className={cn(
              codeStatusBadgeClassName,
              'bg-green-100 text-green-800'
            )}
          />
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <button
          type="button"
          data-student-trigger="true"
          aria-label={t.headerActions}
          aria-haspopup="menu"
          aria-expanded={menuState?.studentId === row.id}
          onClick={(e) => {
            e.stopPropagation();
            onStudentMenuOpen?.();
            const anchor = e.currentTarget as HTMLElement;
            setMenuState(
              menuState?.studentId === row.id
                ? null
                : { studentId: row.id, anchor }
            );
          }}
          className="text-gray-400 hover:text-gray-600 text-lg font-bold tracking-widest px-2 py-1 rounded hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
        >
          ···
        </button>
      </td>
    </tr>
  );

  /** Loading placeholders: the student code column, then centred bars. */
  const renderSkeletonRows = (count: number, label: string) => (
    <SkeletonRows
      rows={count}
      columns={Array.from({ length: visibleColCount }, (_, j) => ({
        barClassName: j === 0 ? undefined : 'w-1/2 mx-auto',
      }))}
      label={label}
      rowClassName="border-t border-gray-100"
      cellClassName="px-4 py-4"
    />
  );

  const renderStateRow = (content: React.ReactNode) => (
    <tr>
      <td
        colSpan={visibleColCount}
        className="text-center py-6 text-gray-400 text-xs"
      >
        {content}
      </td>
    </tr>
  );

  return (
    <div className="px-4 pt-3 pb-4 transition-opacity duration-150 ease-out">
      {/* `relative` keeps absolutely positioned content (the footer's sr-only
          status) inside this scroller; otherwise it sits below the box and
          stretches the class list. */}
      <div
        ref={scrollContainerRef}
        className="relative overflow-x-auto overflow-y-auto max-h-[400px] border border-gray-200 rounded-xl"
        style={{ scrollbarGutter: 'stable' }}
      >
        <table
          className="w-full table-fixed text-sm"
          style={{ minWidth: '900px' }}
        >
          <colgroup>
            <col className={showName ? 'w-[11%]' : 'w-[13%]'} />
            {showName && <col className="w-[17%]" />}
            <col className={showName ? 'w-[13%]' : 'w-[16%]'} />
            <col className={showName ? 'w-[14%]' : 'w-[18%]'} />
            <col className={showName ? 'w-[13%]' : 'w-[17%]'} />
            <col className="w-[12%]" />
            <col className={showName ? 'w-[11%]' : 'w-[13%]'} />
            <col className="w-[11%]" />
            <col className={showName ? 'w-[9%]' : 'w-[11%]'} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-[#5a6475]">
            <tr className="bg-[#5a6475] text-white text-left">
              {headers.map(({ label, field, centered }) =>
                !showName && field === StudentSortField.NAME ? null : (
                  <th
                    key={label}
                    scope="col"
                    title={label}
                    aria-sort={field ? getAriaSort(field) : undefined}
                    className={`px-4 py-2.5 font-semibold text-sm ${
                      centered ? 'text-center' : 'text-left'
                    }`}
                  >
                    {field ? (
                      <div
                        className={`flex w-full ${
                          centered ? 'justify-center' : 'justify-start'
                        }`}
                      >
                        <SortableHeader
                          label={label}
                          field={field}
                          focusable
                          ariaLabel={getSortStateLabel(label, field)}
                          sortField={roster.sortField}
                          sortDirection={roster.sortDirection}
                          onSort={() => roster.handleSort(field)}
                        />
                      </div>
                    ) : (
                      label
                    )}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {roster.isLoading
              ? renderSkeletonRows(
                  SKELETON_INITIAL_ROW_COUNT,
                  tRoster('loadingStudents')
                )
              : roster.hasLoadFailed
                ? renderStateRow(
                    <LoadErrorMessage
                      message={tRoster('loadFailed')}
                      onRetry={roster.refetch}
                    />
                  )
                : roster.isEmpty
                  ? renderStateRow(tRoster('noStudents'))
                  : sortedRows.map(renderRow)}
            {roster.isFetchingNextPage &&
              renderSkeletonRows(
                SKELETON_REFETCH_ROW_COUNT,
                tRow('table.loadingMore')
              )}
          </tbody>
        </table>
        {sortedRows.length > 0 && (
          <InfiniteListFooter
            key={JSON.stringify(roster.queryArg)}
            itemCount={sortedRows.length}
            hasNextPage={roster.hasNextPage}
            isFetchingNextPage={roster.isFetchingNextPage}
            isFetchNextPageError={roster.isFetchNextPageError}
            fetchNextPage={roster.fetchNextPage}
            isRefreshError={roster.isRefreshError}
            refetch={roster.refetch}
            endMessage={tRoster('endOfStudents')}
            loadedMoreMessage={(count) =>
              tRoster('loadedMoreStudents', { count })
            }
            scrollRootRef={scrollContainerRef}
            shouldShowLoadingMessage={false}
          />
        )}
      </div>

      {menuState && (
        <PortalDropdown
          anchorEl={menuState.anchor}
          studentId={menuState.studentId}
          isRevoked={menuRow?.isCodeRevoked ?? false}
          studentEmail={menuRow?.student.email}
          onClose={() => setMenuState(null)}
          onSelect={handleMenuAction}
          isClassInactive={isClassInactive}
          t={t}
          labels={reviewLabels}
        />
      )}

      {isStatus === 'ARCHIEVED' ? null : (
        <div className="flex justify-center mt-3">
          <ClassAvailabilityTip
            availability={availability}
            endedTip={tRow('classAvailability.endedAddStudent')}
          >
            <Button
              type="button"
              variant="gradient"
              disabled={availability === 'ended'}
              onClick={() =>
                !isClassInactive &&
                availability !== 'ended' &&
                setIsAddStudentOpen(true)
              }
              className={cn(
                'h-auto px-5 py-2.5 text-sm shadow-md transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2',
                isClassInactive && 'cursor-not-allowed hover:opacity-100'
              )}
            >
              ＋ {t.addStudent}
            </Button>
          </ClassAvailabilityTip>
        </div>
      )}

      <StudentModal
        isOpen={isAddStudentOpen || !!editingStudent || showDeleteConfirm}
        onClose={handleModalClose}
        classId={classId}
        className={className}
        onSuccess={() => {
          onStudentAdded();
        }}
        editStudent={editingStudent}
        initialShowDelete={showDeleteConfirm}
        existingCodes={allStudentCodes}
      />

      <PrintAccessCodeModal
        isOpen={!!printStudent}
        onClose={() => setPrintStudent(null)}
        className={className}
        student={
          printStudent
            ? {
                studentName: printStudent.student_name ?? '',
                accessCode: printStudent.student_id ?? '',
              }
            : undefined
        }
      />

      <RegenerateAccessCodeModal
        isOpen={!!regenerateStudent}
        onClose={() => setRegenerateStudent(null)}
        studentId={regenerateStudent?.id ?? ''}
        studentName={regenerateStudent?.student_name ?? ''}
        currentCode={regenerateStudent?.student_id ?? null}
        onSuccess={onStudentAdded}
      />

      <RevokeAccessCodeModal
        isOpen={!!revokeStudent}
        onClose={() => setRevokeStudent(null)}
        studentId={revokeStudent?.id ?? ''}
        studentName={revokeStudent?.student_name ?? ''}
        currentCode={revokeStudent?.student_id ?? null}
        onSuccess={onStudentAdded}
      />

      {emailStudent &&
        (() => {
          const reportSummary = getEmailReportSummaryForStudent(emailStudent);
          return (
            <>
              {/* Hidden StudentReportView loads the report in the background so the
                PDF generator is ready before the user clicks Send. */}
              {reportSummary.report_key && (
                <div
                  className="hidden"
                  aria-hidden="true"
                  style={{ display: 'none' }}
                >
                  <StudentReportView
                    reportId={reportSummary.report_key}
                    variant="educator"
                    onRegisterPdfGenerator={(fn) => {
                      subtablePdfGeneratorRef.current = fn;
                    }}
                  />
                </div>
              )}
              <StudentEmailReportModal
                student={{
                  student_id: emailStudent.id ?? '',
                  student_name: emailStudent.student_name,
                  email: emailStudent.email,
                  class_id: emailStudent.class_id ?? classId,
                  score: reportSummary.score,
                  attempt: reportSummary.attempt,
                  time_spent: reportSummary.time_spent,
                  sims_completed: reportSummary.sims_completed,
                  scenario_title: reportSummary.scenario_title,
                  last_sent_date: emailStudent.submission_date,
                }}
                report_id={reportSummary.report_id}
                report_key={reportSummary.report_key}
                report_type="assessment"
                pdfGeneratorFn={() =>
                  subtablePdfGeneratorRef.current?.() ?? null
                }
                onClose={() => {
                  setEmailStudent(null);
                  subtablePdfGeneratorRef.current = null;
                }}
              />
            </>
          );
        })()}

      {accessCodeStudent &&
        (() => {
          return (
            <StudentEmailAccessCodeModal
              student={{
                id: accessCodeStudent.id ?? '',
                student_id: accessCodeStudent.student_id ?? '',
                student_name: accessCodeStudent.student_name,
                email: accessCodeStudent.email,
                class_id: accessCodeStudent.class_id ?? classId,
              }}
              onClose={() => setAccessCodeStudent(null)}
            />
          );
        })()}

      {reportsStudent && (
        <StudentReportsModal
          studentId={reportsStudent.id ?? ''}
          studentName={reportsStudent.student_name ?? ''}
          studentCode={reportsStudent.student_id ?? '—'}
          studentEmail={reportsStudent.email ?? undefined}
          classId={reportsStudent.class_id ?? classId}
          className={className}
          schoolName={schoolName}
          onClose={() => setReportsStudent(null)}
        />
      )}

      {exportStudent && (
        <ExportReportModal
          source={{
            type: 'class',
            classId: exportStudent.class_id ?? classId,
            className: className,
            startDate: startDate ?? '',
            endDate: endDate ?? '',
          }}
          students={[exportStudent]}
          onClose={() => setExportStudent(null)}
        />
      )}
    </div>
  );
}
