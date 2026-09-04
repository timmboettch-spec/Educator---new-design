import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";

type SupportedLang = "en" | "es";
const getStoredLanguage = (): SupportedLang => {
  const saved = localStorage.getItem("app_language")?.toLowerCase();
  return saved === "es" ? "es" : "en";
};
import EmailReportModal from "../../components/class/BulkEmailReportModal";
import AIInsightsModal from "../../components/class/simulation/AIInsightsModal";
import AddSimulationModal from "../../components/modal/AddSimulationModal";
import DeleteSimulationModal from "../../components/class/simulation/DeleteSimulationModal";
import EditSimulationModal from "../../components/class/simulation/EditSimulationModal";
import ExportGradeModal from "../../components/class/simulation/ExportGradeModal";
import ExportReportModal from "../../components/class/simulation/ExportReportModal";
import ExportTranscriptModal from "../../components/class/simulation/ExportTranscriptModal";
import {
  FetchSimulationsByClass,
  selectSimulationsByClassId,
} from "../../redux/class/GetSimsRedux";
import { clearAddSimulationState } from "../../redux/dashboard/simulationlibrary/addsimulationredux";
import {
  fetchMyLibrarySimulations,
  selectSimulationLibraryData,
} from "../../redux/dashboard/simulationlibrary/GetSimulationRedux";
import {
  selectViewedReportIds,
  isReportNew,
  markReportUnviewed,
} from "../../redux/class/GetClassRedux";
import { MarkReportViewed } from "../../redux/class/SimsCompletedreportsRedux";
import { updateSimulationRequest } from "../../redux/class/UpdateSimRedux";
import { toast } from "../common/Toast";
import { Pagination } from "../ui/Pagination";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { SimulationItem, SimulationReport, Student } from "@/types";
import SimulationReportsModal from "./simulation/SimulationReportsModal";
import StatusPill from "../common/StatusPill";
import SortableHeader from "../common/SortableHeader";
import type { SimulationReport as ReduxSimulationReport } from "@/redux/class/SimsCompletedreportsRedux";

interface SimsExpandedRowProps {
  classId: string;
  className?: string;
  classEndDate?: string;
  simulations?: SimulationItem[];
  reports?: SimulationReport[];
  students: Student[];
  isClassArchived?: boolean;
  targetSimulationId?: string;
  defaultSimReportsId?: string;
}

const MENU_ITEMS = (isEmail: boolean, t: typeof loginEn.simSubtable) => [
  { label: t.menuEdit, action: "edit", danger: false, disabled: false },
  {
    label: t.menuViewDetails,
    action: "view_details",
    danger: false,
    disabled: false,
  },
  {
    label: t.menuExportGrade,
    action: "export_grade",
    danger: false,
    disabled: false,
  },
  {
    label: t.menuExportReports,
    action: "export_reports",
    danger: false,
    disabled: false,
  },
  {
    label: t.menuExportTranscripts,
    action: "export_transcripts",
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
    label: t.menuAiInsights,
    action: "ai_insights",
    danger: false,
    disabled: false,
  },
  {
    label: t.menuEmailReports,
    action: "email_reports",
    danger: false,
    disabled: isEmail,
  },
  { label: t.menuDelete, action: "delete", danger: true, disabled: false },
];

function PortalDropdown({
  anchorEl,
  onClose,
  onSelect,
  simId,
  isEmail,
  t,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onSelect: (action: string, simId: string) => void;
  simId: string;
  isEmail: boolean;
  t: typeof loginEn.simSubtable;
}) {
  const [style, setStyle] = useState<React.CSSProperties>();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const DROPDOWN_HEIGHT = 308;
    const DROPDOWN_WIDTH = 220;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    const top =
      spaceBelow >= DROPDOWN_HEIGHT
        ? rect.bottom + 4
        : spaceAbove >= DROPDOWN_HEIGHT
          ? rect.top - DROPDOWN_HEIGHT - 4
          : rect.bottom + 4;

    setStyle({
      position: "fixed",
      top,
      left: rect.right - DROPDOWN_WIDTH,
      width: DROPDOWN_WIDTH,
      zIndex: 9999,
    });
  }, [anchorEl]);

  useEffect(() => {
    if (!anchorEl) return;
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchorEl, onClose]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (
        !target.closest("[data-sim-dropdown]") &&
        !target.closest("[data-sim-trigger]")
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  useEffect(() => {
    if (!style || !dropdownRef.current) return;

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
        onClose();
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
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [style, onClose, anchorEl]);

  if (!anchorEl) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      style={style}
      data-sim-dropdown="true"
      className="bg-white border border-gray-300 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
    >
      {MENU_ITEMS(isEmail, t)
        .filter(
          (item) =>
            item.action !== "ai_insights" && item.action !== "email_reports",
        )
        .map((item) => {
          const isDisabled = item.disabled;
          return (
            <button
              key={item.label}
              type="button"
              disabled={isDisabled}
              onClick={() => !isDisabled && onSelect(item.action, simId)}
              className={`
            w-full text-left px-5 py-3 text-sm font-normal transition-colors focus:outline-none focus-visible:bg-primary-100
            ${isDisabled ? "text-gray-300 cursor-not-allowed" : item.danger ? "text-red-500 hover:text-red-600 hover:bg-gray-50" : "text-gray-700 hover:text-gray-900 hover:bg-gray-50"}
            ${item.danger ? "border-t border-gray-100" : ""}
          `}
            >
              {item.label}
            </button>
          );
        })}
    </div>,
    document.body,
  );
}

type SimStatus = "ongoing" | "future" | "past";

function getSimStatus(
  startDate: string | undefined,
  endDate: string | undefined,
  now: dayjs.Dayjs,
): SimStatus {
  const start = startDate
    ? dayjs(startDate, ["MM-DD-YYYY", "YYYY-MM-DD"])
    : null;
  const end = endDate ? dayjs(endDate, ["MM-DD-YYYY", "YYYY-MM-DD"]) : null;

  if (start && start.isAfter(now, "day")) return "future";
  if (end && end.isBefore(now, "day")) return "past";
  return "ongoing";
}

// Date-cell text color by assignment status: dark-gray brand for ongoing,
// brand orange for future, red for expired (past). (Names use their own rule.)
const STATUS_COLOR: Record<SimStatus, string> = {
  ongoing: "text-[#5f6060]",
  future: "text-[#db8833]",
  past: "text-red-500",
};

/**
 * Whether the underlying simulation/scenario has been archived (distinct from the
 * assignment being past its close date). Drives the light-gray name indicator and
 * forces the assignment status to "Closed".
 */
const isSimArchived = (sim: SimulationItem): boolean =>
  /archiv/i.test(String(sim.scenario_status ?? ""));

// Small metadata chips shown under a sim title (same idea as the catalog /
// library tiles): learner level · modality · difficulty · estimated duration.
// The assignment record rarely carries this metadata, so the scenario looked up
// from the library catalog (`meta`, by simulation_id) is preferred; the
// assignment's own fields are the fallback.
const simMetaChips = (
  sim: SimulationItem,
  meta?: Record<string, unknown>,
): string[] => {
  const s = sim as unknown as Record<string, unknown>;
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = meta?.[k] ?? s[k];
      if (Array.isArray(v) && v.length) return v.join(" ");
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  const chips: string[] = [];
  const lvlRaw = pick("learnerLevel", "learner_level", "targetAudience");
  if (lvlRaw) chips.push(/post/i.test(lvlRaw) ? "Post-Secondary" : "Secondary");
  const avatar =
    (meta?.avatarEnabled as boolean | undefined) ?? sim.avatarEnabled;
  if (typeof avatar === "boolean")
    chips.push(avatar ? "Avatar" : "Workstation");
  const diff = pick("difficulty", "difficultyLevel");
  if (diff) chips.push(diff.charAt(0).toUpperCase() + diff.slice(1).toLowerCase());
  const dur = pick("duration", "estimatedDuration", "estimated_duration");
  if (dur) chips.push(/[a-z]/i.test(dur) ? dur : `${dur} min`);
  return chips;
};

export default function SimsExpandedRow({
  students,
  classId,
  className,
  classEndDate,
  simulations,
  reports,
  isClassArchived,
  targetSimulationId,
  defaultSimReportsId,
}: SimsExpandedRowProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const t = (getStoredLanguage() === "es" ? loginEs : loginEn).simSubtable;
  // Catalog/library data (metadata by simulation_id) for the sim-title chips.
  const libraryData = useAppSelector(selectSimulationLibraryData);
  useEffect(() => {
    if (!libraryData || libraryData.length === 0) {
      void dispatch(fetchMyLibrarySimulations());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const scenarioMetaById = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    (libraryData ?? []).forEach((s) => {
      const rec = s as unknown as Record<string, unknown>;
      const id = String(rec.simulation_id ?? rec.id ?? "").trim();
      if (id) map.set(id, rec);
    });
    return map;
  }, [libraryData]);
  const simsFromStore = useAppSelector(selectSimulationsByClassId(classId));
  const sims = simsFromStore !== null ? simsFromStore : (simulations ?? []);
  const resolvedSims = useMemo(() => {
    const byKey = new Map<string, SimulationItem>();
    const addItems = (items: SimulationItem[] | null | undefined) => {
      (items ?? []).forEach((item) => {
        const simId = String(item.simulation_id ?? "").trim();
        const assignmentId = String(item.id ?? "").trim();
        if (simId) byKey.set(simId, item);
        if (assignmentId) byKey.set(assignmentId, item);
      });
    };

    addItems(simulations);
    addItems(simsFromStore);

    return (sims ?? []).map((sim) => {
      const simId = String(sim.simulation_id ?? "").trim();
      const assignmentId = String(sim.id ?? "").trim();
      const fallback = byKey.get(simId) ?? byKey.get(assignmentId);
      const resolvedTitle =
        String(sim.simulation_title ?? "").trim() ||
        String(sim.simulation_lib_name ?? "").trim() ||
        String(fallback?.simulation_title ?? "").trim() ||
        String(fallback?.simulation_lib_name ?? "").trim();

      return {
        ...sim,
        simulation_title: resolvedTitle,
      };
    });
  }, [sims, simulations, simsFromStore]);

  const [now, setNow] = useState(() => dayjs());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [menuState, setMenuState] = useState<{
    simId: string;
    anchor: HTMLElement;
  } | null>(null);
  const [editSim, setEditSim] = useState<SimulationItem | null>(null);
  // Inline date editing directly from the table (start / due / close).
  type DateField = "start_date" | "due_date" | "end_date";
  const [editingDate, setEditingDate] = useState<{
    simId: string;
    field: DateField;
  } | null>(null);
  const toApiDate = (d?: string) =>
    d ? dayjs(d, ["MM-DD-YYYY", "YYYY-MM-DD"]).format("MM-DD-YYYY") : "";
  const toInputDate = (d?: string) =>
    d ? dayjs(d, ["MM-DD-YYYY", "YYYY-MM-DD"]).format("YYYY-MM-DD") : "";
  const saveInlineDate = async (
    sim: SimulationItem,
    field: DateField,
    inputValue: string,
  ) => {
    setEditingDate(null);
    if (!inputValue) return;
    const next = {
      start_date: toApiDate(sim.start_date),
      due_date: toApiDate(sim.due_date),
      end_date: toApiDate(sim.end_date),
    };
    next[field] = toApiDate(inputValue);
    if (next[field] === toApiDate((sim as Record<DateField, string>)[field])) return;
    await dispatch(
      updateSimulationRequest({
        simId: sim.id,
        start_date: next.start_date,
        due_date: next.due_date,
        end_date: next.end_date,
      }),
    );
    await dispatch(FetchSimulationsByClass({ classId }));
    toast.success("Date updated.");
  };
  const [exportSim, setExportSim] = useState<SimulationItem | null>(null);
  const [reportSim, setReportSim] = useState<SimulationItem | null>(null);
  const [transcriptSim, setTranscriptSim] = useState<SimulationItem | null>(
    null,
  );
  const [reportsModalData, setReportsModalData] = useState<{
    sim: SimulationItem;
    reports: SimulationReport[];
  } | null>(null);

  useEffect(() => {
    if (!defaultSimReportsId || reportsModalData || !resolvedSims.length)
      return;
    const sim = resolvedSims.find(
      (s) =>
        (s.simulation_id ?? s.id) === defaultSimReportsId ||
        s.id === defaultSimReportsId,
    );
    if (sim) setReportsModalData({ sim, reports: getReportsForSim(sim) });
  }, [resolvedSims]);
  const [emailSim, setEmailSim] = useState<SimulationItem | null>(null);
  const [deleteSim, setDeleteSim] = useState<SimulationItem | null>(null);
  const [insightsSim, setInsightsSim] = useState<SimulationItem | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [highlightedSimulationId, setHighlightedSimulationId] = useState<
    string | null
  >(null);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(dayjs()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!targetSimulationId || !resolvedSims || resolvedSims.length === 0) {
      return;
    }

    const target = targetSimulationId.trim();
    const index = resolvedSims.findIndex((sim) => {
      const primary = String(sim.simulation_id ?? "").trim();
      const fallback = String(sim.id ?? "").trim();
      return primary === target || fallback === target;
    });

    if (index === -1) {
      return;
    }

    const matched = resolvedSims[index];
    setCurrentPage(Math.floor(index / itemsPerPage) + 1);
    setHighlightedSimulationId(String(matched.id));

    const timer = setTimeout(() => {
      setHighlightedSimulationId(null);
    }, 2500);

    return () => clearTimeout(timer);
  }, [targetSimulationId, resolvedSims, itemsPerPage]);

  const handleMenuAction = (action: string, simId: string) => {
    setMenuState(null);
    const sim = resolvedSims?.find((s) => s.id === simId) ?? null;

    if (action === "edit") {
      setEditSim(sim);
      return;
    }
    if (action === "view_details") {
      if (!sim) return;
      const catalogSimId = String(sim.simulation_id ?? sim.id ?? "").trim();
      if (!catalogSimId) return;
      navigate(`/simulationdetails/${encodeURIComponent(catalogSimId)}`, {
        state: {
          simulationId: catalogSimId,
          fromClasses: true,
          classId,
          expandType: "sims" as const,
        },
      });
      return;
    }
    if (action === "export_grade") {
      setExportSim(sim);
      return;
    }
    if (action === "export_reports") {
      setReportSim(sim);
      return;
    }
    if (action === "export_transcripts") {
      setTranscriptSim(sim);
      return;
    }
    if (action === "email_reports") {
      setEmailSim(sim);
      return;
    }
    if (action === "mark_all_reviewed" || action === "mark_all_unreviewed") {
      if (!sim) return;
      const ids = getReportsForSim(sim)
        .map((r) => (r as { id?: string }).id)
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
    if (action === "delete") {
      setDeleteSim(sim);
      return;
    }
    if (action === "ai_insights") {
      setInsightsSim(sim);
      return;
    }
  };
  const classReports = reports ?? [];
  const viewedReportIds = useAppSelector(selectViewedReportIds);

  const getReportsForSim = (sim: SimulationItem) => {
    const simId = String(sim.simulation_id ?? sim.id ?? "").trim();
    const normTitle = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
    const simTitle = normTitle(sim.simulation_title ?? "");
    const simLibName = normTitle(sim.simulation_lib_name ?? "");

    return classReports.filter((r) => {
      const rRaw = r as unknown as Record<string, unknown>;
      const rId = String(
        (
          r as {
            scenarioId?: string;
            simulation_id?: string;
            scenario_id?: string;
          }
        ).scenarioId ??
          (r as { simulation_id?: string }).simulation_id ??
          (r as { scenario_id?: string }).scenario_id ??
          rRaw["class_simulation_id"] ??
          "",
      ).trim();
      if (simId && rId && rId === simId) return true;

      const rTitle = normTitle(
        String(
          (
            r as {
              scenarioTitle?: string;
              simulation_name?: string;
              scenario_title?: string;
            }
          ).scenarioTitle ??
            (r as { simulation_name?: string }).simulation_name ??
            (r as { scenario_title?: string }).scenario_title ??
            "",
        ),
      );
      if (rTitle) {
        if (simTitle && rTitle === simTitle) return true;
        if (simLibName && rTitle === simLibName) return true;
      }
      return false;
    });
  };

  const simStats = useMemo(() => {
    const map = new Map<
      string,
      { started: number; completed: number; avgScore: string }
    >();
    if (!resolvedSims) return map;

    for (const sim of resolvedSims) {
      const simId = String(sim.simulation_id ?? sim.id ?? "").trim();
      const matched = getReportsForSim(sim);

      if (matched.length === 0) {
        map.set(simId, { started: 0, completed: 0, avgScore: "-" });
        continue;
      }

      const studentMap = new Map<string, { scores: number[] }>();
      for (const r of matched) {
        const key =
          r.userId ??
          r.student_id ??
          r.studentName ??
          r.key ??
          `_${matched.indexOf(r)}`;
        if (!studentMap.has(key)) studentMap.set(key, { scores: [] });
        const rRaw = r as unknown as Record<string, unknown>;
        const rScoreJson =
          rRaw["scoreJson"] && typeof rRaw["scoreJson"] === "object"
            ? (rRaw["scoreJson"] as Record<string, unknown>)
            : undefined;
        const raw =
          r.score ??
          (typeof rScoreJson?.["overallScore"] === "number"
            ? (rScoreJson["overallScore"] as number)
            : null);
        if (raw !== null) {
          const pct =
            raw <= 1 && raw >= 0 ? Math.round(raw * 100) : Math.round(raw);
          studentMap.get(key)!.scores.push(pct);
        }
      }

      const started = studentMap.size;
      const completedStudents = Array.from(studentMap.values()).filter(
        (s) => s.scores.length > 0,
      );
      const completed = completedStudents.length;
      const perStudentBest = completedStudents.map((s) =>
        Math.max(...s.scores),
      );
      const avgScore =
        perStudentBest.length > 0
          ? `${Math.round(perStudentBest.reduce((a, b) => a + b, 0) / perStudentBest.length)}%`
          : "-";

      const entry = { started, completed, avgScore };
      map.set(simId, entry);
      if (sim.id && sim.id !== simId) map.set(sim.id, entry);
    }
    return map;
  }, [resolvedSims, classReports]);

  const totalSimItems = resolvedSims?.length ?? 0;
  const totalSimPages = Math.max(1, Math.ceil(totalSimItems / itemsPerPage));

  const sortedSims = useMemo(() => {
    if (!resolvedSims) return [];
    if (!sortKey) return resolvedSims;
    return [...resolvedSims].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";
      if (sortKey === "simulation_title") {
        aVal = (a.simulation_title ?? "").toLowerCase();
        bVal = (b.simulation_title ?? "").toLowerCase();
      } else if (
        sortKey === "start_date" ||
        sortKey === "due_date" ||
        sortKey === "end_date"
      ) {
        aVal = a[sortKey]
          ? dayjs(a[sortKey], ["MM-DD-YYYY", "YYYY-MM-DD"]).valueOf()
          : 0;
        bVal = b[sortKey]
          ? dayjs(b[sortKey], ["MM-DD-YYYY", "YYYY-MM-DD"]).valueOf()
          : 0;
      } else if (sortKey === "status") {
        // future < ongoing < past < archived (a stable, meaningful order).
        const order: Record<string, number> = { future: 0, ongoing: 1, past: 2 };
        const rank = (s: SimulationItem) =>
          isSimArchived(s) ? 3 : order[getSimStatus(s.start_date, s.end_date, now)];
        aVal = rank(a);
        bVal = rank(b);
      } else if (
        sortKey === "started" ||
        sortKey === "completed" ||
        sortKey === "average"
      ) {
        const pick = (s: SimulationItem) => {
          const st = simStats.get(String(s.simulation_id ?? s.id ?? "").trim());
          if (sortKey === "started") return st?.started ?? 0;
          if (sortKey === "completed") return st?.completed ?? 0;
          return parseFloat(String(st?.avgScore ?? "")) || 0;
        };
        aVal = pick(a);
        bVal = pick(b);
      } else if (sortKey === "reports") {
        // Sort by number of unread reports for the sim (read vs unread).
        const unread = (s: SimulationItem) =>
          getReportsForSim(s).filter((r) =>
            isReportNew(
              (r as { id?: string }).id ?? "",
              (r as { isNew?: boolean }).isNew,
              viewedReportIds,
            ),
          ).length;
        aVal = unread(a);
        bVal = unread(b);
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [resolvedSims, sortKey, sortDir, now, simStats, viewedReportIds, classReports]);

  const pagedSims = sortedSims.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  return (
    <div className="px-4 pb-4 pt-4 transition-opacity duration-150 ease-out">
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
          <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#5a6475] text-white text-left">
              <th className="px-3 py-2.5 whitespace-nowrap sticky left-0 z-20 bg-[#5a6475]">
                <div className="flex items-center gap-3">
                  <SortableHeader
                    label={t.headerSimName}
                    field="simulation_title"
                    sortField={sortKey}
                    sortDirection={sortDir}
                    onSort={handleSort}
                    className="text-sm font-semibold"
                  />
                  {/* Archived-simulation key, moved into the Sim Name header. */}
                  <span className="flex items-center gap-1 text-[10px] font-normal text-white/70 normal-case">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#e9e9e9] border border-gray-300 inline-block" />
                    {t.legendArchived}
                  </span>
                </div>
              </th>
              <th className="px-3 py-2.5 whitespace-nowrap">
                <SortableHeader
                  label={t.headerStartDate}
                  field="start_date"
                  sortField={sortKey}
                  sortDirection={sortDir}
                  onSort={handleSort}
                  className="text-sm font-semibold"
                />
              </th>
              <th className="px-3 py-2.5 whitespace-nowrap">
                <SortableHeader
                  label={t.headerDueDate}
                  field="due_date"
                  sortField={sortKey}
                  sortDirection={sortDir}
                  onSort={handleSort}
                  className="text-sm font-semibold"
                />
              </th>
              <th className="px-3 py-2.5 whitespace-nowrap">
                <SortableHeader
                  label={t.headerCloseDate}
                  field="end_date"
                  sortField={sortKey}
                  sortDirection={sortDir}
                  onSort={handleSort}
                  className="text-sm font-semibold"
                />
              </th>
              <th className="px-3 py-2.5 whitespace-nowrap">
                <SortableHeader
                  label={t.headerStatus}
                  field="status"
                  sortField={sortKey}
                  sortDirection={sortDir}
                  onSort={handleSort}
                  className="text-sm font-semibold"
                />
              </th>
              <th className="px-3 py-2.5 whitespace-nowrap">
                <SortableHeader
                  label={t.headerStarted}
                  field="started"
                  sortField={sortKey}
                  sortDirection={sortDir}
                  onSort={handleSort}
                  className="text-sm font-semibold justify-center w-full"
                />
              </th>
              <th className="px-3 py-2.5 whitespace-nowrap">
                <SortableHeader
                  label={t.headerCompleted}
                  field="completed"
                  sortField={sortKey}
                  sortDirection={sortDir}
                  onSort={handleSort}
                  className="text-sm font-semibold justify-center w-full"
                />
              </th>
              <th className="px-3 py-2.5 whitespace-nowrap">
                <SortableHeader
                  label={t.headerAverage}
                  field="average"
                  sortField={sortKey}
                  sortDirection={sortDir}
                  onSort={handleSort}
                  className="text-sm font-semibold justify-center w-full"
                />
              </th>
              <th className="px-3 py-2.5 font-semibold text-sm whitespace-nowrap">
                <SortableHeader
                  label={t.headerReports}
                  field="reports"
                  sortField={sortKey}
                  sortDirection={sortDir}
                  onSort={handleSort}
                  className="text-sm font-semibold justify-center w-full"
                />
              </th>
              <th className="px-3 py-2.5 font-semibold text-sm whitespace-nowrap">
                {t.headerActions}
              </th>
            </tr>
          </thead>
          <tbody>
            {resolvedSims?.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="text-center py-6 text-gray-500 text-xs"
                >
                  {t.noSimsAssigned}
                </td>
              </tr>
            ) : (
              pagedSims.map((sim) => {
                const isHighlighted =
                  highlightedSimulationId === String(sim.id);
                return (
                  <tr
                    key={sim.id}
                    className={`border-t border-gray-100 hover:bg-gray-50 transition-colors ${isHighlighted ? "bg-[#e9e9e9]" : ""}`}
                  >
                    <td
                      className={`px-4 py-3 font-medium sticky left-0 z-10 ${isHighlighted ? "bg-[#e9e9e9]" : "bg-white"}`}
                    >
                      {(() => {
                        const archived = isSimArchived(sim);
                        const chips = simMetaChips(
                          sim,
                          scenarioMetaById.get(
                            String(sim.simulation_id ?? "").trim(),
                          ),
                        );
                        return (
                          <div className="flex flex-col gap-1">
                            <div
                              className={`flex items-center gap-2 font-medium ${
                                archived ? "text-[#e9e9e9]" : "text-[#5f6060]"
                              }`}
                            >
                              {/* Light-gray indicator: the simulation itself has
                                  been archived (only on previously-assigned sims). */}
                              {archived && (
                                <span
                                  className="w-2.5 h-2.5 rounded-full bg-[#e9e9e9] border border-gray-300 inline-block flex-shrink-0"
                                  title="This simulation has been archived"
                                  aria-label="Archived simulation"
                                />
                              )}
                              {sim.simulation_title || "-"}
                            </div>
                            {chips.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {chips.map((c) => (
                                  <span
                                    key={c}
                                    className="inline-flex items-center text-[11px] rounded-full px-2 py-0.5 bg-[#e9e9e9] text-[#5f6060] border border-gray-300 whitespace-nowrap"
                                  >
                                    {c}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    {(() => {
                      const status = getSimStatus(
                        sim.start_date,
                        sim.end_date,
                        now,
                      );
                      const color = STATUS_COLOR[status];
                      const renderDateCell = (field: DateField, value?: string) => {
                        const isEditing =
                          editingDate?.simId === sim.id &&
                          editingDate.field === field;
                        return (
                          <td
                            className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${color}`}
                          >
                            {isEditing ? (
                              <input
                                type="date"
                                autoFocus
                                aria-label={`Edit ${String(field).replace(/_/g, " ")}`}
                                defaultValue={toInputDate(value)}
                                onChange={(e) =>
                                  void saveInlineDate(sim, field, e.target.value)
                                }
                                onBlur={() => setEditingDate(null)}
                                onClick={(e) => e.stopPropagation()}
                                className="border border-gray-300 rounded px-1.5 py-0.5 text-xs text-gray-800 focus:outline-none focus:border-primary-400"
                              />
                            ) : (
                              <button
                                type="button"
                                disabled={isClassArchived}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isClassArchived)
                                    setEditingDate({ simId: sim.id, field });
                                }}
                                title={isClassArchived ? undefined : "Click to edit"}
                                className={
                                  isClassArchived
                                    ? "cursor-default"
                                    : "cursor-pointer hover:underline decoration-dotted underline-offset-2"
                                }
                              >
                                {value
                                  ? dayjs(value, [
                                      "MM-DD-YYYY",
                                      "YYYY-MM-DD",
                                    ]).format("MM-DD-YYYY")
                                  : "-"}
                              </button>
                            )}
                          </td>
                        );
                      };
                      return (
                        <>
                          {renderDateCell("start_date", sim.start_date)}
                          {renderDateCell("due_date", sim.due_date)}
                          {renderDateCell("end_date", sim.end_date)}
                          <td className="px-4 py-3">
                            {(() => {
                              // The chip itself is the key: green=Active,
                              // orange=Future, red=Past. Archived OR past-close →
                              // Past (red).
                              const past =
                                isSimArchived(sim) || status === "past";
                              if (past) {
                                return (
                                  <StatusPill tone="danger" label={t.statusPast} />
                                );
                              }
                              if (status === "future") {
                                return (
                                  <span className="inline-flex items-center justify-center text-[10px] uppercase tracking-wide font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap bg-[#fbe7d0] text-[#a55a12]">
                                    {t.statusFuture}
                                  </span>
                                );
                              }
                              return (
                                <StatusPill
                                  tone="success"
                                  label={t.statusActive}
                                />
                              );
                            })()}
                          </td>
                        </>
                      );
                    })()}
                    {(() => {
                      const simId = String(
                        sim.simulation_id ?? sim.id ?? "",
                      ).trim();
                      const stats = simStats.get(simId);
                      return (
                        <>
                          <td className="px-4 py-3 text-base text-center font-semibold text-gray-700 tabular-nums">
                            {stats && stats.started > 0 ? stats.started : "-"}
                          </td>
                          <td className="px-4 py-3 text-base text-center font-semibold text-gray-700 tabular-nums">
                            {stats && stats.completed > 0
                              ? stats.completed
                              : "-"}
                          </td>
                          <td className="px-4 py-3 text-base text-center font-semibold text-gray-700 tabular-nums">
                            {stats ? stats.avgScore : "-"}
                          </td>
                        </>
                      );
                    })()}
                    <td className="px-4 py-3 text-center">
                      {(() => {
                        const simReports = getReportsForSim(sim);
                        const hasUnread = simReports.some((r) =>
                          isReportNew(
                            r.id,
                            r.isNew as boolean | undefined,
                            viewedReportIds,
                          ),
                        );
                        return (
                          <button
                            onClick={() =>
                              setReportsModalData({ sim, reports: simReports })
                            }
                            className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full font-medium cursor-pointer transition-colors border ${
                              hasUnread
                                ? "bg-primary-500 border-primary-500 text-white hover:bg-primary-600"
                                : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                            }`}
                          >
                            {t.reportsButton}
                          </button>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        data-sim-trigger="true"
                        aria-label="Simulation actions"
                        aria-haspopup="menu"
                        aria-expanded={menuState?.simId === sim.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          const anchor = e.currentTarget as HTMLElement;
                          setMenuState(
                            menuState?.simId === sim.id
                              ? null
                              : { simId: sim.id, anchor },
                          );
                        }}
                        className="text-gray-500 hover:text-gray-600 text-lg font-bold tracking-widest px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                      >
                        <span aria-hidden="true">···</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          </table>
        </div>
      </div>

      {totalSimPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalSimPages}
          totalItems={totalSimItems}
          itemsPerPage={itemsPerPage}
          onPageChange={(page) => setCurrentPage(page)}
          onItemsPerPageChange={(size) => {
            setItemsPerPage(size);
            setCurrentPage(1);
          }}
          hideResultsInfo
          hideItemsPerPage
          className="flex justify-end items-center py-2 px-1 bg-background-pagination border-t border-gray-100"
        />
      )}

      {menuState && (
        <PortalDropdown
          anchorEl={menuState.anchor}
          simId={menuState.simId}
          onClose={() => setMenuState(null)}
          onSelect={handleMenuAction}
          isEmail={students[0]?.email ? false : true}
          t={t}
        />
      )}
      {isClassArchived ? null : (
        <div className="flex justify-center mt-3">
          <button
            onClick={() => {
              if (isClassArchived) return;
              dispatch(clearAddSimulationState());
              setIsModalOpen(true);
            }}
            className={`flex items-center gap-2 px-5 py-2.5 bg-gradient-btn text-white text-sm font-semibold rounded-full transition-opacity shadow-md shadow-primary-200 ${
              isClassArchived ? "cursor-not-allowed" : "hover:opacity-90"
            }`}
          >
            ＋ {t.createAssignment}
          </button>
        </div>
      )}
      {isModalOpen && (
        <AddSimulationModal
          isOpen={isModalOpen}
          classId={classId}
          classEndDate={classEndDate}
          students={students}
          simulations={sims}
          onAssigned={async () => {
            await dispatch(FetchSimulationsByClass({ classId }));
          }}
          onClose={async () => {
            setIsModalOpen(false);
          }}
        />
      )}

      {editSim && (
        <EditSimulationModal
          sim={editSim}
          classId={classId}
          className={className}
          onClose={() => {
            setEditSim(null);
            // Small delay ensures the DB has committed before refetching
            setTimeout(() => {
              dispatch(FetchSimulationsByClass({ classId }));
            }, 300);
          }}
        />
      )}

      {exportSim && (
        <ExportGradeModal
          sim={exportSim}
          className={className}
          classId={classId}
          students={students}
          onClose={() => setExportSim(null)}
        />
      )}

      {reportSim && (
        <ExportReportModal
          source={{
            type: "sim",
            simId: reportSim.simulation_id ?? reportSim.id,
            simName: reportSim.simulation_title,
            startDate: reportSim.start_date,
            endDate: reportSim.end_date,
            class_id: classId,
            className: className,
          }}
          students={[]}
          onClose={() => setReportSim(null)}
        />
      )}
      {transcriptSim && (
        <ExportTranscriptModal
          source={{
            type: "sim",
            simId: transcriptSim.simulation_id ?? transcriptSim.id,
            simName: transcriptSim.simulation_title,
            startDate: transcriptSim.start_date,
            endDate: transcriptSim.end_date,
            class_id: classId,
            className: className,
          }}
          students={[]}
          onClose={() => setTranscriptSim(null)}
        />
      )}

      {reportsModalData && (
        <SimulationReportsModal
          simId={reportsModalData.sim.simulation_id ?? reportsModalData.sim.id}
          simAssignmentId={reportsModalData.sim.id}
          simName={reportsModalData.sim.simulation_title}
          classId={classId}
          reports={
            reportsModalData.reports as unknown as ReduxSimulationReport[]
          }
          onClose={() => setReportsModalData(null)}
        />
      )}

      {emailSim && (
        <EmailReportModal classId={classId} onClose={() => setEmailSim(null)} />
      )}
      {insightsSim && (
        <AIInsightsModal
          sim={insightsSim}
          onClose={() => setInsightsSim(null)}
        />
      )}
      {deleteSim && (
        <DeleteSimulationModal
          sim={deleteSim}
          classId={classId}
          onClose={() => setDeleteSim(null)}
          onDeleted={() => {
            setDeleteSim(null);
            dispatch(FetchSimulationsByClass({ classId }));
          }}
        />
      )}
    </div>
  );
}
