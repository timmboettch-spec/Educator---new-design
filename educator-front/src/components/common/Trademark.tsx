import { Fragment, type ReactNode } from 'react';

/**
 * Render a string with any ™ or ® trademark symbols raised to superscript.
 *
 * Used site-wide so trademark glyphs always sit as superscript rather than on
 * the baseline. The glyph is fixed at 10px to stay on the brand's "no font
 * below 10px" floor while still reading as a raised mark.
 */
export function superscriptTrademarks(text: string): ReactNode {
  const parts = text.split(/([™®])/g);
  return (
    <>
      {parts.map((part, i) =>
        part === '™' || part === '®' ? (
          <sup key={i} className="text-[10px] font-normal align-super leading-none">
            {part}
          </sup>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
