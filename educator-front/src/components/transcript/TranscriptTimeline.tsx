import { memo } from 'react';
import type { TranscriptEventData } from '../../types/userTranscript';
import StudentSpeech from './StudentSpeech';
import PatientSpeech from './PatientSpeech';
import MedicationEvent from './MedicationEvent';
import ActionEvent from './ActionEvent';
import OrderEvent from './OrderEvent';
import TranscriptEvent from './TranscriptEvent';

interface TranscriptTimelineProps {
  events: TranscriptEventData[];
}

/** Normalise event type string for dispatch */
function normaliseType(type: string): string {
  return type.toLowerCase().replace(/[\s_-]/g, '');
}

/** Select the right component for a given event type */
function resolveComponent(type: string): React.ComponentType<{ event: TranscriptEventData }> {
  const t = normaliseType(type);

  if (t === 'studentspeech') return StudentSpeech;
  if (t === 'patientspeech') return PatientSpeech;

  if (
    t === 'medication' ||
    t === 'medications' ||
    t === 'medicationverification' ||
    t === 'administrationdetails' ||
    t === 'administrationdetail'
  )
    return MedicationEvent;

  if (t === 'action' || t === 'actions' || t === 'commonactions' || t === 'commonaction')
    return ActionEvent;

  if (t === 'order' || t === 'orders') return OrderEvent;

  // All other types (clinical prompts, questions, decisions, observations, unknown) → generic
  return TranscriptEvent;
}

const EventItem = memo(function EventItem({ event }: { event: TranscriptEventData }) {
  const Component = resolveComponent(event.type);
  return <Component event={event} />;
});

const TranscriptTimeline = memo(function TranscriptTimeline({
  events,
}: TranscriptTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-500">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-10 h-10 mb-3 opacity-40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-sm">No transcript events found.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical timeline line */}
      <div className="absolute left-3.5 top-0 bottom-0 w-px bg-gray-200 pointer-events-none" />

      <div className="space-y-4 pl-10">
        {events.map((event, index) => (
          <div key={event.id ?? index} className="relative">
            {/* Timeline dot */}
            <div className="absolute -left-[26px] top-3.5 w-3 h-3 rounded-full bg-white border-2 border-primary-400 z-10" />
            <EventItem event={event} />
          </div>
        ))}
      </div>
    </div>
  );
});

export default TranscriptTimeline;
