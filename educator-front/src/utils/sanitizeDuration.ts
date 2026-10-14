/**
 * Reduces a simulation's duration text to a short label ("15-20 minutes"):
 * the BE value is free text and is sometimes a whole sentence. Text with no
 * duration in it gives ''.
 */
export const sanitizeDuration = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  // Keep concise duration values as-is.
  if (raw.length <= 30 && /min|hour|hr/i.test(raw)) return raw;

  // Extract ranges like "15-20 minutes" from sentence-like content.
  const rangeMatch = raw.match(
    /(\d+\s*(?:-|to)\s*\d+\s*(?:minutes?|mins?|hours?|hrs?))/i
  );
  if (rangeMatch?.[1]) {
    return rangeMatch[1]
      .replace(/\s+to\s+/i, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Extract single values like "20 minutes".
  const singleMatch = raw.match(/(\d+\s*(?:minutes?|mins?|hours?|hrs?))/i);
  if (singleMatch?.[1]) return singleMatch[1].replace(/\s+/g, ' ').trim();

  // If no clear duration token is present, suppress noisy sentence text.
  return '';
};
