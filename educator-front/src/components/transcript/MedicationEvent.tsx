import { memo } from 'react';
import type { TranscriptEventData } from '../../types/userTranscript';
import { EventCard } from './TranscriptEvent';
import { eventField, extraEntries, humanLabel } from './transcriptUtils';

interface MedicationEventProps {
  event: TranscriptEventData;
}

const MedicationEvent = memo(function MedicationEvent({
  event,
}: MedicationEventProps) {
  const name = eventField(event, 'name', 'title');
  const description = eventField(
    event,
    'description',
    'text',
    'content',
    'transcript'
  );
  const dose = eventField(event, 'dose', 'dosage');
  const route = eventField(event, 'route', 'administration_route');
  const frequency = eventField(event, 'frequency');
  const extras = extraEntries(event);

  return (
    <EventCard event={event}>
      {name && (
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />
          {name}
        </h4>
      )}

      {description && (
        <p className="text-sm text-gray-700 leading-relaxed">{description}</p>
      )}

      {(dose || route || frequency) && (
        <div className="grid grid-cols-3 gap-2">
          {dose && (
            <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 text-center">
              <p className="text-xs text-purple-400 mb-0.5">Dose</p>
              <p className="text-sm font-semibold text-purple-800">{dose}</p>
            </div>
          )}
          {route && (
            <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 text-center">
              <p className="text-xs text-purple-400 mb-0.5">Route</p>
              <p className="text-sm font-semibold text-purple-800">{route}</p>
            </div>
          )}
          {frequency && (
            <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 text-center">
              <p className="text-xs text-purple-400 mb-0.5">Frequency</p>
              <p className="text-sm font-semibold text-purple-800">
                {frequency}
              </p>
            </div>
          )}
        </div>
      )}

      {extras.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2 border-t border-gray-100">
          {extras.map(([k, v]) => (
            <div key={k} className="text-xs">
              <span className="text-gray-400">{humanLabel(k)}: </span>
              <span className="text-gray-700">{v}</span>
            </div>
          ))}
        </div>
      )}
    </EventCard>
  );
});

export default MedicationEvent;
