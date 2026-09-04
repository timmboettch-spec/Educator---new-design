import type { TranscriptEventData, TranscriptHeader } from '../../types/userTranscript';

/** Try a list of field names; return the first non-empty string value */
export function pick(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = obj[key];
    if (val != null && String(val).trim() !== '') return String(val);
  }
  return undefined;
}

export function headerField(header: TranscriptHeader, ...keys: string[]): string | undefined {
  return pick(header as Record<string, unknown>, ...keys);
}

export function eventField(event: TranscriptEventData, ...keys: string[]): string | undefined {
  return pick(event as Record<string, unknown>, ...keys);
}

/** Fields that are rendered in dedicated UI slots — excluded from the "extra metadata" grid */
export const KNOWN_KEYS = new Set([
  'id',
  'type',
  'simulationTime',
  'simulation_time',
  'title',
  'name',
  'speaker',
  'transcript',
  'description',
  'text',
  'content',
  'startedTime',
  'started_time',
  'start_time',
  'endedTime',
  'ended_time',
  'end_time',
  'duration',
  'status',
  'category',
  'subCategory',
  'sub_category',
  'dose',
  'route',
  'frequency',
]);

/** Returns extra [key, value] pairs not already shown in the main card */
export function extraEntries(event: TranscriptEventData): [string, string][] {
  return Object.entries(event)
    .filter(([k, v]) => !KNOWN_KEYS.has(k) && v != null && String(v).trim() !== '')
    .map(([k, v]) => [k, String(v)]);
}

/** Tailwind classes for a status string */
export function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (['correct', 'pass', 'passed', 'completed', 'success', 'done'].includes(s))
    return 'bg-green-100 text-green-700';
  if (['incorrect', 'fail', 'failed', 'error'].includes(s))
    return 'bg-red-100 text-red-700';
  if (['partial', 'warning', 'pending', 'in_progress', 'inprogress'].includes(s))
    return 'bg-amber-100 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

/** Human-readable label from a camelCase / snake_case / PascalCase key */
export function humanLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
