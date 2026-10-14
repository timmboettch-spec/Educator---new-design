import { OutboundFetch } from '../../common/interfaces';
import { LmsRosterResponse } from '../interfaces/lms.interfaces';
import { NRPS_ACCEPT, NRPS_MAX_PAGES } from '../lms.constants';

/**
 * Extract LMS course id from an NRPS membership URL when present.
 * Supports Moodle (`/CourseSection/{id}/`, `/Context/{id}/`) and Canvas
 * (`/api/lti/courses/{id}/names_and_roles`).
 */
export function extractCourseIdFromNrpsUrl(nrpsUrl: string): number | null {
  const trimmedUrl = String(nrpsUrl || '').trim();
  if (!trimmedUrl) {
    return null;
  }

  const courseSectionMatch = trimmedUrl.match(/\/CourseSection\/(\d+)\//i);
  if (courseSectionMatch) {
    return Number(courseSectionMatch[1]);
  }

  const contextMatch = trimmedUrl.match(/\/Context\/(\d+)\//i);
  if (contextMatch) {
    return Number(contextMatch[1]);
  }

  const canvasMatch = trimmedUrl.match(/\/api\/lti\/courses\/(\d+)\/names_and_roles/i);
  if (canvasMatch) {
    return Number(canvasMatch[1]);
  }

  return null;
}

function asOptionalString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export function parseNrpsMembershipContainer(raw: Record<string, unknown>): LmsRosterResponse {
  const rawContext = (raw['context'] ?? {}) as Record<string, unknown>;
  const context = {
    id: asOptionalString(rawContext['id']),
    label: asOptionalString(rawContext['label']),
    title: asOptionalString(rawContext['title']),
  };

  const rawMembers = Array.isArray(raw['members'])
    ? (raw['members'] as Array<Record<string, unknown>>)
    : [];

  const members = rawMembers.map((m) => ({
    userId: asOptionalString(m['user_id']) ?? '',
    name: asOptionalString(m['name']),
    email: asOptionalString(m['email']),
    roles: Array.isArray(m['roles'])
      ? (m['roles'] as unknown[]).filter((r): r is string => typeof r === 'string')
      : [],
  }));

  return { context, members };
}

export function parseNrpsNextPageUrl(linkHeader: string | null | undefined): string | null {
  if (!linkHeader) {
    return null;
  }
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="?next"?/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

export async function fetchNrpsMembershipPages(args: {
  nrpsUrl: string;
  accessToken: string;
  failedMessagePrefix: string;
  invalidJsonMessage: string;
  fetchFn: OutboundFetch;
}): Promise<LmsRosterResponse> {
  const { nrpsUrl, accessToken, failedMessagePrefix, invalidJsonMessage, fetchFn } = args;

  let context: LmsRosterResponse['context'] | null = null;
  const members: LmsRosterResponse['members'] = [];
  const visited = new Set<string>();
  let pageUrl: string | null = nrpsUrl;

  while (pageUrl && visited.size < NRPS_MAX_PAGES) {
    visited.add(pageUrl);

    const response = await fetchFn(pageUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: NRPS_ACCEPT,
      },
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`${failedMessagePrefix}: ${response.status} ${body}`);
    }

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(body) as Record<string, unknown>;
    } catch {
      throw new Error(invalidJsonMessage);
    }

    const parsed = parseNrpsMembershipContainer(raw);
    context ??= parsed.context;
    members.push(...parsed.members);

    const linkHeader =
      typeof response.headers?.get === 'function' ? response.headers.get('link') : null;
    const rawNextUrl = parseNrpsNextPageUrl(linkHeader);
    const nextUrl: string | null = rawNextUrl ? resolveNextUrl(rawNextUrl, pageUrl) : null;
    pageUrl = nextUrl && !visited.has(nextUrl) ? nextUrl : null;
  }

  return {
    context: context ?? { id: null, label: null, title: null },
    members,
  };
}

function resolveNextUrl(nextUrl: string, currentUrl: string): string {
  try {
    return new URL(nextUrl, currentUrl).toString();
  } catch {
    return nextUrl;
  }
}
