import { memo } from 'react';
import type { TranscriptHeader as TranscriptHeaderType } from '../../types/userTranscript';
import { headerField } from './transcriptUtils';

interface TranscriptHeaderProps {
  header: TranscriptHeaderType;
}

/** Clock icon shared by the date/time badges */
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

const TranscriptHeader = memo(function TranscriptHeader({ header }: TranscriptHeaderProps) {
  const studentCode  = headerField(header, 'studentCode',    'student_code');
  const className    = headerField(header, 'className',      'class_name');
  const simName      = headerField(header, 'simulationName', 'simulation_name');
  const realDate     = headerField(header, 'realDate',       'real_date');
  const realTime     = headerField(header, 'realTime',       'real_time');
  const simDate      = headerField(header, 'simulationDate', 'simulation_date');
  const simTime      = headerField(header, 'simulationTime', 'simulation_time');

  const hasAnyField = studentCode || className || simName || realDate || realTime || simDate || simTime;
  if (!hasAnyField) return null;

  // Info row items (bullet-separated)
  const infoItems: { label: string; value: string }[] = [
    ...(studentCode ? [{ label: 'Student Code', value: studentCode }] : []),
    ...(className   ? [{ label: 'Class',         value: className   }] : []),
    ...(simName     ? [{ label: 'Sim',            value: simName     }] : []),
  ];

  // Date/time badges
  const realBadges = [
    ...(realDate ? [{ label: 'REAL DATE', value: realDate }] : []),
    ...(realTime ? [{ label: 'REAL TIME', value: realTime }] : []),
  ];
  const simBadges = [
    ...(simDate ? [{ label: 'SIM DATE', value: simDate }] : []),
    ...(simTime ? [{ label: 'SIM TIME', value: simTime }] : []),
  ];

  const hasBadges = realBadges.length > 0 || simBadges.length > 0;

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden mb-6">
      <div className="px-5 py-4 flex flex-col gap-3">

        {/* ── Info row ─────────────────────────────────────────────── */}
        {infoItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600 justify-center">
            {infoItems.map((item, i) => (
              <span key={item.label} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-gray-300">•</span>}
                <span className="text-gray-500">{item.label}:</span>
                <span className="font-medium text-gray-800">{item.value}</span>
              </span>
            ))}
          </div>
        )}

        {/* ── Date / time badge row ─────────────────────────────────── */}
        {hasBadges && (
          <div className="flex flex-wrap items-center gap-2 justify-center">
            {realBadges.map((b) => (
              <span
                key={b.label}
                className="inline-flex items-center gap-1.5 border border-green-400 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap"
              >
                <ClockIcon className="text-green-500 flex-shrink-0" />
                {b.label}:&nbsp;{b.value}
              </span>
            ))}
            {simBadges.map((b) => (
              <span
                key={b.label}
                className="inline-flex items-center gap-1.5 border border-blue-400 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap"
              >
                <ClockIcon className="text-blue-500 flex-shrink-0" />
                {b.label}:&nbsp;{b.value}
              </span>
            ))}
          </div>
        )}

      </div>
    </div>
  );
});

export default TranscriptHeader;
