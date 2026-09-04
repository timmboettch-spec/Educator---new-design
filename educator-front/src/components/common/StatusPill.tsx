/**
 * Shared status chip used across the Products, Schools and Educators tables so
 * status looks identical everywhere. Uses a light tint + dark same-hue text
 * (e.g. green-100 / green-800) which clears WCAG AA contrast comfortably —
 * unlike solid white-on-green/yellow, which fails for small text. Semantic
 * status color is a deliberate, meaningful exception to the brand palette.
 */

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  danger: 'bg-red-100 text-red-800',
  neutral: 'bg-gray-100 text-gray-700',
};

export default function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: StatusTone;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center text-[10px] uppercase tracking-wide font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${TONE_CLASSES[tone]}`}
    >
      {label}
    </span>
  );
}
