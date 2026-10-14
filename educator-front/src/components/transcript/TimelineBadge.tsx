import { memo } from 'react';

interface TimelineBadgeProps {
  type: string;
}

interface BadgeConfig {
  label: string;
  className: string;
}

function getBadgeConfig(type: string): BadgeConfig {
  const t = type.toLowerCase().replace(/[\s_-]/g, '');

  const map: Record<string, BadgeConfig> = {
    studentspeech: {
      label: 'Student Speech',
      className: 'bg-blue-100 text-blue-700',
    },
    patientspeech: {
      label: 'Patient Speech',
      className: 'bg-teal-100 text-teal-700',
    },
    medication: {
      label: 'Medication',
      className: 'bg-purple-100 text-purple-700',
    },
    medications: {
      label: 'Medication',
      className: 'bg-purple-100 text-purple-700',
    },
    medicationverification: {
      label: 'Medication Verification',
      className: 'bg-purple-100 text-purple-700',
    },
    administrationdetails: {
      label: 'Administration',
      className: 'bg-violet-100 text-violet-700',
    },
    administrationdetail: {
      label: 'Administration',
      className: 'bg-violet-100 text-violet-700',
    },
    action: { label: 'Action', className: 'bg-orange-100 text-orange-700' },
    actions: { label: 'Action', className: 'bg-orange-100 text-orange-700' },
    commonactions: {
      label: 'Common Action',
      className: 'bg-orange-100 text-orange-700',
    },
    commonaction: {
      label: 'Common Action',
      className: 'bg-orange-100 text-orange-700',
    },
    order: { label: 'Order', className: 'bg-amber-100 text-amber-700' },
    orders: { label: 'Order', className: 'bg-amber-100 text-amber-700' },
    clinicalprompt: {
      label: 'Clinical Prompt',
      className: 'bg-green-100 text-green-700',
    },
    clinicalprompts: {
      label: 'Clinical Prompt',
      className: 'bg-green-100 text-green-700',
    },
    openendedquestion: {
      label: 'Open Ended',
      className: 'bg-indigo-100 text-indigo-700',
    },
    openended: {
      label: 'Open Ended',
      className: 'bg-indigo-100 text-indigo-700',
    },
    sequentialquestion: {
      label: 'Sequential Q',
      className: 'bg-indigo-100 text-indigo-700',
    },
    sequential: {
      label: 'Sequential Q',
      className: 'bg-indigo-100 text-indigo-700',
    },
    clinicaldecision: {
      label: 'Clinical Decision',
      className: 'bg-cyan-100 text-cyan-700',
    },
    patienteducation: {
      label: 'Patient Education',
      className: 'bg-sky-100 text-sky-700',
    },
    clinicalobservation: {
      label: 'Clinical Observation',
      className: 'bg-emerald-100 text-emerald-700',
    },
    clinicalobservations: {
      label: 'Clinical Observation',
      className: 'bg-emerald-100 text-emerald-700',
    },
  };

  return (
    map[t] ?? {
      label: type
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      className: 'bg-gray-100 text-gray-600',
    }
  );
}

const TimelineBadge = memo(function TimelineBadge({
  type,
}: TimelineBadgeProps) {
  const { label, className } = getBadgeConfig(type);
  return (
    <span
      className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  );
});

export default TimelineBadge;
