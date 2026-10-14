interface Props {
  label: string;
  value: string;
  progress?: number;
  total?: number;
  badge?: string;
  subText?: string;
}

export default function ParticipationProgressCard({
  label,
  value,
  progress,
  total,
  badge,
  subText,
}: Props) {
  const hasProgress = progress !== undefined && total !== undefined;

  const percentage =
    hasProgress && total > 0
      ? Math.min(Math.max((progress / total) * 100, 0), 100)
      : 0;

  const percentageLabel = `${Math.round(percentage)}% active participation`;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between min-h-[130px] overflow-hidden">
      <p className="text-sm font-semibold text-gray-700 leading-snug mb-3 truncate">
        {label}
      </p>
      <div className="flex items-start justify-between gap-2 mb-3 min-w-0">
        <h2 className="text-sm sm:text-base text-gray-900 leading-snug min-w-0 break-words flex-1">
          {value}
        </h2>
        {badge && (
          <span className="text-[11px] text-orange-500 font-medium whitespace-nowrap flex-shrink-0">
            {badge}
          </span>
        )}
      </div>
      {hasProgress && (
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-orange-500 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
      {(subText ?? (hasProgress ? percentageLabel : undefined)) && (
        <p className="text-sm text-gray-500 mt-1 break-words">
          {subText ?? percentageLabel}
        </p>
      )}
    </div>
  );
}
