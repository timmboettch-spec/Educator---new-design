import { memo } from 'react';
import type { TranscriptEventData } from '../../types/userTranscript';
import { EventCard } from './TranscriptEvent';
import { eventField, extraEntries, humanLabel } from './transcriptUtils';

interface ActionEventProps {
  event: TranscriptEventData;
}

const ActionEvent = memo(function ActionEvent({ event }: ActionEventProps) {
  const title = eventField(event, 'title', 'name');
  const description = eventField(event, 'description', 'text', 'content', 'transcript');
  const extras = extraEntries(event);

  return (
    <EventCard event={event}>
      {title && (
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-primary-400 flex-shrink-0" />
          {title}
        </h4>
      )}

      {description && (
        <p className="text-sm text-gray-700 leading-relaxed">{description}</p>
      )}

      {extras.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2 border-t border-gray-100">
          {extras.map(([k, v]) => (
            <div key={k} className="text-xs">
              <span className="text-gray-500">{humanLabel(k)}: </span>
              <span className="text-gray-700">{v}</span>
            </div>
          ))}
        </div>
      )}
    </EventCard>
  );
});

export default ActionEvent;
