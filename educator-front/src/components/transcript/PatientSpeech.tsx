import { memo } from 'react';
import type { TranscriptEventData } from '../../types/userTranscript';
import { EventCard } from './TranscriptEvent';
import { eventField } from './transcriptUtils';

interface PatientSpeechProps {
  event: TranscriptEventData;
}

const PatientSpeech = memo(function PatientSpeech({
  event,
}: PatientSpeechProps) {
  const transcript = eventField(
    event,
    'transcript',
    'text',
    'content',
    'description'
  );
  const speaker = eventField(event, 'speaker');
  const title = eventField(event, 'title');

  return (
    <EventCard event={event}>
      {title && (
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
      )}

      <div className="flex items-start gap-3">
        {/* Avatar circle */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-600 text-xs font-bold mt-0.5">
          P
        </div>

        <div className="flex-1 min-w-0">
          {speaker && (
            <p className="text-xs font-semibold text-teal-600 mb-1">
              {speaker}
            </p>
          )}

          {transcript ? (
            <div className="bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                {transcript}
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">
              No transcript available.
            </p>
          )}
        </div>
      </div>
    </EventCard>
  );
});

export default PatientSpeech;
