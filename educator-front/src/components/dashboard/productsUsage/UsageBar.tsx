import { cn } from '@/lib/utils';

interface UsageBarProps {
  label: string;
  used: number;
  total: number;
  unit: string;
  locale: string;
  indent?: boolean;
  /** A total row. */
  bold?: boolean;
  /** Just the used number, with no bar or "/ total" (no meaningful maximum). */
  barless?: boolean;
}

/** One usage row: label, "used / total{unit}", and a progress bar. */
export function UsageBar({
  label,
  used,
  total,
  unit,
  locale,
  indent = false,
  bold = false,
  barless = false,
}: UsageBarProps) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const format = (n: number) => n.toLocaleString(locale);
  const value = barless
    ? `${format(used)}${unit}`
    : `${format(used)} / ${format(total)}${unit}`;

  return (
    <div className={cn(indent && 'pl-4')}>
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'break-words min-w-0',
            bold ? 'font-semibold text-gray-800' : 'text-gray-600'
          )}
        >
          {label}
        </span>
        <span className="text-sm font-semibold text-gray-900 tabular-nums whitespace-nowrap">
          {value}
        </span>
      </div>
      {!barless && (
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={used}
          aria-valuetext={value}
          className="mt-1 h-1.5 bg-gray-200 rounded-full overflow-hidden"
        >
          {/* Width is the computed share, which Tailwind can't express statically. */}
          <div
            className="h-full bg-primary-500 rounded-full"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
