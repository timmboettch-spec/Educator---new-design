"use client";

import { ArrowLeft, Download } from "lucide-react";

import type { AssessmentReport } from "../../../types/assessmentReport";

export interface TranscriptHeaderLabels {
  backToReport: string;
  downloadTranscript: string;
  fullUserTranscript: string;
  practice: string;
  assessment: string;
  studentCode: string;
  class: string;
  sim: string;
}

interface TranscriptHeaderProps {
  report: AssessmentReport | null;
  className?: string;
  onBack: () => void;
  onDownload: () => void;
  labels?: TranscriptHeaderLabels;
}

const defaultLabels: TranscriptHeaderLabels = {
  backToReport: "Back to Report",
  downloadTranscript: "Download Transcript",
  fullUserTranscript: "Full User Transcript",
  practice: "Practice",
  assessment: "Assessment",
  studentCode: "Student Code:",
  class: "Class:",
  sim: "Sim:",
};

export default function TranscriptHeader({
  report,
  className,
  onBack,
  onDownload,
  labels = defaultLabels,
}: TranscriptHeaderProps) {
  const attemptTypeLabel = report?.mode === "Practice" ? labels.practice : labels.assessment;

  return (
    <>
      {/* Navigation Buttons */}
      <div className="flex justify-between items-center mb-12">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-5 py-2 border-2 border-[#db8833] text-[#db8833] rounded-lg font-bold text-sm hover:bg-[#FFF0EB] transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
          {labels.backToReport}
        </button>
        <button
          onClick={onDownload}
          className="flex items-center gap-2 px-5 py-2 bg-[#db8833] text-white rounded-lg font-bold text-sm hover:bg-[#ED621F] transition-all shadow-sm"
        >
          <Download className="w-5 h-5" />
          {labels.downloadTranscript}
        </button>
      </div>

      {/* Header Section — replica of the student app: small brand-orange
          "{mode} Report Transcript" title, no dark 48px heading/subtitle. */}
      <div className="text-center mb-6">
        <h1 className="text-xl sm:text-[22px] font-bold text-[#db8833] tracking-tight mb-4">
          {attemptTypeLabel} {labels.fullUserTranscript}
        </h1>
      </div>

      {/* User Info Bar — orange labels, gray values (student-app style) */}
      {report && (
        <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-1 text-xs sm:text-sm mt-2 mb-2">
          {/* Student Code */}
          <div className="flex items-center gap-1">
            <span className="text-[#db8833] font-semibold">{labels.studentCode}</span>
            <span className="text-[#5f6060] font-medium">{report?.userId ?? "N/A"}</span>
          </div>

          {/* Class */}
          {className && (
            <>
              <span className="text-gray-300 mx-1">•</span>
              <div className="flex items-center gap-1">
                <span className="text-[#db8833] font-semibold">{labels.class}</span>
                <span className="text-[#5f6060] font-medium">{className}</span>
              </div>
            </>
          )}

          {/* Scenario */}
          <span className="text-gray-300 mx-1">•</span>
          <div className="flex items-center gap-1">
            <span className="text-[#db8833] font-semibold">{labels.sim}</span>
            <span className="text-[#5f6060] font-medium">
              {report?.scenarioTitle ??
                String(report?.scenarioId ?? "").replace(/-/g, " ") ??
                "N/A"}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
