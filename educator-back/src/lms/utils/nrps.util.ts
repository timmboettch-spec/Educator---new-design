/** Extract Moodle course id from an NRPS membership URL when present. */
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

  return null;
}
