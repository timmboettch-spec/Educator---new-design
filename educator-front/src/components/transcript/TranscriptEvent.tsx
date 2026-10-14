import { memo, type ReactNode } from 'react';
import type { TranscriptEventData } from '../../types/userTranscript';
import TimelineBadge from './TimelineBadge';
import {
  eventField,
  extraEntries,
  humanLabel,
  statusClass,
} from './transcriptUtils';

/** Format any timestamp string or unix epoch (s or ms) to MM/DD/YYYY, HH:MM:SS */
function fmtDateTime(raw: string | undefined): string {
  if (!raw || raw === 'undefined' || raw === 'null') return '';
  try {
    let d: Date;
    const num = Number(raw);
    if (!isNaN(num) && raw.trim() !== '') {
      const ms = num > 1e12 ? num : num * 1000;
      d = new Date(ms);
    } else {
      d = new Date(raw);
      if (isNaN(d.getTime())) d = new Date(raw.replace(' ', 'T'));
    }
    if (isNaN(d.getTime()) || d.getFullYear() < 2020) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${mm}/${dd}/${d.getFullYear()}, ${hh}:${min}:${ss}`;
  } catch {
    return '';
  }
}

/** Accent border colour per event type family */
function accentBorder(type: string): string {
  const t = type.toLowerCase().replace(/[\s_-]/g, '');
  if (t.includes('student')) return 'border-l-blue-200';
  if (t.includes('patient')) return 'border-l-teal-200';
  if (t.includes('medication') || t.includes('administration'))
    return 'border-l-purple-200';
  if (t.includes('action')) return 'border-l-orange-200';
  if (t.includes('order')) return 'border-l-amber-200';
  if (t.includes('clinical') || t.includes('observation'))
    return 'border-l-emerald-200';
  if (t.includes('question') || t.includes('prompt'))
    return 'border-l-indigo-200';
  return 'border-l-gray-200';
}

// ─── Shared card shell ────────────────────────────────────────────────────────

export interface EventCardProps {
  event: TranscriptEventData;
  children: ReactNode;
}

export const EventCard = memo(function EventCard({
  event,
  children,
}: EventCardProps) {
  const raw = event as unknown as Record<string, unknown>;
  const simTime = eventField(event, 'simulationTime', 'simulation_time');

  // Try every common field name; fmtDateTime handles ISO, unix-ms, unix-s, float-s
  const startedTime = fmtDateTime(
    (raw['startedTime'] ??
      raw['started_time'] ??
      raw['startTime'] ??
      raw['start_time'] ??
      raw['startAt'] ??
      raw['start_at'] ??
      raw['startDateTime'] ??
      raw['start_date_time'] ??
      raw['startTimestampValue'] ??
      raw['start_timestamp_value'] ??
      raw['startTimestamp'] ??
      raw['start_timestamp'] ??
      raw['actionStartTime'] ??
      raw['action_start_time'] ??
      raw['actionTime'] ??
      raw['action_time'] ??
      raw['timestamp'] ??
      raw['occurredAt'] ??
      raw['occurred_at'] ??
      raw['eventTime'] ??
      raw['event_time'] ??
      raw['time']) as string | undefined
  );
  const endedTime = fmtDateTime(
    (raw['endedTime'] ??
      raw['ended_time'] ??
      raw['endTime'] ??
      raw['end_time'] ??
      raw['endAt'] ??
      raw['end_at'] ??
      raw['endDateTime'] ??
      raw['end_date_time'] ??
      raw['timestampValue'] ??
      raw['timestamp_value'] ??
      raw['endTimestampValue'] ??
      raw['end_timestamp_value'] ??
      raw['endTimestamp'] ??
      raw['end_timestamp'] ??
      raw['actionEndTime'] ??
      raw['action_end_time'] ??
      raw['completedAt'] ??
      raw['completed_at']) as string | undefined
  );

  const duration = eventField(event, 'duration');
  const status = eventField(event, 'status');
  const category = eventField(event, 'category');
  const subCategory = eventField(event, 'subCategory', 'sub_category');

  return (
    <div
      className={`bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden border-l-4 ${accentBorder(event.type)}`}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100 gap-2 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <TimelineBadge type={event.type} />
          {(startedTime || endedTime) && (
            <span className="text-xs text-black">
              {startedTime && <>Started: {startedTime}</>}
              {startedTime && endedTime && (
                <span className="mx-1.5 text-gray-300">|</span>
              )}
              {endedTime && <>Ended: {endedTime}</>}
            </span>
          )}
        </div>
        {simTime && (
          <span className="text-xs font-mono text-gray-400">⏱ {simTime}</span>
        )}
      </div>

      {/* Body slot */}
      <div className="px-4 py-4 space-y-3">{children}</div>

      {/* Footer meta */}
      {(duration || status || category || subCategory) && (
        <div className="px-4 pb-4 pt-0 space-y-2">
          <div className="border-t border-gray-100 pt-3 space-y-2">
            {duration && (
              <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                <span>
                  <span className="text-gray-400">Duration:</span> {duration}
                </span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {status && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusClass(status)}`}
                >
                  {status}
                </span>
              )}
              {category && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded uppercase tracking-wide">
                  {category}
                </span>
              )}
              {subCategory && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded uppercase tracking-wide">
                  {subCategory}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// ─── Generic / fallback event ─────────────────────────────────────────────────

interface TranscriptEventProps {
  event: TranscriptEventData;
}

const TranscriptEvent = memo(function TranscriptEvent({
  event,
}: TranscriptEventProps) {
  const title = eventField(event, 'title', 'name');
  const speaker = eventField(event, 'speaker');
  const body = eventField(
    event,
    'transcript',
    'description',
    'text',
    'content'
  );
  const extras = extraEntries(event);

  return (
    <EventCard event={event}>
      {title && (
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
      )}

      {speaker && (
        <p className="text-xs text-gray-500">
          <span className="font-medium">Speaker:</span> {speaker}
        </p>
      )}

      {body && (
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
          {body}
        </p>
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

export default TranscriptEvent;
