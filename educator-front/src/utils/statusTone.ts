export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/**
 * Canonical status -> tone mapping shared by every list screen's status
 * indicator (Schools, Classes, Educators, and the class/simulation
 * lifecycle pill). Case-insensitive; unmatched values fall back to neutral.
 */
export function getStatusTone(status?: string | null): StatusTone {
  switch ((status ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'success';
    case 'ATTENTION':
    case 'PENDING':
      return 'warning';
    case 'DRAFT':
    case 'INACTIVE':
    case 'ARCHIEVED':
    case 'ARCHIVED':
      return 'neutral';
    default:
      return 'neutral';
  }
}
