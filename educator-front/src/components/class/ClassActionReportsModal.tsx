import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { MarkReportViewed } from "../../redux/class/SimsCompletedreportsRedux";
import {
  selectViewedReportIds,
  isReportNew,
  selectClasses,
  markReportUnviewed,
} from "../../redux/class/GetClassRedux";
import { getParsedUser } from "../../utils/storage";
import SortableHeader from "./../common/SortableHeader";
import Modal from "../ui/Modal";
import type { SimulationReportItem } from "../../redux/simulation/GetSimulationReportsRedux";
import type { Student } from "../../types/Class_types";

interface ClassActionReportsModalProps {
  classId: string;
  className: string;
  reports: SimulationReportItem[];
  students: Student[];
  isClassInactive?: boolean;
  onClose: () => void;
}

function formatTime(
  totalSecs: number | null | undefined,
  fallback: string | null | undefined,
): string {
  if (totalSecs != null && totalSecs > 0) {
    const secs = totalSecs > 86400 ? Math.round(totalSecs / 1000) : totalSecs;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }
  return fallback ?? "—";
}

function formatScore(r: SimulationReportItem): string {
  const raw = r.score ?? r.scoreJson?.overallScore ?? null;
  if (raw !== null) {
    const pct = raw <= 1 && raw >= 0 ? Math.round(raw * 100) : Math.round(raw);
    return `${pct}%`;
  }
  return r.performanceLabel ?? "—";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
}

function getStatusColorClass(_score?: number | null): string {
  // Performance Quality text is intentionally neutral gray everywhere now
  // (consistent across all tables / modals).
  return "text-gray-700";
}

export default function ClassActionReportsModal({
  classId,
  className,
  reports,
  students,
  isClassInactive,
  onClose,
}: ClassActionReportsModalProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const t = (
    localStorage.getItem("app_language")?.toLowerCase() === "es"
      ? loginEs
      : loginEn
  ).classActionReportsModal;
  const viewedReportIds = useAppSelector(selectViewedReportIds);
  const allClasses = useAppSelector(selectClasses);
  const schoolName = useMemo(() => {
    const cls = (allClasses ?? []).find((c) => c.id === classId);
    return (
      cls?.school_name ||
      (cls?.school_id
        ? (
            getParsedUser()?.schools as
              | Array<{ id: string; school_name: string }>
              | undefined
          )?.find((s) => s.id === cls.school_id)?.school_name
        : "") ||
      ""
    );
  }, [allClasses, classId]);

  // Column sorting (shared SortableHeader, like the other report modals).
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // Multi-select: mark selected (or all) reports reviewed / unreviewed.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const markReviewed = (ids: string[]) => {
    if (!classId || ids.length === 0) return;
    void dispatch(MarkReportViewed({ reportId: ids, classId }));
    setSelectedIds(new Set());
  };
  const markUnreviewed = (ids: string[]) => {
    if (!classId || ids.length === 0) return;
    dispatch(markReportUnviewed({ reportId: ids, classId }));
    setSelectedIds(new Set());
  };
  const handleSort = (field: string) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const userIdToCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) {
      if (s.user_id && s.student_id) map.set(s.user_id, s.student_id);
      if (s.student_id) map.set(s.student_id, s.student_id);
    }
    return map;
  }, [students]);

  const sortedReports = useMemo(() => {
    if (!sortField) return reports;
    const val = (r: SimulationReportItem): string | number => {
      const raw = r as unknown as Record<string, unknown>;
      switch (sortField) {
        case "student_code": {
          const uid = raw["userId"] as string | undefined;
          return String(
            (uid ? userIdToCode.get(uid) : undefined) ??
              raw["studentCode"] ??
              raw["student_code"] ??
              "",
          ).toLowerCase();
        }
        case "mode":
          return String(raw["mode"] ?? "").toLowerCase();
        case "sim_name":
          return String(
            raw["scenarioTitle"] ??
              raw["scenario_title"] ??
              raw["simulation_name"] ??
              "",
          ).toLowerCase();
        case "score": {
          const s = r.score ?? r.scoreJson?.overallScore;
          return typeof s === "number" ? s : -1;
        }
        case "status":
          return String(
            raw["performanceLabel"] ??
              (raw["scoreJson"] as Record<string, unknown> | undefined)?.[
                "overallLabel"
              ] ??
              raw["status"] ??
              "",
          ).toLowerCase();
        case "time_spent":
          return (r.totalTimeSeconds ?? 0) as number;
        case "completed_at": {
          const c = (raw["scenarioEndTime"] ??
            raw["completed_at"] ??
            raw["createdAt"] ??
            raw["created_at"] ??
            "") as string;
          const d = new Date(c).getTime();
          return Number.isNaN(d) ? 0 : d;
        }
        default:
          return 0;
      }
    };
    return [...reports].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [reports, sortField, sortDir, userIdToCode]);

  function handleViewTranscript(r: SimulationReportItem) {
    if (isClassInactive) return;
    onClose();
    const raw = r as unknown as Record<string, unknown>;
    const summaryByCategory = raw["summaryByCategory"] as
      | Record<string, unknown>
      | undefined;
    const actions = Array.isArray(summaryByCategory?.["actions"])
      ? (summaryByCategory?.["actions"] as Record<string, unknown>[])
      : [];
    const firstAction = (actions[0] ?? {}) as Record<string, unknown>;
    const startedAtCombined =
      (firstAction["startedAt"] as string | undefined) ??
      (firstAction["started_at"] as string | undefined) ??
      r.scenarioStartTime;
    let transcriptSimDate = "";
    let transcriptSimTime = "";
    if (startedAtCombined && startedAtCombined.includes(",")) {
      const [datePart, timePart] = startedAtCombined.split(",");
      transcriptSimDate = (datePart ?? "").trim();
      transcriptSimTime = (timePart ?? "").trim();
    } else if (startedAtCombined) {
      const d = new Date(startedAtCombined);
      if (!Number.isNaN(d.getTime())) {
        transcriptSimDate = d.toLocaleDateString("en-US", {
          month: "short",
          day: "2-digit",
        });
        transcriptSimTime = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      }
    }
    navigate(`/transcript/${r.id}`, {
      state: {
        simulationName:
          r.scenarioTitle ?? r.scenario_title ?? r.simulation_name ?? "",
        reportMode: (raw["mode"] as string | undefined) ?? "",
        simulationDate: transcriptSimDate,
        simulationTime: transcriptSimTime,
      },
    });
  }

  function handleRowClick(r: SimulationReportItem) {
    if (isClassInactive) return;
    const studentName = r.studentName ?? r.student_name ?? "—";
    if (r.id) {
      void dispatch(MarkReportViewed({ reportId: r.id, classId }));
    }
    onClose();
    navigate("/report-detail", {
      state: {
        report: { ...r, student_name: studentName, class_id: classId },
        backPath: "/classes",
        backState: { classId, openReportsModal: true },
      },
    });
  }

  const totalSecs = reports.reduce((sum, r) => {
    let t = r.totalTimeSeconds ?? 0;
    if (t > 86400) t = Math.round(t / 1000);
    return sum + t;
  }, 0);

  const scoreValues = reports
    .map((r) => {
      const raw = r.score ?? r.scoreJson?.overallScore ?? null;
      if (raw === null) return null;
      return raw <= 1 && raw >= 0 ? Math.round(raw * 100) : Math.round(raw);
    })
    .filter((v): v is number => v !== null);

  const avgScore =
    scoreValues.length > 0
      ? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length)
      : null;

  const footerContent =
    reports.length > 0 ? (
      <div className="flex items-center justify-between px-1 w-full">
        <div className="flex gap-4 text-sm text-gray-500">
          <span>
            <span className="font-semibold text-gray-700">{t.totalTime} </span>
            {formatTime(totalSecs, "—")}
          </span>
          {avgScore !== null && (
            <span>
              <span className="font-semibold text-gray-700">{t.avgScore} </span>
              {avgScore}%
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500">
          {reports.length} report{reports.length !== 1 ? "s" : ""}
        </p>
      </div>
    ) : null;

  const allReportIds = sortedReports
    .map((r) => r.id)
    .filter((id): id is string => Boolean(id));

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Reports"
      className="max-w-[1280px] w-full"
      footer={footerContent}
    >
      <div className="mb-4 text-center text-sm space-y-0.5">
        {schoolName && (
          <p>
            <span className="text-primary-500 font-semibold">School:</span>{" "}
            <span className="text-[#5f6060] font-medium">{schoolName}</span>
          </p>
        )}
        <p>
          <span className="text-primary-500 font-semibold">Class:</span>{" "}
          <span className="text-[#5f6060] font-medium">{className}</span>
        </p>
      </div>
      {reports.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs text-gray-500 mr-auto">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            disabled={selectedIds.size === 0}
            onClick={() => markReviewed([...selectedIds])}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-[#5f6060] hover:bg-[#e9e9e9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Mark reviewed
          </button>
          <button
            type="button"
            disabled={selectedIds.size === 0}
            onClick={() => markUnreviewed([...selectedIds])}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-[#5f6060] hover:bg-[#e9e9e9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Mark unreviewed
          </button>
          <span className="mx-1 h-5 w-px bg-gray-300" aria-hidden="true" />
          <button
            type="button"
            onClick={() => markReviewed(allReportIds)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-[#5f6060] hover:bg-[#e9e9e9] transition-colors"
          >
            Mark all reviewed
          </button>
          <button
            type="button"
            onClick={() => markUnreviewed(allReportIds)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-[#5f6060] hover:bg-[#e9e9e9] transition-colors"
          >
            Mark all unreviewed
          </button>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="bg-primary-500 text-white sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium rounded-tl-lg w-10">
                <input
                  type="checkbox"
                  aria-label="Select all reports"
                  className="w-4 h-4 accent-white cursor-pointer align-middle"
                  checked={
                    allReportIds.length > 0 &&
                    selectedIds.size === allReportIds.length
                  }
                  ref={(el) => {
                    if (el)
                      el.indeterminate =
                        selectedIds.size > 0 &&
                        selectedIds.size < allReportIds.length;
                  }}
                  onChange={() =>
                    setSelectedIds(
                      selectedIds.size === allReportIds.length
                        ? new Set()
                        : new Set(allReportIds),
                    )
                  }
                />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                <SortableHeader label={t.headerStudentCode} field="student_code" sortField={sortField} sortDirection={sortDir} onSort={handleSort} />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                <SortableHeader label={t.headerMode} field="mode" sortField={sortField} sortDirection={sortDir} onSort={handleSort} />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                <SortableHeader label={t.headerSimName} field="sim_name" sortField={sortField} sortDirection={sortDir} onSort={handleSort} />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                <SortableHeader label={t.headerScore} field="score" sortField={sortField} sortDirection={sortDir} onSort={handleSort} />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                <SortableHeader label={t.headerStatus} field="status" sortField={sortField} sortDirection={sortDir} onSort={handleSort} />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                <SortableHeader label={t.headerTimeSpent} field="time_spent" sortField={sortField} sortDirection={sortDir} onSort={handleSort} />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                <SortableHeader label={t.headerCompletedAt} field="completed_at" sortField={sortField} sortDirection={sortDir} onSort={handleSort} />
              </th>
              <th className="px-3 py-2.5 text-left font-medium rounded-tr-lg">
                {t.headerActions}
              </th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center">
                  <p className="text-sm font-semibold text-gray-600">
                    {t.noReportsTitle}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {t.noReportsSubtitle}
                  </p>
                </td>
              </tr>
            ) : (
              sortedReports.map((r, i) => {
                const simName =
                  r.scenarioTitle ??
                  r.scenario_title ??
                  r.simulation_name ??
                  "—";
                const completedAt = r.scenarioEndTime ?? r.completed_at ?? null;
                const raw = r as unknown as Record<string, unknown>;
                const isUUID = (v: string) =>
                  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                    v,
                  );
                const resolveCode = (v: unknown) =>
                  typeof v === "string" && v.trim() && !isUUID(v)
                    ? v.trim()
                    : null;
                const studentCode =
                  resolveCode(
                    r.userId ? userIdToCode.get(r.userId) : undefined,
                  ) ??
                  resolveCode(raw["studentCode"]) ??
                  resolveCode(raw["student_code"]) ??
                  resolveCode(r.student_id) ??
                  null;
                const rawMode = (r as unknown as Record<string, unknown>)[
                  "mode"
                ] as string | undefined;
                const modeLabel = rawMode
                  ? rawMode.toLowerCase() === "assessment"
                    ? t.modeAssessment
                    : rawMode.toLowerCase() === "practice"
                      ? t.modePractice
                      : rawMode.charAt(0).toUpperCase() +
                        rawMode.slice(1).toLowerCase()
                  : "—";
                const modeBadgeClass =
                  rawMode?.toLowerCase() === "assessment"
                    ? "bg-blue-50 text-blue-700"
                    : rawMode?.toLowerCase() === "practice"
                      ? "bg-green-50 text-green-700"
                      : "bg-gray-50 text-gray-500";
                const isNew = isReportNew(r.id, r.isNew, viewedReportIds);
                const rawScore = r.score ?? r.scoreJson?.overallScore ?? null;
                const statusText =
                  r.status ??
                  r.performanceLabel ??
                  (r.scoreJson?.overallLabel as string | undefined) ??
                  "—";
                return (
                  <tr
                    key={r.id ?? i}
                    className={`border-b border-gray-100 transition-colors bg-white hover:bg-gray-50 ${isClassInactive ? "opacity-60" : ""}`}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={r.id ? selectedIds.has(r.id) : false}
                        onChange={() => r.id && toggleSelected(r.id)}
                        aria-label="Select report"
                        className="w-4 h-4 accent-white cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 font-mono text-[11px]">
                      {studentCode ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {rawMode ? (
                        <span
                          className={`px-1.5 py-0.5 rounded text-sm font-semibold ${modeBadgeClass}`}
                        >
                          {modeLabel}
                        </span>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-800 font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRowClick(r)}
                          disabled={isClassInactive}
                          className={`text-left hover:text-primary-600 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1 ${isClassInactive ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                        >
                          {simName}
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {formatScore(r)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-[11px] font-medium capitalize ${getStatusColorClass(rawScore)}`}
                    >
                      {statusText}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {formatTime(r.totalTimeSeconds, r.time_spent)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {formatDate(completedAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-row items-center gap-1.5">
                        <button
                          onClick={() => handleRowClick(r)}
                          disabled={isClassInactive}
                          className={`inline-flex items-center justify-center px-2 py-1 border text-[10px] rounded-full font-medium transition-colors whitespace-nowrap ${
                            isClassInactive
                              ? "bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed"
                              : isNew
                                ? "bg-primary-500 border-primary-500 text-white hover:bg-primary-600 cursor-pointer"
                                : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 cursor-pointer"
                          }`}
                        >
                          {t.viewReport}
                        </button>
                        <button
                          onClick={() => handleViewTranscript(r)}
                          disabled={isClassInactive}
                          className={`inline-flex items-center justify-center px-2 py-1 border text-[10px] rounded-full font-medium transition-colors whitespace-nowrap ${
                            isClassInactive
                              ? "bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed"
                              : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 cursor-pointer"
                          }`}
                        >
                          {t.viewTranscript}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
