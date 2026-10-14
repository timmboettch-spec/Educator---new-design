/** Blob report id for /api/admin/reports/:id (e.g. report-1783689131884). */
export function resolveStudentReportBlobId(
  report: Record<string, unknown> | null | undefined
): string {
  if (!report) return '';

  const nested = report['report_data'] ?? report['reportData'];
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const blobId = (nested as Record<string, unknown>)['id'];
    if (typeof blobId === 'string' && blobId.trim()) {
      return blobId.trim();
    }
  }

  const topId = report['id'];
  if (typeof topId === 'string' && topId.trim()) {
    return topId.trim();
  }

  return '';
}
