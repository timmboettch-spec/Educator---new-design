import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Sanitize text for jsPDF output (ported from HS-online).
 * Preserves the Latin-1 Supplement range (U+00A0-U+00FF) so accented
 * characters used by Spanish/French/German (á é í ó ú ñ ü ¿ ¡ etc.) render
 * correctly with jsPDF's default WinAnsi-encoded helvetica font.
 */
export function sanitizePdfText(text: unknown): string {
  if (!text) return '';
  return String(text)
    .replace(/[\u2080-\u2089]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0x2080 + 48)
    )
    .replace(/[\u2070-\u2079]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0x2070 + 48)
    )
    .replace(/\u00B2/g, '2')
    .replace(/\u00B3/g, '3')
    .replace(/\u00B9/g, '1')
    .replace(/&/g, 'and')
    .replace(/–|—/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, (c) => {
      const map: Record<string, string> = {
        '\u2018': "'",
        '\u2019': "'",
        '\u201C': '"',
        '\u201D': '"',
        '\u2026': '...',
        '\u2022': '* ',
      };
      return map[c] ?? '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}
