import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import loginEn from "../../../locales/auth/login/en.json";
import loginEs from "../../../locales/auth/login/es.json";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import {
  GetClassSimulationReports,
  MarkReportViewed,
  resetClassReports,
  selectClassReports,
  selectClassReportsStatus,
  type SimulationReport,
} from "../../../redux/class/SimsCompletedreportsRedux";
import {
  selectClasses,
  markReportUnviewed,
  selectViewedReportIds,
  isReportNew,
} from "../../../redux/class/GetClassRedux";
import { getParsedUser } from "../../../utils/storage";
import Modal from "../../ui/Modal";
import SortableHeader from "../../common/SortableHeader";

interface Props {
  simId: string;
  simAssignmentId: string;
  simName: string;
  classId: string;
  reports?: SimulationReport[];
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

function formatScore(r: SimulationReport): string {
  const raw = r as unknown as Record<string, unknown>;
  const reportData =
    raw["report_data"] && typeof raw["report_data"] === "object"
      ? (raw["report_data"] as Record<string, unknown>)
      : undefined;
  const reportScore = reportData?.["score"];
  const reportScoreJson =
    reportData?.["scoreJson"] && typeof reportData["scoreJson"] === "object"
      ? (reportData["scoreJson"] as Record<string, unknown>)
      : null;
  const score =
    r.score ??
    r.scoreJson?.overallScore ??
    (typeof reportScore === "number"
      ? reportScore
      : typeof reportScore === "string" && reportScore.trim() !== ""
        ? Number(reportScore)
        : null) ??
    (typeof reportScoreJson?.["overallScore"] === "number"
      ? (reportScoreJson["overallScore"] as number)
      : null);
  if (score !== null) return `${score}%`;
  const label =
    r.performanceLabel ??
    r.scoreJson?.overallLabel ??
    (reportData?.["performanceLabel"] as string | undefined) ??
    (typeof reportScoreJson?.["overallLabel"] === "string"
      ? (reportScoreJson["overallLabel"] as string)
      : null);
  return label ?? "—";
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

export default function SimulationReportsModal({
  simId,
  simAssignmentId,
  simName,
  classId,
  reports: providedReports,
  onClose,
}: Props) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const t = (
    localStorage.getItem("app_language")?.toLowerCase() === "es"
      ? loginEs
      : loginEn
  ).reportsModal;
  const allClasses = useAppSelector(selectClasses);
  // Resolve the class + school for the header bar above the sim name.
  const classInfo = useMemo(
    () => (allClasses ?? []).find((c) => c.id === classId),
    [allClasses, classId],
  );
  const className = classInfo?.class_name ?? "";
  const schoolName =
    classInfo?.school_name ||
    (classInfo?.school_id
      ? (
          getParsedUser()?.schools as
            | Array<{ id: string; school_name: string }>
            | undefined
        )?.find((s) => s.id === classInfo.school_id)?.school_name
      : "") ||
    "";
  const allReports = useAppSelector(selectClassReports);
  const status = useAppSelector(selectClassReportsStatus);
  const shouldFetch = !providedReports;

  const userIdToStudentCode = useMemo(() => {
    const map = new Map<string, string>();
    const cls = allClasses?.find((c) => c.id === classId);
    for (const student of cls?.students ?? []) {
      if (student.user_id && student.student_id)
        map.set(student.user_id, student.student_id);
      if (student.student_id) map.set(student.student_id, student.student_id);
    }
    return map;
  }, [allClasses, classId]);

  useEffect(() => {
    if (!shouldFetch) return;
    dispatch(resetClassReports());
    dispatch(GetClassSimulationReports({ classId }));
    return () => {
      dispatch(resetClassReports());
    };
  }, [classId, dispatch, shouldFetch]);

  const candidateIds = useMemo(
    () => new Set([simId, simAssignmentId].filter(Boolean)),
    [simId, simAssignmentId],
  );

  const reports = useMemo(() => {
    if (providedReports) return providedReports;
    return allReports.filter((r) => {
      const raw = r as unknown as Record<string, unknown>;
      const reportData =
        raw["report_data"] && typeof raw["report_data"] === "object"
          ? (raw["report_data"] as Record<string, unknown>)
          : undefined;
      const reportIds = [
        r.simulation_id,
        r.scenario_id,
        r.scenarioId,
        (r as unknown as Record<string, unknown>)[
          "class_simulation_id"
        ] as string,
        reportData?.["simulation_id"] as string,
        reportData?.["scenario_id"] as string,
        reportData?.["scenarioId"] as string,
        reportData?.["class_simulation_id"] as string,
      ].filter(Boolean) as string[];
      return reportIds.some((id) => candidateIds.has(id));
    });
  }, [allReports, candidateIds, providedReports]);

  const loading = shouldFetch && status === "loading";
  const failed = shouldFetch && status === "failed";

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
  const allReportIds = reports
    .map((r) => r.id)
    .filter((id): id is string => Boolean(id));

  // Per-column sorting (parity with the student / class-action report modals).
  const viewedReportIds = useAppSelector(selectViewedReportIds);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const handleSort = (field: string) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sortedReports = useMemo(() => {
    if (!sortField) return reports;
    const val = (r: SimulationReport): string | number => {
      const raw = r as unknown as Record<string, unknown>;
      const reportData =
        raw["report_data"] && typeof raw["report_data"] === "object"
          ? (raw["report_data"] as Record<string, unknown>)
          : undefined;
      switch (sortField) {
        case "student_code": {
          const uid = raw["userId"] as string | undefined;
          return String(
            raw["studentCode"] ??
              raw["student_code"] ??
              reportData?.["studentCode"] ??
              reportData?.["student_code"] ??
              (uid ? userIdToStudentCode.get(uid) : undefined) ??
              "",
          ).toLowerCase();
        }
        case "mode":
          return String(
            raw["mode"] ?? reportData?.["mode"] ?? "",
          ).toLowerCase();
        case "sim_name":
          return String(
            raw["scenarioTitle"] ??
              raw["scenario_title"] ??
              raw["simulation_name"] ??
              reportData?.["scenarioTitle"] ??
              simName,
          ).toLowerCase();
        case "score": {
          const s = r.score ?? r.scoreJson?.overallScore;
          return typeof s === "number" ? s : -1;
        }
        case "status":
          return String(
            r.performanceLabel ??
              r.scoreJson?.overallLabel ??
              reportData?.["performanceLabel"] ??
              raw["status"] ??
              "",
          ).toLowerCase();
        case "time_spent":
          return (r.totalTimeSeconds ??
            (reportData?.["totalTimeSeconds"] as number | undefined) ??
            0) as number;
        case "completed_at": {
          const c = String(
            r.scenarioEndTime ??
              r.completed_at ??
              reportData?.["scenarioEndTime"] ??
              reportData?.["completed_at"] ??
              reportData?.["createdAt"] ??
              "",
          );
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
  }, [reports, sortField, sortDir, userIdToStudentCode, simName]);

  function handleViewTranscript(r: SimulationReport) {
    if (r.id && classId) {
      void dispatch(MarkReportViewed({ reportId: r.id, classId }));
    }
    onClose();
    const raw = r as unknown as Record<string, unknown>;
    const reportData =
      raw["report_data"] && typeof raw["report_data"] === "object"
        ? (raw["report_data"] as Record<string, unknown>)
        : undefined;
    const summaryByCategory =
      (raw["summaryByCategory"] as Record<string, unknown> | undefined) ??
      (reportData?.["summaryByCategory"] as
        | Record<string, unknown>
        | undefined);
    const actions = Array.isArray(summaryByCategory?.["actions"])
      ? (summaryByCategory?.["actions"] as Record<string, unknown>[])
      : [];
    const firstAction = (actions[0] ?? {}) as Record<string, unknown>;
    const startedAtCombined =
      (firstAction["startedAt"] as string | undefined) ??
      (firstAction["started_at"] as string | undefined) ??
      r.scenarioStartTime ??
      (reportData?.["scenarioStartTime"] as string | undefined);
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
          r.scenarioTitle ?? r.scenario_title ?? r.simulation_name ?? simName,
        reportMode: (raw["mode"] as string | undefined) ?? "",
        simulationDate: transcriptSimDate,
        simulationTime: transcriptSimTime,
      },
    });
  }

  function handleRowClick(r: SimulationReport) {
    const raw = r as unknown as Record<string, unknown>;
    const reportData =
      raw["report_data"] && typeof raw["report_data"] === "object"
        ? (raw["report_data"] as Record<string, unknown>)
        : undefined;
    const studentName =
      r.studentName ??
      r.student_name ??
      (reportData?.["studentName"] as string | undefined) ??
      (reportData?.["student_name"] as string | undefined) ??
      "—";
    if (r.id && classId) {
      void dispatch(MarkReportViewed({ reportId: r.id, classId }));
    }
    onClose();
    navigate("/report-detail", {
      state: {
        report: { ...r, student_name: studentName, class_id: classId },
        backPath: "/classes",
        backState: {
          classId,
          expandType: "sims",
          simId,
          openSimReports: true,
        },
      },
    });
  }

  // Pinned footer (Total Time / Avg Score / count) — same as the student modal.
  const footerContent =
    reports.length > 0
      ? (() => {
          const totalSecs = reports.reduce((sum, r) => {
            const raw = r as unknown as Record<string, unknown>;
            const rd =
              raw["report_data"] && typeof raw["report_data"] === "object"
                ? (raw["report_data"] as Record<string, unknown>)
                : undefined;
            let tt =
              (r.totalTimeSeconds ??
                (rd?.["totalTimeSeconds"] as number | undefined) ??
                0) as number;
            if (tt > 86400) tt = Math.round(tt / 1000);
            return sum + (Number.isFinite(tt) ? tt : 0);
          }, 0);
          const scoreVals = reports
            .map((r) => {
              const s = r.score ?? r.scoreJson?.overallScore;
              if (typeof s !== "number") return null;
              return s <= 1 && s >= 0 ? Math.round(s * 100) : Math.round(s);
            })
            .filter((v): v is number => v !== null);
          const avg = scoreVals.length
            ? Math.round(scoreVals.reduce((a, b) => a + b, 0) / scoreVals.length)
            : null;
          return (
            <div className="flex items-center justify-between px-1 w-full">
              <div className="flex gap-4 text-sm text-gray-500">
                <span>
                  <span className="font-semibold text-gray-700">
                    {t.totalTime}{" "}
                  </span>
                  {formatTime(totalSecs, "—")}
                </span>
                {avg !== null && (
                  <span>
                    <span className="font-semibold text-gray-700">
                      {t.avgScore}{" "}
                    </span>
                    {avg}%
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">{reports.length}</p>
            </div>
          );
        })()
      : null;

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
        {className && (
          <p>
            <span className="text-primary-500 font-semibold">Class:</span>{" "}
            <span className="text-[#5f6060] font-medium">{className}</span>
          </p>
        )}
        <p>
          <span className="text-primary-500 font-semibold">Simulation:</span>{" "}
          <span className="text-[#5f6060] font-medium">{simName}</span>
        </p>
      </div>
      {!loading && !failed && reports.length > 0 && (
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
          <thead className="bg-primary-500 text-white">
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
                <SortableHeader
                  label={t.headerStudentCode}
                  field="student_code"
                  sortField={sortField}
                  sortDirection={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                <SortableHeader
                  label={t.headerMode}
                  field="mode"
                  sortField={sortField}
                  sortDirection={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                <SortableHeader
                  label={t.headerSimName}
                  field="sim_name"
                  sortField={sortField}
                  sortDirection={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                <SortableHeader
                  label={t.headerScore}
                  field="score"
                  sortField={sortField}
                  sortDirection={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                <SortableHeader
                  label={t.headerStatus}
                  field="status"
                  sortField={sortField}
                  sortDirection={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                <SortableHeader
                  label={t.headerTimeSpent}
                  field="time_spent"
                  sortField={sortField}
                  sortDirection={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">
                <SortableHeader
                  label={t.headerCompletedAt}
                  field="completed_at"
                  sortField={sortField}
                  sortDirection={sortDir}
                  onSort={handleSort}
                />
              </th>
              <th className="px-3 py-2.5 text-left font-medium rounded-tr-lg">
                {t.headerActions}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center">
                  <div className="flex justify-center">
                    <div className="w-6 h-6 border-4 border-primary-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                </td>
              </tr>
            ) : failed ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-8 text-center text-sm text-red-500"
                >
                  {t.failedToLoad}
                </td>
              </tr>
            ) : reports.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center">
                  <p className="text-sm font-semibold text-gray-600">
                    {t.noReportsTitle}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {t.noReportsSubtitle}
                  </p>
                </td>
              </tr>
            ) : (
              sortedReports.map((r, i) => {
                const raw = r as unknown as Record<string, unknown>;
                const reportData =
                  raw["report_data"] && typeof raw["report_data"] === "object"
                    ? (raw["report_data"] as Record<string, unknown>)
                    : undefined;
                const isUUID = (v: string) =>
                  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                    v,
                  );
                const resolveCode = (v: unknown) =>
                  typeof v === "string" && v.trim() && !isUUID(v)
                    ? v.trim()
                    : null;
                const studentCode =
                  resolveCode(r.studentCode) ??
                  resolveCode(r.student_code) ??
                  resolveCode(raw["studentCode"]) ??
                  resolveCode(raw["student_code"]) ??
                  resolveCode(reportData?.["studentCode"]) ??
                  resolveCode(reportData?.["student_code"]) ??
                  (r.userId
                    ? resolveCode(userIdToStudentCode.get(r.userId))
                    : null) ??
                  "—";
                const rawMode =
                  (raw["mode"] as string | undefined) ??
                  (reportData?.["mode"] as string | undefined);
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
                const simTitle =
                  r.scenarioTitle ??
                  r.scenario_title ??
                  r.simulation_name ??
                  (reportData?.["scenarioTitle"] as string | undefined) ??
                  simName;
                const completedAt =
                  r.scenarioEndTime ??
                  r.completed_at ??
                  (reportData?.["scenarioEndTime"] as string | undefined) ??
                  (reportData?.["completed_at"] as string | undefined) ??
                  (reportData?.["createdAt"] as string | undefined) ??
                  null;
                const totalSecs =
                  r.totalTimeSeconds ??
                  (reportData?.["totalTimeSeconds"] as number | undefined) ??
                  null;
                const rawScore = r.score ?? r.scoreJson?.overallScore ?? null;
                const statusText =
                  r.performanceLabel ??
                  r.scoreJson?.overallLabel ??
                  (reportData?.["performanceLabel"] as string | undefined) ??
                  (raw["status"] as string | undefined) ??
                  "—";
                const isNew = isReportNew(r.id, r.isNew, viewedReportIds);
                return (
                  <tr
                    key={r.id ?? i}
                    className="border-b border-gray-100 bg-white hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="Select report"
                        checked={r.id ? selectedIds.has(r.id) : false}
                        onChange={() => r.id && toggleSelected(r.id)}
                        className="w-4 h-4 accent-white cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 font-semibold text-sm">
                      {studentCode}
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
                      {simTitle}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {formatScore(r)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-sm font-medium capitalize ${getStatusColorClass(rawScore)}`}
                    >
                      {statusText}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {formatTime(
                        totalSecs,
                        r.time_spent ??
                          (reportData?.["time_spent"] as string | undefined) ??
                          null,
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {formatDate(completedAt)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-row items-center gap-1.5">
                        <button
                          onClick={() => handleRowClick(r)}
                          className={`inline-flex items-center justify-center px-2 py-1 border text-[12px] rounded-full font-medium transition-colors whitespace-nowrap cursor-pointer ${
                            isNew
                              ? "bg-primary-500 border-primary-500 text-white hover:bg-primary-600"
                              : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          {t.viewReport}
                        </button>
                        <button
                          onClick={() => handleViewTranscript(r)}
                          className="inline-flex items-center justify-center px-2 py-1 border text-[12px] rounded-full font-medium transition-colors whitespace-nowrap bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 cursor-pointer"
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
