import JSZip from "jszip";
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
  resetClassReports,
  selectClassReports,
  selectClassReportsStatus,
  type SimulationReport,
} from "../../../redux/class/SimsCompletedreportsRedux";
import { resolveStudentReportBlobId } from "../../../api/resolveStudentReportBlobId";
import { processTranscriptData } from "../../../student-reports/transcript/processTranscriptData";
import { buildTranscriptPDF } from "../../../student-reports/transcript/generateTranscriptPDF";
import { SimulationOption } from "../../../types";
import { toast } from "../../../components/common/Toast";
import Modal from "../../ui/Modal";

interface Props {
  source: ExportSource;
  students?: Student[];
  onClose: () => void;
}

export default function ExportTranscriptModal({
  source,
  students: propStudents,
  onClose,
}: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const t = (
    localStorage.getItem("app_language")?.toLowerCase() === "es"
      ? loginEs
      : loginEn
  ).exportTranscriptModal;
  const classReports = useSelector(selectClassReports);
  const classReportsStatus = useSelector(selectClassReportsStatus);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState("");
  const [selectedSimulation, setSelectedSimulation] =
    useState<SimulationOption | null>(null);
  const [simulationOptions, setSimulationOptions] = useState<
    SimulationOption[]
  >([]);

  const sourceClassId =
    source.type === "class" ? source.classId : source.class_id;

  const showError = (msg: string) => {
    toast.error(`Export Failed: ${msg}`);
  };

  // Fetch class reports to build simulation options
  useEffect(() => {
    if (sourceClassId) {
      dispatch(resetClassReports());
      dispatch(GetClassSimulationReports({ classId: sourceClassId }));
    }
  }, [dispatch, sourceClassId]);

  // Build simulation options from class reports
  useEffect(() => {
    if (!classReports || classReports.length === 0) {
      setSimulationOptions([]);
      setSelectedSimulation(null);
      return;
    }
    const map = new Map<string, SimulationOption>();
    classReports.forEach((r: SimulationReport) => {
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
  }, [classReports]);

  const handleDownload = async () => {
    if (classReports.length === 0) {
      showError("No completed simulations found to export.");
      return;
    }
    if (!selectedSimulation) {
      showError("Please select a simulation.");
      return;
    }

    // Filter to reports matching the selected simulation
    const filteredReports = classReports.filter((r: SimulationReport) => {
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

    // Build a student name lookup for safe filenames
    const studentNameById: Record<string, string> = {};
    (propStudents ?? []).forEach((s) => {
      const name = s.student_name?.trim();
      if (!name) return;
      if (s.student_id) studentNameById[s.student_id] = name;
      if (s.user_id) studentNameById[s.user_id] = name;
      if (s.id) studentNameById[s.id] = name;
    });

    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const className = (source.className ?? "")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_]/g, "")
      .slice(0, 50);
    const zipFilename = `${ts}_${className}_transcripts.zip`;

    setDownloading(true);
    setProgress("");

    try {
      const zip = new JSZip();
      const usedFilenames = new Map<string, number>();
      let successCount = 0;
      let skipCount = 0;

      for (let i = 0; i < filteredReports.length; i++) {
        const r = filteredReports[i];
        const reportId = resolveStudentReportBlobId(
          r as unknown as Record<string, unknown>,
        );
        if (!reportId) {
          skipCount++;
          continue;
        }

        setProgress(
          `Generating transcript ${i + 1} of ${filteredReports.length}…`,
        );

        try {
          const studentId = r.student_id ?? r.userId ?? "";
          const studentName =
            r.student_name ??
            r.studentName ??
            (studentId ? studentNameById[studentId] : undefined) ??
            studentId ??
            "student";

          const safeStudentName = studentName
            .replace(/[^a-zA-Z0-9_\- ]/g, "")
            .replace(/\s+/g, "_")
            .slice(0, 40);
          const safeSimTitle = (
            r.scenarioTitle ??
            r.scenario_title ??
            r.simulation_name ??
            r.scenarioId ??
            r.scenario_id ??
            "transcript"
          )
            .replace(/[^a-zA-Z0-9_\- ]/g, "")
            .replace(/\s+/g, "_")
            .slice(0, 40);

          const transcriptData = await processTranscriptData(
            reportId,
            source.className,
          );
          const doc = buildTranscriptPDF(transcriptData, { returnDoc: true });

          const baseFilename = `${safeStudentName}_${safeSimTitle}_transcript.pdf`;
          const count = usedFilenames.get(baseFilename) ?? 0;
          usedFilenames.set(baseFilename, count + 1);
          const uniqueFilename =
            count === 0
              ? baseFilename
              : baseFilename.replace(/\.pdf$/, `_${count + 1}.pdf`);

          zip.file(uniqueFilename, doc.output("arraybuffer"));
          successCount++;
        } catch {
          skipCount++;
          // continue with remaining students
        }
      }

      if (successCount === 0) {
        showError(
          "No transcripts could be generated. Make sure students have completed simulations with transcript data.",
        );
        return;
      }

      setProgress("Bundling ZIP…");
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = zipFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (skipCount > 0) {
        toast.warning(
          `${successCount} transcript(s) exported. ${skipCount} skipped (no transcript data).`,
        );
      }

      onClose();
    } catch {
      showError("Export failed. Please try again.");
    } finally {
      setDownloading(false);
      setProgress("");
    }
  };

  const isLoading = classReportsStatus === "loading";

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={t.title}
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
            onClick={handleDownload}
            disabled={
              downloading || isLoading || simulationOptions.length === 0
            }
            className="w-full py-3 rounded-full bg-primary-500 text-white text-sm font-semibold hover:bg-primary-600 transition-colors shadow-md shadow-primary-200 flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {downloading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                {progress || t.exporting}
              </>
            ) : (
              <>
                <Download size={15} /> {t.downloadZip}
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="text-xs text-gray-500 text-center">{t.subtitle}</div>

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
