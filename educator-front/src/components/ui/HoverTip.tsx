import {
  cloneElement,
  isValidElement,
  useId,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

interface HoverTipProps {
  tip: string;
  children: ReactNode;
  className?: string;
  href?: string;
  /**
   * The child is itself focusable (e.g. an enabled button): the wrapper then
   * adds no tab stop of its own, shows the tip when the child is focused, and
   * leaves the child's name alone. The tip becomes the child's accessible
   * description (`aria-describedby`), so it's announced on focus.
   */
  childFocusable?: boolean;
}

export function HoverTip({
  tip,
  children,
  className,
  href,
  childFocusable = false,
}: HoverTipProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const tipId = useId();

  const show = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top - 6, left: rect.left + rect.width / 2 });
  };

  const Trigger = href ? 'a' : 'span';

  return (
    <Trigger
      {...(href
        ? { href, target: '_blank', rel: 'noreferrer' }
        : childFocusable
          ? {}
          : { tabIndex: 0 })}
      aria-label={childFocusable ? undefined : tip}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setPos(null)}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={() => setPos(null)}
      className={`focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${
        href ? 'cursor-pointer' : 'cursor-help'
      } ${className ?? ''}`}
    >
      {childFocusable &&
      isValidElement<{ 'aria-describedby'?: string }>(children)
        ? cloneElement(children, { 'aria-describedby': tipId })
        : children}
      {childFocusable && (
        <span id={tipId} className="sr-only">
          {tip}
        </span>
      )}
      {pos &&
        createPortal(
          <span
            role="tooltip"
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[1000] max-w-[260px] -translate-x-1/2 -translate-y-full whitespace-normal rounded-md bg-gray-900 px-2.5 py-1.5 text-[11px] font-normal leading-snug text-white shadow-lg pointer-events-none"
          >
            {tip}
          </span>,
          document.body
        )}
    </Trigger>
  );
}
