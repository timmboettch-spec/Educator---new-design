import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  MarkReportViewed,
  type SimulationReport,
} from "../../redux/class/SimsCompletedreportsRedux";
import {
  selectClasses,
  selectViewedReportIds,
  isReportNew,
  markReportUnviewed,
} from "../../redux/class/GetClassRedux";
import {
  selectSimulationsByClassId,
  FetchSimulationsByClass,
} from "../../redux/class/GetSimsRedux";
import ExportReportModal from "./simulation/ExportReportModal";
import SortableHeader from "../common/SortableHeader";

interface ReportSubTableProps {
  classId: string;
  reports: SimulationReport[];
  isClassInactive?: boolean;
  targetScenarioId?: string;
}

export default function ReportSubTable({
  classId,
  reports,
  isClassInactive,
  targetScenarioId,
}: ReportSubTableProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const t = (
    localStorage.getItem("app_language")?.toLowerCase() === "es"
      ? loginEs
      : loginEn
  ).reportSubTable;
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(
    null,
  );
  const [exportModalOpen, setExportModalOpen] = useState(false);
  // Multi-select: mark selected (or all) reports reviewed / unreviewed.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [highlightedScenarioId, setHighlightedScenarioId] = useState<
    string | null
  >(null);
  const firstMatchRef = useRef<HTMLTableRowElement | null>(null);
  const allClasses = useAppSelector(selectClasses);
  const viewedReportIds = useAppSelector(selectViewedReportIds);
  const classSims = useAppSelector(selectSimulationsByClassId(classId));

  useEffect(() => {
    if (classSims === null) {
      dispatch(FetchSimulationsByClass({ classId }));
    }
  }, [classId, classSims, dispatch]);

  const dueDateBySimId = useMemo(() => {
    const map = new Map<string, string>();
    for (const sim of classSims ?? []) {
      if (sim.simulation_id && sim.due_date)
        map.set(sim.simulation_id, sim.due_date);
    }
    return map;
  }, [classSims]);

  const userIdToStudentCode = useMemo(() => {
    const map = new Map<string, string>();
    const cls = allClasses?.find((c) => c.id === classId);
    for (const student of cls?.students ?? []) {
      if (student.user_id && student.student_id) {
        map.set(student.user_id, student.student_id);
      }
      if (student.student_id) {
        map.set(student.student_id, student.student_id);
      }
    }
    return map;
  }, [allClasses, classId]);

  const getReportData = (
    r: SimulationReport,
  ): Record<string, unknown> | undefined => {
    const raw = r as unknown as Record<string, unknown>;
    return raw["report_data"] && typeof raw["report_data"] === "object"
      ? (raw["report_data"] as Record<string, unknown>)
      : undefined;
  };

  const getStatusColorClass = (_score?: number | null): string => {
    // Performance Quality text is intentionally neutral gray everywhere now
    // (consistent across all tables / modals).
    return "text-gray-700";
  };

  const hasReports = reports.length > 0;

  const rows = reports;

  const headers = [
    { label: t.headerStudentCode, field: "studentCode" },
    { label: t.headerMode, field: "mode" },
    { label: t.headerSimName, field: "simulationName" },
    { label: t.headerScore, field: "score" },
    { label: t.headerStatus, field: "status" },
    { label: t.headerTimeSpent, field: "timeSpent" },
    { label: t.headerCompletedAt, field: "completedAt" },
    { label: t.headerActions, field: "" },
  ];

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }
    setSortField(field);
    setSortDirection("asc");
  };

  const getSortValue = (
    row: SimulationReport,
    field: string,
  ): string | number => {
    const score = row.score ?? row.scoreJson?.overallScore ?? null;
    const completedAt = row.scenarioEndTime ?? row.completed_at ?? null;

    switch (field) {
      case "studentCode":
        return (
          row.studentCode ??
          row.student_code ??
          (row.userId ? userIdToStudentCode.get(row.userId) : "") ??
          ""
        ).toLowerCase();
      case "mode":
        return (row.mode ?? "").toLowerCase();
      case "simulationName":
        return (
          row.scenarioTitle ??
          row.scenario_title ??
          row.simulation_name ??
          ""
        ).toLowerCase();
      case "score":
        return Number(score ?? -1);
      case "status":
        return (
          row.status ??
          row.performanceLabel ??
          row.scoreJson?.overallLabel ??
          ""
        ).toLowerCase();
      case "timeSpent":
        return Number(row.totalTimeSeconds ?? 0);
      case "completedAt":
        return completedAt ? new Date(completedAt).getTime() : 0;
      default:
        return "";
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortField || !sortDirection) return rows;

    return [...rows].sort((a, b) => {
      const aVal = getSortValue(a, sortField);
      const bVal = getSortValue(b, sortField);

      if (typeof aVal === "string" && typeof bVal === "string") {
        const cmp = aVal.localeCompare(bVal, undefined, {
          sensitivity: "base",
        });
        return sortDirection === "asc" ? cmp : -cmp;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sortField, sortDirection, userIdToStudentCode]);

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
  const allReportIds = sortedRows
    .map((r) => r.id)
    .filter((id): id is string => Boolean(id));

  useEffect(() => {
    if (!targetScenarioId || sortedRows.length === 0) return;
    const matchIndex = sortedRows.findIndex((r) => {
      const sid = (r.scenario_id ?? r.scenarioId ?? "") as string;
      return sid === targetScenarioId;
    });
    if (matchIndex === -1) return;
    setHighlightedScenarioId(targetScenarioId);
    const timer = setTimeout(() => {
      setHighlightedScenarioId(null);
    }, 2500);
    return () => clearTimeout(timer);
  }, [targetScenarioId, sortedRows]);

  const firstMatchIndex = useMemo(() => {
    if (!highlightedScenarioId) return -1;
    return sortedRows.findIndex((r) => {
      const sid = (r.scenario_id ?? r.scenarioId ?? "") as string;
      return sid === highlightedScenarioId;
    });
  }, [highlightedScenarioId, sortedRows]);

  useEffect(() => {
    if (firstMatchIndex >= 0 && firstMatchRef.current) {
      firstMatchRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [firstMatchIndex]);

  function handleViewReport(row: SimulationReport) {
    const studentName = row.studentName ?? row.student_name ?? "—";
    dispatch(MarkReportViewed({ reportId: row.id, classId }));
    navigate("/report-detail", {
      state: {
        report: { ...row, student_name: studentName, class_id: classId },
        backPath: "/classes",
        backState: { classId, expandType: "reports" },
      },
    });
  }

  function handleViewTranscript(row: SimulationReport) {
    const raw = row as unknown as Record<string, unknown>;
    const reportData = getReportData(row);
    const summaryByCategory =
      (raw["summaryByCategory"] as Record<string, unknown> | undefined) ??
      (raw["summary_by_category"] as Record<string, unknown> | undefined) ??
      (reportData?.["summaryByCategory"] as
        | Record<string, unknown>
        | undefined) ??
      (reportData?.["summary_by_category"] as
        | Record<string, unknown>
        | undefined);
    const actions = Array.isArray(summaryByCategory?.["actions"])
      ? (summaryByCategory?.["actions"] as Record<string, unknown>[])
      : [];
    const firstAction = (actions[0] ?? {}) as Record<string, unknown>;

    const startedAtCombined =
      (firstAction["startedAt"] as string | undefined) ??
      (firstAction["started_at"] as string | undefined) ??
      (firstAction["timestamp"] as string | undefined) ??
      row.scenarioStartTime ??
      (reportData?.["scenarioStartTime"] as string | undefined) ??
      (reportData?.["scenario_start_time"] as string | undefined);

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

    const transcriptSimName =
      row.scenarioTitle ??
      row.scenario_title ??
      row.simulation_name ??
      row.scenarioId ??
      "";
    const transcriptMode = row.mode ?? "";
    navigate(`/transcript/${row.id}`, {
      state: {
        simulationName: transcriptSimName,
        reportMode: transcriptMode,
        simulationDate: transcriptSimDate,
        simulationTime: transcriptSimTime,
      },
    });
  }

  return (
    <div className="mx-3 my-4 rounded-xl border border-gray-200 bg-white shadow-md overflow-hidden transition-opacity duration-150 ease-out">
      {hasReports && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-gray-100">
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
      <div
        className="overflow-x-auto overflow-y-auto max-h-[400px] border-t border-gray-200"
        style={{ scrollbarGutter: "stable" }}
      >
        <table className="w-full min-w-[1100px] table-auto text-sm">
          <colgroup>
            <col className="w-10" />
            <col className="w-[130px]" />
            <col className="w-[110px]" />
            <col />
            <col className="w-[70px]" />
            <col className="w-[150px]" />
            <col className="w-[95px]" />
            <col className="w-[155px]" />
            <col className="w-[240px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-[#5a6475]">
            <tr className="bg-[#5a6475] text-white text-left">
              <th className="px-4 py-3">
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
              {headers.map(({ label, field }) => (
                <th
                  key={label}
                  className="px-4 py-3 font-semibold text-sm text-left whitespace-nowrap"
                >
                  {field ? (
                    <SortableHeader
                      label={label}
                      field={field}
                      sortField={sortField}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                  ) : (
                    label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!hasReports ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm font-semibold text-gray-600">
                      {t.noReportTitle}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t.noReportSubtitle}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              sortedRows.map((row, i) => {
                const reportData = getReportData(row);
                const reportScore = reportData?.["score"];
                const reportScoreJson =
                  reportData?.["scoreJson"] &&
                  typeof reportData["scoreJson"] === "object"
                    ? (reportData["scoreJson"] as Record<string, unknown>)
                    : null;
                const score =
                  row.score ??
                  row.scoreJson?.overallScore ??
                  (typeof reportScore === "number"
                    ? reportScore
                    : typeof reportScore === "string" &&
                        reportScore.trim() !== ""
                      ? Number(reportScore)
                      : null) ??
                  (typeof reportScoreJson?.["overallScore"] === "number"
                    ? (reportScoreJson["overallScore"] as number)
                    : null);
                const performanceLabel =
                  row.performanceLabel ??
                  row.scoreJson?.overallLabel ??
                  (reportData?.["performanceLabel"] as string | undefined) ??
                  (typeof reportScoreJson?.["overallLabel"] === "string"
                    ? (reportScoreJson["overallLabel"] as string)
                    : null);
                const completedAt =
                  row.scenarioEndTime ??
                  row.completed_at ??
                  (reportData?.["scenarioEndTime"] as string | undefined) ??
                  (reportData?.["completed_at"] as string | undefined) ??
                  (reportData?.["createdAt"] as string | undefined) ??
                  null;
                let totalSecs =
                  row.totalTimeSeconds ??
                  (reportData?.["totalTimeSeconds"] as number | undefined) ??
                  null;
                if (totalSecs != null && totalSecs > 86400)
                  totalSecs = Math.round(totalSecs / 1000);
                const timeSpent = (() => {
                  if (totalSecs == null)
                    return (
                      row.time_spent ??
                      (reportData?.["time_spent"] as string | undefined) ??
                      null
                    );
                  const h = Math.floor(totalSecs / 3600);
                  const m = Math.floor((totalSecs % 3600) / 60);
                  const s = totalSecs % 60;
                  if (h > 0) return `${h}h ${m}m`;
                  if (m > 0) return `${m}m ${s}s`;
                  return `${s}s`;
                })();
                const simEndDate =
                  (reportData?.["end_date"] as string | undefined) ??
                  (reportData?.["endDate"] as string | undefined) ??
                  row.due_date ??
                  (reportData?.["due_date"] as string | undefined) ??
                  null;
                const completedAtColor = (() => {
                  if (!completedAt) return "text-gray-500";
                  if (!simEndDate) return "text-gray-700";
                  return new Date(completedAt) <= new Date(simEndDate)
                    ? "text-green-600"
                    : "text-red-500";
                })();
                const studentCode =
                  row.studentCode ??
                  row.student_code ??
                  (reportData?.["studentCode"] as string | undefined) ??
                  (reportData?.["student_code"] as string | undefined) ??
                  (row.userId
                    ? userIdToStudentCode.get(row.userId)
                    : undefined) ??
                  "—";
                const simName =
                  row.scenarioTitle ??
                  row.scenario_title ??
                  row.simulation_name ??
                  row.scenarioId ??
                  row.scenario_id ??
                  (reportData?.["scenarioTitle"] as string | undefined) ??
                  (reportData?.["scenario_title"] as string | undefined) ??
                  (reportData?.["simulation_name"] as string | undefined) ??
                  "—";
                const rawMode =
                  row.mode ??
                  (reportData?.["mode"] as string | undefined) ??
                  null;
                const isPractice = rawMode?.toLowerCase() === "practice";
                const isAssessment = rawMode?.toLowerCase() === "assessment";
                const isLate = (() => {
                  if (!isAssessment) return false;
                  const scenarioId = (
                    (row.scenario_id ?? row.scenarioId ?? "") as string
                  ).trim();
                  const rawDue =
                    (scenarioId ? dueDateBySimId.get(scenarioId) : undefined) ??
                    row.due_date ??
                    (reportData?.["due_date"] as string | undefined);
                  if (!completedAt || !rawDue) return false;
                  const dueParsed = rawDue.match(/^(\d{2})-(\d{2})-(\d{4})$/)
                    ? new Date(
                        `${rawDue.slice(6)}-${rawDue.slice(0, 2)}-${rawDue.slice(3, 5)}T23:59:59`,
                      )
                    : new Date(rawDue);
                  return (
                    !isNaN(dueParsed.getTime()) &&
                    new Date(completedAt) > dueParsed
                  );
                })();
                const modeLabel = isAssessment
                  ? t.modeAssessment
                  : isPractice
                    ? t.modePractice
                    : (rawMode ?? "—");
                const modeBadgeClass = isAssessment
                  ? "bg-blue-50 text-blue-700"
                  : isPractice
                    ? "bg-green-50 text-green-700"
                    : "bg-gray-50 text-gray-500";

                const completedAtDisplay = completedAt
                  ? (() => {
                      const d = new Date(completedAt);
                      if (isNaN(d.getTime())) return completedAt;
                      const mm = String(d.getMonth() + 1).padStart(2, "0");
                      const dd = String(d.getDate()).padStart(2, "0");
                      const yyyy = d.getFullYear();
                      const hh = String(d.getHours()).padStart(2, "0");
                      const min = String(d.getMinutes()).padStart(2, "0");
                      return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
                    })()
                  : "—";

                const rawStatusText = row.status ?? performanceLabel ?? "—";
                // translate known backend performance labels
                const statusLabelMap: Record<string, string> = {
                  Exceptional: t.statusExceptional,
                  EXCEPTIONAL: t.statusExceptional,
                  "Meets Expectation": t.statusMeetsExpectation,
                  "MEETS EXPECTATION": t.statusMeetsExpectation,
                  "Needs Improvement": t.statusNeedsImprovement,
                  "NEEDS IMPROVEMENT": t.statusNeedsImprovement,
                };
                const statusText =
                  (rawStatusText && statusLabelMap[rawStatusText]) ??
                  rawStatusText;

                const isNewReport = isReportNew(
                  row.id,
                  row.isNew,
                  viewedReportIds,
                );
                const rowScenarioId = (row.scenario_id ??
                  row.scenarioId ??
                  "") as string;
                const isTargetRow =
                  !!highlightedScenarioId &&
                  !!rowScenarioId &&
                  rowScenarioId === highlightedScenarioId;

                return (
                  <tr
                    key={i}
                    ref={i === firstMatchIndex ? firstMatchRef : undefined}
                    className={`border-t border-gray-100 hover:bg-gray-50 transition-colors ${
                      isTargetRow ? "bg-[#e9e9e9]" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select report"
                        checked={row.id ? selectedIds.has(row.id) : false}
                        onChange={() => row.id && toggleSelected(row.id)}
                        className="w-4 h-4 accent-white cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 text-[13px] font-mono text-gray-700">
                      {studentCode}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${modeBadgeClass}`}
                      >
                        {modeLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[15px] text-gray-700">
                      {simName}
                    </td>
                    <td className="px-4 py-3 text-[15px] font-medium text-gray-700">
                      {score !== null ? `${score}%` : (performanceLabel ?? "—")}
                    </td>
                    <td
                      className={`px-4 py-3 text-[14px] capitalize font-medium ${getStatusColorClass(score)}`}
                    >
                      {statusText}
                    </td>
                    <td className="px-4 py-3 text-[15px] text-gray-500">
                      {timeSpent ?? "—"}
                    </td>
                    <td
                      className={`px-4 py-3 text-[15px] font-medium ${completedAtColor}`}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {completedAtDisplay}
                        {isLate && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white leading-none tracking-wide whitespace-nowrap">
                            {t.badgeLate}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-row items-center gap-2">
                        <button
                          disabled={isClassInactive}
                          onClick={() =>
                            !isClassInactive && handleViewReport(row)
                          }
                          className={`inline-flex items-center justify-center px-2.5 py-1 border text-[11px] rounded-full font-medium transition-colors whitespace-nowrap ${
                            isClassInactive
                              ? "bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed"
                              : isNewReport
                                ? "bg-primary-500 border-primary-500 text-white hover:bg-primary-600 cursor-pointer"
                                : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 cursor-pointer"
                          }`}
                        >
                          {t.viewReport}
                        </button>
                        <button
                          disabled={isClassInactive}
                          onClick={() =>
                            !isClassInactive && handleViewTranscript(row)
                          }
                          className={`inline-flex items-center justify-center px-2.5 py-1 border text-[11px] rounded-full font-medium transition-colors whitespace-nowrap ${
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
      {exportModalOpen && (
        <ExportReportModal
          source={{ type: "class", classId }}
          onClose={() => setExportModalOpen(false)}
        />
      )}
    </div>
  );
}
