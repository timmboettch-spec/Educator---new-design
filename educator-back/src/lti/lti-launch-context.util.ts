/**
 * LTI Launch Context Extraction Utilities
 *
 * Shared logic for parsing course/context information from LTI 1.3 launch tokens.
 * Platform-agnostic — works across Moodle, Canvas, Blackboard, etc.
 */

export interface LtiLaunchCourseContext {
  courseId: string;
  courseTitle: string;
  source: string;
}

/**
 * Extract course context from LTI 1.3 id_token payload.
 * Tries standard LTI claims in order:
 * 1. context.id (preferred)
 * 2. lis.course_section_sourcedid / course_offering_sourcedid
 * 3. custom claims (courseid, course_id, moodlecourseid, lms_course_id, etc.)
 */
export function extractLaunchCourseContext(
  payload: Record<string, unknown>,
): LtiLaunchCourseContext {
  const context = payload['https://purl.imsglobal.org/spec/lti/claim/context'] as
    Record<string, unknown> | undefined;
  const lisClaim = payload['https://purl.imsglobal.org/spec/lti/claim/lis'] as
    Record<string, unknown> | undefined;
  const customClaim = payload['https://purl.imsglobal.org/spec/lti/claim/custom'] as
    Record<string, unknown> | undefined;

  const contextId =
    context?.['id'] && typeof context['id'] === 'string' ? context['id'].trim() : '';
  const contextTitle =
    context?.['title'] && typeof context['title'] === 'string' ? context['title'].trim() : '';

  if (contextId) {
    return {
      courseId: contextId,
      courseTitle: contextTitle || 'LMS Class',
      source: 'context.id',
    };
  }

  const lisCourseId = firstNonEmpty([
    lisClaim?.course_section_sourcedid,
    lisClaim?.course_offering_sourcedid,
  ]);

  if (lisCourseId) {
    return {
      courseId: lisCourseId,
      courseTitle: contextTitle || 'LMS Class',
      source: 'lis.course_sourcedid',
    };
  }

  const customCourseId = firstNonEmpty([
    customClaim?.courseid,
    customClaim?.course_id,
    customClaim?.moodlecourseid, // Legacy Moodle
    customClaim?.moodle_course_id, // Legacy Moodle
    customClaim?.lms_course_id,
    payload.courseid,
    payload.course_id,
    payload.lms_course_id,
  ]);

  const customCourseName = firstNonEmpty([
    customClaim?.coursename,
    customClaim?.course_name,
    customClaim?.context_title,
    payload.coursename,
    payload.course_name,
  ]);

  if (customCourseId) {
    return {
      courseId: customCourseId,
      courseTitle: customCourseName || 'LMS Class',
      source: 'custom.course_id',
    };
  }

  return {
    courseId: '',
    courseTitle: '',
    source: 'none',
  };
}

/**
 * Extract all potential course IDs from an LTI launch token (for multi-class student launch).
 * Returns deduplicated list in priority order.
 */
export function extractStudentLaunchCourseIds(payload: Record<string, unknown>): string[] {
  const context = payload['https://purl.imsglobal.org/spec/lti/claim/context'] as
    Record<string, unknown> | undefined;
  const lisClaim = payload['https://purl.imsglobal.org/spec/lti/claim/lis'] as
    Record<string, unknown> | undefined;
  const customClaim = payload['https://purl.imsglobal.org/spec/lti/claim/custom'] as
    Record<string, unknown> | undefined;

  const candidates: string[] = [
    firstNonEmpty([context?.id]) ?? '',
    firstNonEmpty([lisClaim?.course_section_sourcedid, lisClaim?.course_offering_sourcedid]) ?? '',
    firstNonEmpty([
      customClaim?.courseid,
      customClaim?.course_id,
      customClaim?.moodlecourseid, // Legacy Moodle
      customClaim?.moodle_course_id, // Legacy Moodle
      customClaim?.lms_course_id,
      payload.courseid,
      payload.course_id,
      payload.lms_course_id,
    ]) ?? '',
  ];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of candidates) {
    const id = String(value || '').trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push(id);
  }

  return normalized;
}

function firstNonEmpty(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}
