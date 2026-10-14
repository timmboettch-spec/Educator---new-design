import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type StoneState = 'done' | 'current' | 'upcoming';

/** Which stone this is; the design weights each one's caption differently. */
export type StoneKind = 'start' | 'step' | 'finish';

interface StepStoneProps {
  kind: StoneKind;
  label: ReactNode;
  state: StoneState;
  icon: ReactNode;
  isSelected: boolean;
  ariaLabel: string;
  onSelect: () => void;
  hasConnector: boolean;
  connectorActive: boolean;
}

/** One stone in the setup tracker's stepping-stone row (Start / Step N / Finish). */
export function StepStone({
  kind,
  label,
  state,
  icon,
  isSelected,
  ariaLabel,
  onSelect,
  hasConnector,
  connectorActive,
}: Readonly<StepStoneProps>) {
  return (
    <div className="contents">
      {hasConnector && (
        <span
          aria-hidden="true"
          className={cn(
            'mt-5 h-0.5 min-w-4 flex-[1_1_16px] self-start rounded-sm',
            connectorActive ? 'bg-primary-500' : 'bg-[#e9e9e9]'
          )}
        />
      )}
      <div className="flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={onSelect}
          aria-label={ariaLabel}
          aria-current={isSelected ? 'step' : undefined}
          className={cn(
            'grid h-[42px] w-[42px] flex-none cursor-pointer place-items-center rounded-full border-2 text-[15px] font-bold transition-shadow duration-[180ms] ease-[ease]',
            state === 'done' && 'border-primary-500 bg-primary-500 text-white',
            state === 'current' &&
              'border-primary-500 bg-white text-primary-500',
            state === 'upcoming' &&
              'border-[#e9e9e9] bg-[#e9e9e9] text-[#5f6060]',
            isSelected && 'ring-2 ring-inset ring-[#5f6060]'
          )}
        >
          {icon}
        </button>
        <span
          className={cn(
            'text-[11px] text-[#5f6060]',
            kind === 'start' &&
              cn('select-none', isSelected ? 'font-bold' : 'font-semibold'),
            kind === 'step' && (isSelected ? 'font-bold' : 'font-medium'),
            // As in the design, Finish keeps its weight when selected.
            kind === 'finish' && 'font-medium'
          )}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
