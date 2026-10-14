const PLACEHOLDER_CLASS_NAMES = new Set(['student', 'learner', 'n/a']);

export function resolveDisplayClassName(
  blobClass?: string | null,
  override?: string | null,
  studentName?: string | null
): string | undefined {
  const trimmedOverride = override?.trim();
  if (trimmedOverride) {
    return trimmedOverride;
  }

  const trimmedBlob = blobClass?.trim();
  if (!trimmedBlob) {
    return undefined;
  }

  const normalized = trimmedBlob.toLowerCase();
  if (PLACEHOLDER_CLASS_NAMES.has(normalized)) {
    return undefined;
  }

  if (studentName && normalized === studentName.trim().toLowerCase()) {
    return undefined;
  }

  return trimmedBlob;
}
