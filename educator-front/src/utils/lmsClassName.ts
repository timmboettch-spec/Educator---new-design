export interface LmsClassDetail {
  contextId?: string;
  label?: string;
  title?: string;
  name?: string;
  context_id?: string;
  context_title?: string;
  context_label?: string;
  courseFullName?: string;
  fullname?: string;
  shortname?: string;
  resource_link_title?: string;
  course_name?: string;
  courseName?: string;
  id?: string | number;
  [key: string]: unknown;
}

export interface LtiLaunchCourseContext {
  courseId?: string;
  courseName?: string;
}

/** Prefer Moodle course title / full name over NRPS short label. */
export function extractClassNameFromDetail(detail: LmsClassDetail): string {
  const value =
    (typeof detail.title === 'string' ? detail.title : '') ||
    (typeof detail.context_title === 'string' ? detail.context_title : '') ||
    (typeof detail.courseFullName === 'string' ? detail.courseFullName : '') ||
    (typeof detail.fullname === 'string' ? detail.fullname : '') ||
    (typeof detail.course_name === 'string' ? detail.course_name : '') ||
    (typeof detail.courseName === 'string' ? detail.courseName : '') ||
    (typeof detail.name === 'string' ? detail.name : '') ||
    (typeof detail.resource_link_title === 'string'
      ? detail.resource_link_title
      : '') ||
    (typeof detail.label === 'string' ? detail.label : '') ||
    (typeof detail.context_label === 'string' ? detail.context_label : '') ||
    (typeof detail.shortname === 'string' ? detail.shortname : '');
  return value.trim();
}

export function getLtiLaunchCourseContextFromStorage(): LtiLaunchCourseContext {
  if (typeof window === 'undefined') {
    return {};
  }
  const courseId = (localStorage.getItem('lti_course_id') ?? '').trim();
  const courseName = (localStorage.getItem('lti_course_name') ?? '').trim();
  return {
    courseId: courseId || undefined,
    courseName: courseName || undefined,
  };
}

/**
 * Resolve display name for class create / roster sync.
 * LTI launch course title wins when context IDs match; otherwise NRPS title over label.
 */
export function resolveLmsClassName(
  detail: LmsClassDetail | null | undefined,
  ltiContext?: LtiLaunchCourseContext
): string {
  if (!detail) {
    return '';
  }

  const lmsClassId = String(
    detail.contextId ?? detail.context_id ?? detail.id ?? ''
  ).trim();
  const ltiCourseId = (ltiContext?.courseId ?? '').trim();
  const ltiCourseName = (ltiContext?.courseName ?? '').trim();

  if (
    ltiCourseName &&
    ltiCourseId &&
    lmsClassId &&
    ltiCourseId === lmsClassId
  ) {
    return ltiCourseName;
  }

  return extractClassNameFromDetail(detail);
}

export function normalizeLmsCourseId(
  value: string | number | null | undefined
): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';

  const contextMatch = trimmed.match(
    /\/(?:course|CourseSection|Context)\/(\d+)/i
  );
  if (contextMatch) {
    return String(Number(contextMatch[1]));
  }

  if (/^\d+$/.test(trimmed)) {
    return String(Number(trimmed));
  }

  return trimmed;
}

export function normalizeNrpsUrl(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/\/+$/, '');
}

export interface ExistingClassByCourseId {
  classId: string;
  className: string;
}

/** Build lookup of Moodle course ID to existing portal class. */
export function indexExistingClassesByNrpsUrl(
  mappedClasses: Array<{
    classId?: string;
    className?: string;
    nrpsUrl?: string | null;
  }>
): Map<string, ExistingClassByCourseId> {
  const byNrpsUrl = new Map<string, ExistingClassByCourseId>();

  for (const mapped of mappedClasses) {
    const nrpsUrl = normalizeNrpsUrl(mapped.nrpsUrl);
    const classId = String(mapped.classId ?? '').trim();
    if (!nrpsUrl || !classId) {
      continue;
    }
    byNrpsUrl.set(nrpsUrl, {
      classId,
      className: String(mapped.className ?? '').trim(),
    });
  }

  return byNrpsUrl;
}

export function indexExistingClassesByCourseId(
  mappedClasses: Array<{
    classId?: string;
    className?: string;
    lmsCourseId?: string | number;
  }>,
  portalClasses: Array<{
    id?: string;
    class_name?: string;
    lms_class_reference?: string;
  }>
): Map<string, ExistingClassByCourseId> {
  const byCourseId = new Map<string, ExistingClassByCourseId>();

  for (const mapped of mappedClasses) {
    const courseId = normalizeLmsCourseId(mapped.lmsCourseId);
    const classId = String(mapped.classId ?? '').trim();
    if (!courseId || !classId) {
      continue;
    }
    byCourseId.set(courseId, {
      classId,
      className: String(mapped.className ?? '').trim(),
    });
  }

  for (const cls of portalClasses) {
    const courseId = normalizeLmsCourseId(cls.lms_class_reference);
    const classId = String(cls.id ?? '').trim();
    if (!courseId || !classId || byCourseId.has(courseId)) {
      continue;
    }
    byCourseId.set(courseId, {
      classId,
      className: String(cls.class_name ?? '').trim(),
    });
  }

  return byCourseId;
}

export function shouldRenameExistingClass(
  existingName: string,
  desiredName: string
): boolean {
  const current = existingName.trim();
  const desired = desiredName.trim();
  if (!current || !desired) {
    return false;
  }
  return current.toLowerCase() !== desired.toLowerCase();
}
