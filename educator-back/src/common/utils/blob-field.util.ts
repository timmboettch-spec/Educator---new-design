/** Safe string coercion for JSON blob fields (avoids [object Object] from String(object)). */
export function blobFieldToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}
