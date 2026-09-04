import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { resolveStudentReportBlobId } from "../../../api/resolveStudentReportBlobId";
import loginEn from "../../../locales/auth/login/en.json";
import loginEs from "../../../locales/auth/login/es.json";

type SupportedLang = "en" | "es";
const LANGUAGE_STORAGE_KEY = "app_language";
const getStoredLanguage = (): SupportedLang => {
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === "es" ? "es" : "en";
};

import ExportReportModal from "../../../components/class/simulation/ExportReportModal";
import StudentEmailAccessCodeModal from "../../../components/class/student/StudentEmailAccessCodeModal";
import StudentEmailReportModal from "../../../components/class/student/StudentEmailReportModal";
import StudentReportsModal from "../../../components/class/student/StudentReportsModal";
import StudentReportView from "../../../student-reports/StudentReportView";
import {
  selectSyncedSimsCompleted,
  GetClassSimulationReports,
  selectClassReports,
  MarkReportViewed,
} from "../../../redux/class/SimsCompletedreportsRedux";
import {
  selectEducatorReports,
  selectEducatorReportsStatus,
} from "../../../redux/reports/EducatorReportsRedux";
import {
  selectAllStudentCodes,
  selectViewedReportIds,
  isReportNew,
  markReportUnviewed,
} from "../../../redux/class/GetClassRedux";
import { selectSimulationsByClassId } from "../../../redux/class/GetSimsRedux";
import { isAISimulation } from "../../../utils/simulationType";
import StatusPill from "../../common/StatusPill";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import type { Student, StudentRow } from "../../../types";
import { useSelector } from "react-redux";
import PrintAccessCodeModal from "../PrintAccessCode";
import RegenerateAccessCodeModal from "./RegenerateAccessCodeModal";
import RevokeAccessCodeModal from "./RevokeAccessCodeModal";
import StudentModal from "./StudentModal";
import SortableHeader from "../../common/SortableHeader";
import {
  buildUniqueStudentNames,
  normalizeStudentKey,
  reportMatchesStudent,
} from "../../../utils/matchStudentReport";

const getMenuItems = (
  isRevoked: boolean,
  isEmail: boolean,
  t: typeof loginEn.studentSubtable,
) => [
  // {
  //   label: t.menuEditStudent,
  //   action: "edit",
  //   danger: false,
  //   disabled: false,
  // },

  {
    label: t.menuEmailCode,
    action: "email_access_code",
    danger: false,
    disabled: isRevoked,
    hide: !isEmail,
  },
  {
    label: t.menuPrintCode,
    action: "print_access_code",
    danger: false,
    disabled: isRevoked,
  },
  {
    label: t.menuRegenerateCode,
    action: "regenerate_access_code",
    danger: false,
    disabled: false,
  },
  {
    label: t.menuRevokeCode,
    action: "revoke_access_code",
    danger: false,
    disabled: isRevoked,
  },
  {
    label: t.menuViewReports,
    action: "view_reports",
    danger: false,
    disabled: false,
  },
  {
    label: t.menuEmailReports,
    action: "email_reports",
    danger: false,
    disabled: false,
    hide: !isEmail,
  },
  {
    label: t.menuExportReports,
    action: "export_reports",
    danger: false,
    disabled: false,
  },
  {
    label: "Mark All Reports Reviewed",
    action: "mark_all_reviewed",
    danger: false,
    disabled: false,
  },
  {
    label: "Mark All Reports Unreviewed",
    action: "mark_all_unreviewed",
    danger: false,
    disabled: false,
  },
  {
    label: t.menuDeleteStudent,
    action: "delete",
    danger: true,
    disabled: false,
  },
];

const isStudentRevoked = (student: Student | undefined) => !student?.student_id;

function PortalDropdown({
  anchorEl,
  onClose,
  onSelect,
  studentId,
  isRevoked,
  studentEmail,
  isClassInactive,
  t,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onSelect: (action: string, studentId: string) => void;
  studentId: string;
  studentEmail: string | null | undefined;
  isRevoked: boolean;
  isClassInactive?: boolean;
  t: typeof loginEn.studentSubtable;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Stable ref so effects never go stale and don't need onClose in their deps
  const onCloseRef = useRef(onClose);
  // Render hidden off-screen at full width first so we can measure actual height
  const [style, setStyle] = useState<React.CSSProperties>({
    position: "fixed",
    visibility: "hidden",
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
      position: "fixed",
      top,
      right,
      width: DROPDOWN_WIDTH,
      zIndex: 9999,
      visibility: "visible",
    });
  }, [anchorEl]);

  useEffect(() => {
    if (!anchorEl) return;
    const dismiss = () => onCloseRef.current();
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [anchorEl]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        !target.closest("[data-student-dropdown]") &&
        !target.closest("[data-student-trigger]")
      ) {
        onCloseRef.current();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  // Keyboard navigation (Arrow / Tab / Escape)
  useEffect(() => {
    if (!anchorEl) return;

    const rafId = requestAnimationFrame(() => {
      const first = dropdownRef.current?.querySelector<HTMLElement>(
        "button:not([disabled])",
      );
      first?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!dropdownRef.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        (anchorEl as HTMLElement)?.focus();
        return;
      }
      const focusable = Array.from(
        dropdownRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled])",
        ),
      );
      if (!focusable.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const idx = focusable.indexOf(document.activeElement as HTMLElement);
        focusable[idx < focusable.length - 1 ? idx + 1 : 0]?.focus();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const idx = focusable.indexOf(document.activeElement as HTMLElement);
        focusable[idx > 0 ? idx - 1 : focusable.length - 1]?.focus();
        return;
      }
      if (e.key === "Tab") {
        const first2 = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first2) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first2.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorEl]);

  if (!anchorEl) return null;

  const menuItems = isClassInactive
    ? getMenuItems(isRevoked, studentEmail ? true : false, t).map((item) => ({
        ...item,
        disabled: true,
      }))
    : getMenuItems(isRevoked, studentEmail ? true : false, t);

  return createPortal(
    <div
      ref={dropdownRef}
      style={style}
      data-student-dropdown="true"
      className="bg-white border border-gray-300 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
    >
      {menuItems.map(
        (item) =>
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
            ${item.disabled ? "text-gray-300 cursor-not-allowed" : item.danger ? "text-red-500 hover:text-red-600 hover:bg-gray-50" : "text-gray-700 hover:text-gray-900 hover:bg-gray-50"}
            ${item.danger ? "border-t border-gray-100" : ""}
          `}
            >
              {item.label}
            </button>
          ),
      )}
    </div>,
    document.body,
  );
}

interface Props {
  classId: string;
  className: string;
  startDate?: string;
  endDate?: string;
  students: Student[];
  onStudentAdded: () => void;
  closeStudentMenu?: boolean;
  onStudentMenuOpen?: () => void;
  isClassInactive?: boolean;
  isStatus?: string;
  defaultReportsStudentId?: string;
  defaultPinStudentId?: string;
}

export default function StudentSubTable({
  classId,
  className,
  students,
  startDate,
  endDate,
  onStudentAdded,
  closeStudentMenu,
  onStudentMenuOpen,
  isClassInactive,
  isStatus,
  defaultReportsStudentId,
  defaultPinStudentId,
}: Props) {
  const dispatch = useAppDispatch();
  const language = getStoredLanguage();
  const t = (language === "es" ? loginEs : loginEn).studentSubtable;
  const syncedSimsCompleted = useSelector(selectSyncedSimsCompleted);
  const classReports = useAppSelector(selectClassReports);
  const educatorReports = useAppSelector(selectEducatorReports);
  const viewedReportIds = useAppSelector(selectViewedReportIds);
  const educatorReportsStatus = useAppSelector(selectEducatorReportsStatus);
  const allStudentCodes = useAppSelector(selectAllStudentCodes);
  const displayStudents = students;
  // Avatar-based (AI) simulations charge avatar-hours (40h cap per student code);
  // only then does "Time Remaining" apply — otherwise the column shows "-".
  const classSims = useAppSelector(selectSimulationsByClassId(classId));
  const hasAvatarSim = useMemo(
    () =>
      (classSims ?? []).some((sim) =>
        isAISimulation((sim as { avatarEnabled?: boolean }).avatarEnabled),
      ),
    [classSims],
  );

  const uniqueStudentNames = useMemo(
    () => buildUniqueStudentNames(displayStudents),
    [displayStudents],
  );

  const reportsForClass = useMemo(() => {
    if (classReports.length > 0) return classReports;
    if (educatorReportsStatus !== "succeeded" || educatorReports.length === 0) {
      return classReports;
    }

    const studentKeys = new Set<string>();
    for (const student of students) {
      const code = String(student.student_id ?? "")
        .trim()
        .toUpperCase();
      const normalized = normalizeStudentKey(code);
      if (code) studentKeys.add(code);
      if (normalized) studentKeys.add(normalized);
      const userId = String(student.id ?? "").trim();
      const userIdAlt = String(student.user_id ?? "").trim();
      if (userId) studentKeys.add(userId);
      if (userIdAlt) studentKeys.add(userIdAlt);
    }

    return educatorReports.filter((report) => {
      const rStudentId = String(report.student_id ?? "")
        .trim()
        .toUpperCase();
      const rStudentIdNorm = normalizeStudentKey(rStudentId);
      const rUserId = String(report.userId ?? "").trim();
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
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(
    null,
  );
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [printStudent, setPrintStudent] = useState<Student | null>(null);
  const [regenerateStudent, setRegenerateStudent] = useState<Student | null>(
    null,
  );
  const [revokeStudent, setRevokeStudent] = useState<Student | null>(null);
  const [pinnedStudentId, setPinnedStudentId] = useState<string | null>(null);
  const [pinnedPosition, setPinnedPosition] = useState<number>(-1);
  const [emailStudent, setEmailStudent] = useState<Student | null>(null);
  const subtablePdfGeneratorRef = useRef<(() => string | null) | null>(null);
  const [accessCodeStudent, setAccessCodeStudent] = useState<Student | null>(
    null,
  );
  const [exportStudent, setExportStudent] = useState<Student | null>(null);
  const [reportsStudent, setReportsStudent] = useState<Student | null>(null);

  useEffect(() => {
    if (!defaultReportsStudentId || reportsStudent) return;
    const match = students.find(
      (s) =>
        s.id === defaultReportsStudentId ||
        s.user_id === defaultReportsStudentId,
    );
    if (match) setReportsStudent(match);
  }, []);

  useEffect(() => {
    if (!defaultPinStudentId) return;
    const match = students.find(
      (s) => s.id === defaultPinStudentId || s.user_id === defaultPinStudentId,
    );
    if (match) setPinnedStudentId(String(match.id));
  }, []);

  const headers = [
    { label: t.headerStudentCode, field: "student_code" },
    { label: t.headerStudentName, field: "student_name" },
    { label: t.headerEmail, field: "email" },
    { label: t.headerTimeSpent, field: "timeSpent" },
    { label: t.headerTimeRemaining, field: "timeRemaining" },
    { label: t.headerSimsCompleted, field: "simsCompleted" },
    { label: t.headerAvgScore, field: "avgScore" },
    { label: t.headerReports, field: "reports" },
    { label: "Student Code Status", field: "codeStatus" },
    { label: t.headerActions, field: "" },
  ];

  useEffect(() => {
    if (closeStudentMenu) setMenuState(null);
  }, [closeStudentMenu]);

  useEffect(() => {
    if (classReports.length > 0) return;
    if (educatorReportsStatus === "succeeded" && educatorReports.length > 0)
      return;
    dispatch(GetClassSimulationReports({ classId }));
  }, [
    classId,
    classReports.length,
    dispatch,
    educatorReports.length,
    educatorReportsStatus,
  ]);

  const handleSort = (field: string) => {
    if (sortField === field)
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleMenuAction = (action: string, studentId: string) => {
    setMenuState(null);
    const student =
      (displayStudents as Student[]).find((s) => String(s.id) === studentId) ??
      students.find((s) => String(s.id) === studentId) ??
      null;
    if (!student) return;

    if (action === "edit") {
      handleEditClick(student);
      return;
    }
    if (action === "delete") {
      setEditingStudent(student);
      setShowDeleteConfirm(true);
      return;
    }
    if (action === "print_access_code") {
      setPrintStudent(student);
      return;
    }
    if (action === "regenerate_access_code") {
      setRegenerateStudent(student);
      return;
    }
    if (action === "revoke_access_code") {
      setRevokeStudent(student);
      return;
    }
    if (action === "email_reports") {
      setEmailStudent(student);
      return;
    }
    if (action === "email_access_code") {
      setAccessCodeStudent(student);
      return;
    }
    if (action === "export_reports") {
      setExportStudent(student);
      return;
    }
    if (action === "view_reports") {
      setReportsStudent(student);
      return;
    }
    if (action === "mark_all_reviewed" || action === "mark_all_unreviewed") {
      const ids = reportsForClass
        .filter((r) =>
          reportMatchesStudent(
            student,
            r as unknown as Record<string, unknown>,
            { uniqueStudentNames },
          ),
        )
        .map((r) => r.id)
        .filter((id): id is string => Boolean(id));
      if (ids.length) {
        if (action === "mark_all_reviewed") {
          void dispatch(MarkReportViewed({ reportId: ids, classId }));
        } else {
          dispatch(markReportUnviewed({ reportId: ids, classId }));
        }
      }
      return;
    }
  };
  const reportsStudentReports = useMemo(() => {
    if (!reportsStudent) return undefined;
    return reportsForClass.filter((r) =>
      reportMatchesStudent(
        reportsStudent,
        r as unknown as Record<string, unknown>,
        { uniqueStudentNames },
      ),
    );
  }, [reportsStudent, reportsForClass, uniqueStudentNames]);

  const sortedRows = useMemo((): (StudentRow & {
    _original: Student;
    _index: number;
    hasUnread: boolean;
  })[] => {
    const stableStudents = ([...displayStudents] as Student[]).sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
    );

    const rows = stableStudents.map((s, index) => {
      const runtimeStudent = s as Student & {
        studentName?: string | null;
        student_email?: string | null;
      };
      const simsCompleted =
        s.id && syncedSimsCompleted[String(s.id)] !== undefined
          ? String(syncedSimsCompleted[String(s.id)])
          : (s.sims_completed ?? "-");
      const studentReports = reportsForClass.filter((r) =>
        reportMatchesStudent(s, r as unknown as Record<string, unknown>, {
          uniqueStudentNames,
        }),
      );

      const derivedSimsCompleted =
        studentReports.length > 0
          ? String(studentReports.length)
          : simsCompleted;

      const totalSecs = studentReports.reduce((sum, r) => {
        let t = r.totalTimeSeconds ?? 0;
        if (t > 86400) t = Math.round(t / 1000);
        return sum + t;
      }, 0);

      const formatTime = (secs: number): string => {
        if (secs <= 0) return "-";
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
      };

      const computedTimeSpent =
        totalSecs > 0 ? formatTime(totalSecs) : (s.time_spent ?? "-");

      const scores = studentReports
        .map((r) => {
          const raw = r.score ?? r.scoreJson?.overallScore ?? null;
          if (raw === null) return null;
          // Normalize 0–1 decimals to 0–100
          return raw <= 1 && raw >= 0 ? Math.round(raw * 100) : Math.round(raw);
        })
        .filter((v): v is number => v !== null);
      const sScore = (s as Student).score;
      const computedAvgScore =
        scores.length > 0
          ? `${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}%`
          : sScore && sScore > 0
            ? `${sScore}%`
            : "-";

      const enrichedName = s.student_name ?? runtimeStudent.studentName ?? "-";
      const enrichedEmail = s.email ?? runtimeStudent.student_email ?? "-";

      const hasUnread = studentReports.some((r) =>
        isReportNew(r.id, r.isNew, viewedReportIds),
      );

      return {
        _original: s,
        _index: index,
        hasUnread,
        student_code: s.student_id ?? "---",
        student_name: enrichedName ?? "-",
        email: enrichedEmail ?? "-",
        timeSpent: computedTimeSpent,
        timeRemaining: (() => {
          // Only avatar-based (AI) assignments consume avatar-hours; without one,
          // there is no time-remaining to show.
          if (!hasAvatarSim) return "-";
          const DEFAULT_TOTAL_SECS = 40 * 3600; // 40 hours per student code (avatar cap)
          const raw = (s as Student).time_remaining;
          // If API provides the value, parse and format it
          if (raw != null && raw !== "" && raw !== "-") {
            const mins = Number(raw);
            if (!isNaN(mins) && mins > 0) {
              const remainSecs = mins * 60;
              const h = Math.floor(remainSecs / 3600);
              const m = Math.floor((remainSecs % 3600) / 60);
              if (h > 0 && m > 0) return `${h}h ${m}m`;
              if (h > 0) return `${h}h`;
              return `${m}m`;
            }
            // Already formatted string (e.g. "6h 40m")
            if (isNaN(Number(raw))) return raw;
          }
          // Compute from default 400h allocation minus time spent
          const remainSecs = DEFAULT_TOTAL_SECS - totalSecs;
          if (remainSecs <= 0) return "0m";
          const h = Math.floor(remainSecs / 3600);
          const m = Math.floor((remainSecs % 3600) / 60);
          if (h > 0 && m > 0) return `${h}h ${m}m`;
          if (h > 0) return `${h}h`;
          return `${m}m`;
        })(),
        simsCompleted: derivedSimsCompleted,
        avgScore: computedAvgScore,
        reports: "",
      };
    });

    const sorted =
      !sortField || !sortDirection
        ? [...rows].sort((a, b) => {
            const aTime = a._original.created_at
              ? new Date(
                  a._original.created_at as string | number | Date,
                ).getTime()
              : 0;
            const bTime = b._original.created_at
              ? new Date(
                  b._original.created_at as string | number | Date,
                ).getTime()
              : 0;
            if (aTime < bTime) return 1;
            if (aTime > bTime) return -1;
            return a._index - b._index;
          })
        : [...rows].sort((a, b) => {
            // Reports/Transcripts sorts by unread-report status; Student Code
            // Status sorts by active vs revoked.
            if (sortField === "reports") {
              const av = a.hasUnread ? 1 : 0;
              const bv = b.hasUnread ? 1 : 0;
              if (av !== bv) return sortDirection === "asc" ? av - bv : bv - av;
              return a._index - b._index;
            }
            if (sortField === "codeStatus") {
              const av = isStudentRevoked(a._original) ? 1 : 0;
              const bv = isStudentRevoked(b._original) ? 1 : 0;
              if (av !== bv) return sortDirection === "asc" ? av - bv : bv - av;
              return a._index - b._index;
            }
            const aVal = a[sortField as keyof StudentRow] ?? "";
            const bVal = b[sortField as keyof StudentRow] ?? "";
            if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
            if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
            return a._index - b._index;
          });

    if (!pinnedStudentId || pinnedPosition === -1) return sorted;
    const pinnedRow = sorted.find(
      (r) => String(r._original.id) === pinnedStudentId,
    );
    if (!pinnedRow) return sorted;
    const without = sorted.filter(
      (r) => String(r._original.id) !== pinnedStudentId,
    );
    const insertAt = Math.min(pinnedPosition, without.length);
    without.splice(insertAt, 0, pinnedRow);
    return without;
  }, [
    displayStudents,
    sortField,
    sortDirection,
    pinnedStudentId,
    pinnedPosition,
    syncedSimsCompleted,
    reportsForClass,
    uniqueStudentNames,
    hasAvatarSim,
    viewedReportIds,
  ]);

  const getEmailReportSummaryForStudent = (student: Student) => {
    const toAttemptNumber = (value: unknown): number | null => {
      if (typeof value === "number" && Number.isFinite(value))
        return Math.max(0, Math.trunc(value));
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return Math.max(0, Math.trunc(parsed));
      }
      return null;
    };

    const extractAttemptFromReport = (
      report: (typeof reportsForClass)[number],
    ): number | null => {
      const raw = report as unknown as Record<string, unknown>;
      const reportData =
        raw["report_data"] && typeof raw["report_data"] === "object"
          ? (raw["report_data"] as Record<string, unknown>)
          : undefined;

      const candidates: unknown[] = [
        report.attempt,
        raw["attempt"],
        raw["attempts"],
        raw["attempt_count"],
        raw["attempts_count"],
        raw["attemptNo"],
        raw["attempt_no"],
        raw["attemptNumber"],
        reportData?.["attempt"],
        reportData?.["attempts"],
        reportData?.["attempt_count"],
        reportData?.["attempts_count"],
        reportData?.["attemptNo"],
        reportData?.["attempt_no"],
        reportData?.["attemptNumber"],
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
      }),
    );

    const byLatest = [...matches].sort((a, b) => {
      const aTs = new Date(
        a.scenarioEndTime ?? a.completed_at ?? a.created_at ?? 0,
      ).getTime();
      const bTs = new Date(
        b.scenarioEndTime ?? b.completed_at ?? b.created_at ?? 0,
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
      if (secs <= 0) return "-";
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
      : "";
    const reportId =
      latest &&
      typeof (latest as unknown as Record<string, unknown>)["id"] === "string"
        ? String((latest as unknown as Record<string, unknown>)["id"])
        : "";

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

  const getStudentRowKey = (
    row: StudentRow & { _original: Student; _index: number },
  ) => {
    const idKey = row._original.id ? String(row._original.id) : "";
    if (idKey) return idKey;
    const codeKey = row._original.student_id
      ? String(row._original.student_id)
      : "";
    const nameKey = row._original.student_name
      ? String(row._original.student_name)
      : "";
    return `${codeKey}|${nameKey}|${row._index}`;
  };

  const handleEditClick = (student: Student) => {
    const currentRows = sortedRows;
    const position = currentRows.findIndex(
      (r) => String(r._original.id) === String(student.id),
    );
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

  // Students are not paginated — every roster row renders.
  const pagedRows = sortedRows;

  const showName =
    pagedRows.length > 0 &&
    !!pagedRows[0].student_name &&
    pagedRows[0].student_name !== "-";
  const showEmail =
    pagedRows.length > 0 && !!pagedRows[0].email && pagedRows[0].email !== "-";
  const visibleColCount = 8 + (showName ? 1 : 0) + (showEmail ? 1 : 0);

  return (
    <div className="px-4 pt-3 pb-4 transition-opacity duration-150 ease-out">
      <div
        className="overflow-x-auto overflow-y-auto max-h-[400px] border border-gray-200 rounded-xl"
        style={{ scrollbarGutter: "stable" }}
      >
        <table
          className="w-full table-fixed text-sm"
          style={{ minWidth: "780px" }}
        >
          <colgroup>
            <col
              className={
                showName && showEmail
                  ? "w-[10%]"
                  : showName || showEmail
                    ? "w-[11%]"
                    : "w-[13%]"
              }
            />
            {showName && <col className={showEmail ? "w-[14%]" : "w-[17%]"} />}
            {showEmail && <col className={showName ? "w-[15%]" : "w-[17%]"} />}
            <col
              className={
                showName && showEmail
                  ? "w-[10%]"
                  : showName || showEmail
                    ? "w-[13%]"
                    : "w-[16%]"
              }
            />
            <col
              className={
                showName && showEmail
                  ? "w-[12%]"
                  : showName || showEmail
                    ? "w-[14%]"
                    : "w-[18%]"
              }
            />
            <col
              className={
                showName && showEmail
                  ? "w-[11%]"
                  : showName || showEmail
                    ? "w-[13%]"
                    : "w-[17%]"
              }
            />
            <col
              className={
                showName && showEmail
                  ? "w-[10%]"
                  : showName || showEmail
                    ? "w-[12%]"
                    : "w-[12%]"
              }
            />
            <col
              className={
                showName && showEmail
                  ? "w-[9%]"
                  : showName || showEmail
                    ? "w-[11%]"
                    : "w-[13%]"
              }
            />
            {/* Student Code Status */}
            <col
              className={
                showName && showEmail
                  ? "w-[9%]"
                  : showName || showEmail
                    ? "w-[10%]"
                    : "w-[12%]"
              }
            />
            {/* Actions */}
            <col
              className={
                showName && showEmail
                  ? "w-[9%]"
                  : showName || showEmail
                    ? "w-[9%]"
                    : "w-[11%]"
              }
            />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-[#5a6475]">
            <tr className="bg-[#5a6475] text-white text-left">
              {headers.map(({ label, field }) =>
                !showEmail && label === "Email" ? null : !showName &&
                  label === "Student Name" ? null : (
                  <th
                    key={label}
                    title={label}
                    className={`px-4 py-2.5 font-semibold text-sm ${
                      !field ? "text-center" : "text-left"
                    }`}
                  >
                    {field ? (
                      <div className={"flex justify-center w-full"}>
                        <SortableHeader
                          label={label}
                          field={field}
                          sortField={sortField}
                          sortDirection={sortDirection}
                          onSort={handleSort}
                        />
                      </div>
                    ) : (
                      label
                    )}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {displayStudents.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColCount}
                  className="text-center py-6 text-gray-500 text-xs"
                >
                  No student added to this class yet.
                </td>
              </tr>
            ) : (
              pagedRows.map((s) => (
                <tr
                  key={getStudentRowKey(s)}
                  className="border-t border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 font-medium text-sm text-left whitespace-nowrap">
                    <span
                      className="text-gray-700 font-semibold"
                      title={s.student_code}
                    >
                      {s.student_code}
                    </span>
                  </td>
                  {showName && (
                    <td className="px-4 py-3 text-sm text-left text-gray-700">
                      <span className="block truncate" title={s.student_name}>
                        {s.student_name}
                      </span>
                    </td>
                  )}
                  {showEmail && (
                    <td
                      className={`px-4 py-3 text-sm ${s.email === "-" ? "text-center text-gray-500" : "text-left text-gray-700"}`}
                    >
                      <span className="block truncate" title={s.email}>
                        {s.email}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm text-gray-500 text-center whitespace-nowrap">
                    {s.timeSpent}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-center whitespace-nowrap">
                    {s.timeRemaining}
                  </td>
                  <td className="px-4 py-3 text-sm text-center whitespace-nowrap text-gray-700">
                    {s.simsCompleted}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 text-center whitespace-nowrap">
                    {s.avgScore}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => setReportsStudent(s._original)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 border text-xs rounded-full font-medium transition-colors ${
                        s.hasUnread
                          ? "bg-primary-500 border-primary-500 text-white hover:bg-primary-600"
                          : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {t.reportsButton}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    {isStudentRevoked(s._original) ? (
                      <StatusPill label="Revoked" tone="danger" />
                    ) : (
                      <StatusPill label="Active" tone="success" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      data-student-trigger="true"
                      aria-label="Student actions"
                      aria-haspopup="menu"
                      aria-expanded={
                        menuState?.studentId === String(s._original.id)
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        onStudentMenuOpen?.();
                        const anchor = e.currentTarget as HTMLElement;
                        setMenuState(
                          menuState?.studentId === String(s._original.id)
                            ? null
                            : { studentId: String(s._original.id), anchor },
                        );
                      }}
                      className="text-gray-500 hover:text-gray-600 text-lg font-bold tracking-widest px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                    >
                      <span aria-hidden="true">···</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {menuState && (
        <PortalDropdown
          anchorEl={menuState.anchor}
          studentId={menuState.studentId}
          isRevoked={isStudentRevoked(
            students.find((s) => String(s.id) === menuState.studentId),
          )}
          studentEmail={
            students.find((s) => String(s.id) === menuState.studentId)?.email
          }
          onClose={() => setMenuState(null)}
          onSelect={handleMenuAction}
          isClassInactive={isClassInactive}
          t={t}
        />
      )}

      {isStatus === "ARCHIEVED" ? null : (
        <div className="flex justify-center mt-3">
          <button
            onClick={() => !isClassInactive && setIsAddStudentOpen(true)}
            className={`flex items-center gap-2 px-5 py-2.5 bg-gradient-btn text-white text-sm font-semibold rounded-full transition-opacity shadow-md ${
              isClassInactive ? "cursor-not-allowed" : "hover:opacity-90"
            }`}
          >
            ＋ {t.addStudent}
          </button>
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
        mode="single"
        student={
          printStudent
            ? {
                studentName: printStudent.student_name ?? "",
                accessCode: printStudent.student_id ?? "",
              }
            : undefined
        }
      />

      <RegenerateAccessCodeModal
        isOpen={!!regenerateStudent}
        onClose={() => setRegenerateStudent(null)}
        studentId={regenerateStudent?.id ?? ""}
        studentName={regenerateStudent?.student_name ?? ""}
        currentCode={regenerateStudent?.student_id ?? null}
        onSuccess={onStudentAdded}
      />

      <RevokeAccessCodeModal
        isOpen={!!revokeStudent}
        onClose={() => setRevokeStudent(null)}
        studentId={revokeStudent?.id ?? ""}
        studentName={revokeStudent?.student_name ?? ""}
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
                  style={{ display: "none" }}
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
                  student_id: emailStudent.id ?? "",
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
                id: accessCodeStudent.id ?? "",
                student_id: accessCodeStudent.student_id ?? "",
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
          studentId={reportsStudent.id ?? ""}
          studentName={reportsStudent.student_name ?? ""}
          studentCode={reportsStudent.student_id ?? "—"}
          studentEmail={reportsStudent.email ?? undefined}
          classId={reportsStudent.class_id ?? classId}
          onClose={() => setReportsStudent(null)}
          reports={
            (reportsStudentReports?.length ?? 0) > 0
              ? reportsStudentReports
              : undefined
          }
        />
      )}

      {exportStudent && (
        <ExportReportModal
          source={{
            type: "class",
            classId: exportStudent.class_id ?? classId,
            className: className,
            startDate: startDate ?? "",
            endDate: endDate ?? "",
          }}
          students={[exportStudent]}
          onClose={() => setExportStudent(null)}
        />
      )}
    </div>
  );
}
