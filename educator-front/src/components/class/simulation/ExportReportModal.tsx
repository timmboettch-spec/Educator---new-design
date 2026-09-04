import { Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import loginEn from "../../../locales/auth/login/en.json";
import loginEs from "../../../locales/auth/login/es.json";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch } from "../../../store";
import type { Student } from "../../../types/Class_types";
import type { ExportSource } from "../../../types";
import {
  GetClassSimulationReports,
  GetStudentSimulationReports,
  resetClassReports,
  resetSimulationReports,
  resetStudentReports,
  selectClassReports,
  selectClassReportsStatus,
  selectSimulationReports,
  selectSimulationReportsStatus,
  selectStudentReports,
  selectStudentReportsStatus,
  type SimulationReport,
} from "../../../redux/class/SimsCompletedreportsRedux";
import {
  generateMultiReportPDF,
  generateZipOfPDFs,
} from "@/components/reports/generateReportPDF";
import { SimulationOption } from "../../../types";
import { toast } from "../../../components/common/Toast";
import Modal from "../../ui/Modal";

interface Props {
  source: ExportSource;
  students?: Student[];
  onClose: () => void;
}

function buildStudentNameById(students?: Student[]): Record<string, string> {
  const map: Record<string, string> = {};
  (students ?? []).forEach((s) => {
    const name = s.student_name?.trim();
    if (!name) return;
    if (s.student_id) map[s.student_id] = name;
    if (s.user_id) map[s.user_id] = name;
    if (s.id) map[s.id] = name;
  });
  return map;
}

function buildStudentIdentityById(
  students: Student[] | undefined,
  className?: string,
): Record<
  string,
  {
    studentName?: string;
    studentCode?: string;
    studentEmail?: string;
    className?: string;
  }
> {
  const map: Record<
    string,
    {
      studentName?: string;
      studentCode?: string;
      studentEmail?: string;
      className?: string;
    }
  > = {};
  (students ?? []).forEach((s) => {
    const identity = {
      studentName: s.student_name ?? undefined,
      studentCode: s.student_id ?? undefined,
      studentEmail: s.email ?? undefined,
      className: className ?? undefined,
    };
    if (s.student_id) map[s.student_id] = identity;
    if (s.user_id) map[s.user_id] = identity;
    if (s.id) map[s.id] = identity;
  });
  return map;
}

export default function ExportReportModal({
  source,
  students: propStudents,
  onClose,
}: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const t = (
    localStorage.getItem("app_language")?.toLowerCase() === "es"
      ? loginEs
      : loginEn
  ).exportReportModal;
  const studentReports = useSelector(selectStudentReports);
  const studentReportsStatus = useSelector(selectStudentReportsStatus);
  const classReports = useSelector(selectClassReports);
  const classReportsStatus = useSelector(selectClassReportsStatus);
  const simulationReports = useSelector(selectSimulationReports);
  const simulationReportsStatus = useSelector(selectSimulationReportsStatus);
  const [downloading, setDownloading] = useState(false);
  const [selectedSimulation, setSelectedSimulation] =
    useState<SimulationOption | null>(null);
  const [simulationOptions, setSimulationOptions] = useState<
    SimulationOption[]
  >([]);
  const sourceType = source.type;
  const sourceClassId =
    sourceType === "class" ? source.classId : source.class_id;
  const sourceSimId = sourceType === "sim" ? source.simId : undefined;

  const showError = (msg: string) => {
    toast.error(`Export Failed: ${msg}`);
  };

  const isSingleStudent = (propStudents?.length ?? 0) === 1;
  const singleStudent = isSingleStudent ? propStudents![0] : null;

  const resolvedStudentReports: SimulationReport[] = (() => {
    if (!isSingleStudent) return [];
    if (studentReports.length > 0) return studentReports;
    const studentUserId = singleStudent?.user_id;
    const studentId = singleStudent?.student_id;
    return classReports.filter((r: SimulationReport) => {
      const raw = r as unknown as Record<string, unknown>;
      const rUserId =
        r.userId ??
        (raw["userId"] as string | undefined) ??
        (raw["user_id"] as string | undefined);
      const rStudentId =
        r.student_id ??
        (raw["studentCode"] as string | undefined) ??
        (raw["student_code"] as string | undefined);
      return (
        (!!studentUserId && rUserId === studentUserId) ||
        (!!studentId && (rUserId === studentId || rStudentId === studentId))
      );
    });
  })();

  useEffect(() => {
    if (isSingleStudent && singleStudent?.student_id) {
      const studentCode = String(singleStudent.student_id).replace(/-+/g, "");
      dispatch(resetStudentReports());
      dispatch(GetStudentSimulationReports({ studentId: studentCode }));
      if (sourceClassId) {
        dispatch(resetClassReports());
        dispatch(GetClassSimulationReports({ classId: sourceClassId }));
      }
    } else if (sourceType === "sim" && sourceSimId) {
      dispatch(resetSimulationReports());
      (async () => {
        try {
          if (sourceClassId) {
            dispatch(resetClassReports());
            await dispatch(
              GetClassSimulationReports({ classId: sourceClassId }),
            );
          }
        } catch {
          showError("Failed to load simulation reports.");
        }
      })();
    } else {
      const classId = sourceClassId;
      if (classId) {
        dispatch(resetClassReports());
        dispatch(GetClassSimulationReports({ classId }));
      }
    }
  }, [
    dispatch,
    isSingleStudent,
    singleStudent?.student_id,
    sourceType,
    sourceSimId,
    sourceClassId,
  ]);

  useEffect(() => {
    const reports = isSingleStudent
      ? resolvedStudentReports
      : sourceType === "sim"
        ? simulationReports.length > 0
          ? simulationReports
          : classReports
        : classReports;
    if (!reports || reports.length === 0) {
      setSimulationOptions([]);
      setSelectedSimulation(null);
      return;
    }
    const map = new Map<string, SimulationOption>();
    reports.forEach((r: SimulationReport) => {
      const raw = r as unknown as Record<string, unknown>;
      const reportData =
        raw["report_data"] && typeof raw["report_data"] === "object"
          ? (raw["report_data"] as Record<string, unknown>)
          : undefined;
      const simId =
        r.simulation_id ??
        r.scenario_id ??
        r.scenarioId ??
        (raw["class_simulation_id"] as string | undefined) ??
        (reportData?.["simulation_id"] as string | undefined) ??
        (reportData?.["scenario_id"] as string | undefined) ??
        (reportData?.["scenarioId"] as string | undefined) ??
        (reportData?.["class_simulation_id"] as string | undefined);
      const simTitle =
        r.simulation_name ?? r.scenarioTitle ?? r.scenario_title ?? simId;
      if (simId && !map.has(simId)) {
        map.set(simId, {
          id: simId,
          title: simTitle ?? simId,
          scenario_id: simId,
        });
      }
    });
    const sims = Array.from(map.values());
    setSimulationOptions(sims);
    setSelectedSimulation(sims[0] ?? null);
  }, [
    studentReports,
    classReports,
    simulationReports,
    isSingleStudent,
    sourceType,
    singleStudent?.user_id,
    singleStudent?.student_id,
  ]);

  const activeReports = isSingleStudent
    ? resolvedStudentReports
    : sourceType === "sim"
      ? simulationReports.length > 0
        ? simulationReports
        : classReports
      : classReports;

  const handleDownload = async () => {
    if (activeReports.length === 0) {
      showError("No completed simulations found to export.");
      return;
    }
    if (!selectedSimulation) {
      showError("Please select a simulation.");
      return;
    }

    const filteredReports = activeReports.filter((r: SimulationReport) => {
      const raw = r as unknown as Record<string, unknown>;
      const reportData =
        raw["report_data"] && typeof raw["report_data"] === "object"
          ? (raw["report_data"] as Record<string, unknown>)
          : undefined;
      const reportIds = [
        r.simulation_id,
        r.scenario_id,
        r.scenarioId,
        raw["class_simulation_id"] as string | undefined,
        reportData?.["simulation_id"] as string | undefined,
        reportData?.["scenario_id"] as string | undefined,
        reportData?.["scenarioId"] as string | undefined,
        reportData?.["class_simulation_id"] as string | undefined,
      ].filter(Boolean) as string[];
      return reportIds.includes(selectedSimulation.id);
    });

    if (filteredReports.length === 0) {
      showError("No data found for the selected simulation.");
      return;
    }

    const _now = new Date();
    const _ts = `${_now.getFullYear()}${String(_now.getMonth() + 1).padStart(2, "0")}${String(_now.getDate()).padStart(2, "0")}${String(_now.getHours()).padStart(2, "0")}${String(_now.getMinutes()).padStart(2, "0")}`;
    const _className = (source.className ?? "")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_]/g, "")
      .slice(0, 50);
    // filenameBase / studentNameById / studentIdentityById reserved for when zip export is re-enabled
    void `${_ts}_${_className}_rtp_blk_exp`;

    setDownloading(true);
    try {
      await new Promise((r) => setTimeout(r, 300));
      await generateZipOfPDFs(
        filteredReports,
        `${_ts}_${_className}_rtp_blk_exp.zip`,
        buildStudentNameById(propStudents),
        buildStudentIdentityById(propStudents, source.className),
      );
      onClose();
    } catch {
      showError("Export failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const handleSingleStudentDownload = async () => {
    if (resolvedStudentReports.length === 0) {
      showError("No completed simulations found to export.");
      return;
    }
    if (!selectedSimulation) {
      showError("Please select a simulation.");
      return;
    }

    const filteredReports = resolvedStudentReports.filter(
      (r: SimulationReport) => {
        const reportId = r.simulation_id ?? r.scenario_id ?? r.scenarioId;
        return reportId === selectedSimulation.id;
      },
    );

    if (filteredReports.length === 0) {
      showError("No data found for the selected simulation.");
      return;
    }

    const _now = new Date();
    const _ts = `${_now.getFullYear()}${String(_now.getMonth() + 1).padStart(2, "0")}${String(_now.getDate()).padStart(2, "0")}${String(_now.getHours()).padStart(2, "0")}${String(_now.getMinutes()).padStart(2, "0")}`;
    const _studentCode = String(singleStudent?.student_id ?? "").replace(
      /-+/g,
      "",
    );
    // filenameBase2 / studentNameById2 / studentIdentityById2 reserved for when multi-report export is re-enabled
    void `${_ts}_${_studentCode}_stu_rtp_exp`;

    setDownloading(true);
    try {
      await new Promise((r) => setTimeout(r, 300));
      await generateMultiReportPDF(
        filteredReports,
        `${_ts}_${_studentCode}_stu_rtp_exp.pdf`,
        buildStudentNameById(propStudents),
        buildStudentIdentityById(propStudents, source.className),
      );
      onClose();
    } catch {
      showError("Export failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const isLoading =
    studentReportsStatus === "loading" ||
    classReportsStatus === "loading" ||
    simulationReportsStatus === "loading";

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={isSingleStudent ? t.titleSingle : t.titleBulk}
      footer={
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={downloading}
            className="w-full py-3 rounded-full border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {t.back}
          </button>
          <button
            type="button"
            onClick={
              isSingleStudent ? handleSingleStudentDownload : handleDownload
            }
            disabled={
              downloading || isLoading || simulationOptions.length === 0
            }
            className="w-full py-3 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-colors shadow-md shadow-primary-200 flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {downloading ? (
              <>
                <Loader2 size={15} className="animate-spin" /> {t.exporting}
              </>
            ) : (
              <>
                <Download size={15} />{" "}
                {isSingleStudent ? t.downloadPdf : t.downloadZip}
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="text-xs text-gray-500 text-center">
          {isSingleStudent
            ? `${t.subtitleSinglePrefix} ${singleStudent?.student_name ?? "student"}`
            : t.subtitleBulk}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-4 gap-2 text-primary-500 text-sm">
            <Loader2 size={16} className="animate-spin" />
            {t.loadingSimulations}
          </div>
        )}

        {!isLoading && simulationOptions.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t.simulationLabel} <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedSimulation?.id ?? ""}
              onChange={(e) => {
                const sim =
                  simulationOptions.find((s) => s.id === e.target.value) ??
                  null;
                setSelectedSimulation(sim);
              }}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:border-primary-400 cursor-pointer"
            >
              {simulationOptions.map((sim) => (
                <option key={sim.id} value={sim.id}>
                  {sim.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {!isLoading && simulationOptions.length === 0 && (
          <div className="text-center py-3 text-sm text-gray-500 bg-gray-50 rounded-xl">
            {t.noSimulationsFound}
          </div>
        )}
      </div>
    </Modal>
  );
}
