'use client';

import type { AssessmentReport } from '../../../types/assessmentReport';

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
  onBack?: () => void;
  onDownload?: () => void;
  labels?: TranscriptHeaderLabels;
}

const defaultLabels: TranscriptHeaderLabels = {
  backToReport: 'Back to Report',
  downloadTranscript: 'Download Transcript',
  fullUserTranscript: 'Full User Transcript',
  practice: 'Practice Report',
  assessment: 'Assessment Report',
  studentCode: 'Student Code:',
  class: 'Class:',
  sim: 'Sim:',
};

export default function TranscriptHeader({
  report,
  className,
  labels = defaultLabels,
}: TranscriptHeaderProps) {
  const rawAttemptLabel =
    report?.mode === 'Practice' ? labels.practice : labels.assessment;
  const attemptTypeLabel = rawAttemptLabel.endsWith('Report')
    ? rawAttemptLabel
    : `${rawAttemptLabel} Report`;
  const fullTitle = `${attemptTypeLabel} ${labels.fullUserTranscript}`;

  return (
    <div className="text-center">
      {/* Header Section — Single Line Brand Orange Title */}
      <h1 className="text-xl sm:text-[22px] font-bold text-[#db8833] tracking-tight mb-3">
        {fullTitle}
      </h1>

      {/* User Info Bar — Meta Row */}
      {report && (
        <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-1 text-xs sm:text-sm mt-1">
          {/* Student Code */}
          <div className="flex items-center gap-1">
            <span className="text-[#db8833] font-medium">
              {labels.studentCode}
            </span>
            <span className="text-[#5f6060] font-semibold">
              {report?.userId ?? 'N/A'}
            </span>
          </div>

          {/* Class */}
          {className && (
            <>
              <span className="text-gray-300 mx-1">•</span>
              <div className="flex items-center gap-1">
                <span className="text-[#db8833] font-medium">
                  {labels.class}
                </span>
                <span className="text-[#5f6060] font-semibold">
                  {className}
                </span>
              </div>
            </>
          )}

          {/* Scenario */}
          <div className="flex items-center gap-1">
            <span className="text-gray-300 mx-1">•</span>
            <span className="text-[#db8833] font-medium">{labels.sim}</span>
            <span className="text-[#5f6060] font-semibold">
              {report?.scenarioTitle ??
                String(report?.scenarioId ?? '').replace(/-/g, ' ') ??
                'N/A'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
