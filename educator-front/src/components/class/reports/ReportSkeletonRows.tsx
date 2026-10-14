import { cn } from '@/lib/utils';

interface ReportSkeletonRowsProps {
  count: number;
  columnCount: number;
  label: string;
}

/** Pulsing placeholder rows, the same loading look as the class list tables. */
export function ReportSkeletonRows({
  count,
  columnCount,
  label,
}: ReportSkeletonRowsProps) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <tr key={i} className="border-t border-gray-100">
          {Array.from({ length: columnCount }, (_, j) => (
            <td key={j} className="px-4 py-5">
              {i === 0 && j === 0 && (
                <span role="status" className="sr-only">
                  {label}
                </span>
              )}
              <div
                className={cn(
                  'h-4 bg-gray-200 rounded animate-pulse',
                  j === 0 && 'w-4',
                  j === columnCount - 1 && 'h-7 w-40 rounded-full',
                  j !== 0 && j !== columnCount - 1 && 'w-3/4'
                )}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
