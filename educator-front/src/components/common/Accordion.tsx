import { ChevronDown } from 'lucide-react';
import { type CSSProperties, type ReactNode, useId } from 'react';
import { cn } from '../../lib/utils';

export interface AccordionProps {
  title: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  /** Rendered only while open, so its data fetching starts on first expand. */
  children: ReactNode;
  className?: string;
  /** Extra classes for the bar's wrapper, e.g. to make it sticky. */
  barClassName?: string;
  /** Inline styles for the bar's wrapper, for measured values such as a sticky offset. */
  barStyle?: CSSProperties;
  /** Heading level of the bar, so screen readers can list and jump between sections. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
}

/**
 * A collapsible section: a full-width toggle bar with its content below,
 * following the WAI-ARIA accordion pattern (the toggle sits in a heading and
 * the open content is a region named by it).
 */
export function Accordion({
  title,
  isOpen,
  onToggle,
  children,
  className,
  barClassName,
  barStyle,
  headingLevel = 2,
}: AccordionProps) {
  const buttonId = useId();
  const contentId = useId();
  const Heading = `h${headingLevel}` as const;

  return (
    <section className={className}>
      <Heading
        className={cn('px-3 py-2 bg-white', barClassName)}
        style={barStyle}
      >
        <button
          id={buttonId}
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={contentId}
          className="w-full flex items-center justify-between gap-2 bg-[#e9e9e9] text-[#5f6060] text-sm font-semibold rounded-lg pl-5 pr-4 py-2 text-left hover:bg-[#dcdcdc] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
        >
          <span className="min-w-0 break-words">{title}</span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={cn(
              'shrink-0 transition-transform duration-200',
              !isOpen && '-rotate-90'
            )}
          />
        </button>
      </Heading>
      {isOpen && (
        <div id={contentId} role="region" aria-labelledby={buttonId}>
          {children}
        </div>
      )}
    </section>
  );
}
