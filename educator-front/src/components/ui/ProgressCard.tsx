import type { KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface HeaderIconProps {
  Ic?: LucideIcon;
  onClick?: () => void;
  label: string;
  iconLabel?: string;
}

function HeaderIcon({ Ic, onClick, label, iconLabel }: HeaderIconProps) {
  if (!Ic) {
    return null;
  }

  if (!onClick) {
    return <Ic className="w-6 h-6 text-primary-500" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={iconLabel ?? label}
      title={iconLabel ?? label}
      className="p-1.5 rounded-lg text-primary-500 hover:text-primary-600 hover:bg-[#e9e9e9] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
    >
      <Ic className="w-6 h-6" aria-hidden="true" />
    </button>
  );
}

interface CardAction {
  label: string;
  onClick: () => void;
  // Makes the action a toggle button (aria-pressed), e.g. an active quick filter.
  pressed?: boolean;
}

interface Props {
  label: string;
  value: string;
  progress?: number;
  total?: number;
  badge?: string;
  subText?: string;
  onClick?: () => void;
  action?: CardAction;
  actions?: CardAction[];
  // Optional icon shown in the card's upper-right; clickable when onIconClick is set.
  icon?: LucideIcon;
  onIconClick?: () => void;
  iconLabel?: string;
  // Optional second icon (e.g. a school + educator pairing).
  icon2?: LucideIcon;
  onIcon2Click?: () => void;
  icon2Label?: string;
  // Reserve two lines for the value so bars align across side-by-side cards.
  tallValue?: boolean;
  // Render the action buttons larger (used by the page-level attention tiles).
  largeActions?: boolean;
  // Extra classes for the card root (e.g. h-full / flex-1 to fill a column).
  className?: string;
}

export default function ProgressCard({
  label,
  value,
  progress,
  total,
  badge,
  subText,
  onClick,
  action,
  actions,
  icon: Icon,
  onIconClick,
  iconLabel,
  icon2: Icon2,
  onIcon2Click,
  icon2Label,
  tallValue,
  largeActions,
  className,
}: Props) {
  const allActions: CardAction[] = [
    ...(actions ?? []),
    ...(action ? [action] : []),
  ];
  const hasProgress = progress !== undefined && total !== undefined;

  const percentage =
    hasProgress && total > 0
      ? Math.min(Math.max((progress / total) * 100, 0), 100)
      : 0;

  const percentageLabel = `${Math.round(percentage)}% active participation`;

  return (
    <div
      {...(onClick
        ? {
            role: 'button',
            tabIndex: 0,
            onClick,
            onKeyDown: (e: KeyboardEvent) => {
              // Only the card's own keys: Enter/Space on an inner action or icon button
              // must reach that button, not be swallowed as a card click.
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            },
          }
        : {})}
      className={`bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col min-h-[130px] overflow-hidden ${
        onClick
          ? 'cursor-pointer transition-shadow hover:shadow-md hover:border-primary-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400'
          : ''
      } ${className ?? ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-semibold text-gray-700 leading-snug truncate min-w-0">
          {label}
        </p>
        <div className="flex items-center gap-1 flex-shrink-0 -mt-1 -mr-1">
          <HeaderIcon
            Ic={Icon}
            onClick={onIconClick}
            label={label}
            iconLabel={iconLabel}
          />
          <HeaderIcon
            Ic={Icon2}
            onClick={onIcon2Click}
            label={label}
            iconLabel={icon2Label}
          />
        </div>
      </div>
      <div
        className={`flex items-start justify-between gap-2 mb-3 min-w-0 ${
          tallValue ? 'min-h-[2.75rem]' : ''
        }`}
      >
        <p className="text-sm sm:text-base text-gray-900 leading-snug min-w-0 break-words flex-1">
          {value}
        </p>
        {badge && (
          <span className="text-[11px] text-primary-500 font-medium whitespace-nowrap flex-shrink-0">
            {badge}
          </span>
        )}
      </div>
      {hasProgress && (
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-primary-500 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
      {(subText ?? (hasProgress ? percentageLabel : undefined)) && (
        <p className="text-sm text-gray-500 mt-1 break-words">
          {subText ?? percentageLabel}
        </p>
      )}
      {allActions.length > 0 && (
        <div className="mt-auto pt-3 flex flex-wrap gap-2">
          {allActions.map((a, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={a.pressed}
              onClick={(e) => {
                e.stopPropagation();
                a.onClick();
              }}
              className={cn(
                'font-semibold text-primary-600 hover:text-primary-700 border border-primary-300 hover:border-primary-500 hover:bg-[#e9e9e9] rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
                largeActions ? 'text-sm px-4 py-2' : 'text-xs px-3 py-1',
                a.pressed &&
                  'bg-primary-500 border-primary-500 text-white hover:bg-primary-600 hover:text-white'
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
