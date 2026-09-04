import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import TermsCard from '../../../src/components/TermsOfUse/TermsCard';

// Sentinel attached to window to prove no injected script/handler executed.
declare global {
  var __xssPwned: boolean | undefined;
}

describe('TermsCard - DOMPurify sanitization (XSS defenses)', () => {
  beforeEach(() => {
    (window as unknown as { __xssPwned?: boolean }).__xssPwned = undefined;
  });

  it('renders safe HTML tags (strong, em, a mailto) unchanged', () => {
    const html =
      "<strong>Bold</strong> and <em>italic</em> with " +
      "<a href='mailto:info@example.com'>contact</a>.";

    const { container } = render(
      <TermsCard id="01" title="Section" content={html} isActive={false} />,
    );

    expect(container.querySelector('strong')?.textContent).toBe('Bold');
    expect(container.querySelector('em')?.textContent).toBe('italic');

    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('mailto:info@example.com');
    expect(link?.textContent).toBe('contact');
  });

  it('removes <script> tags and never executes their code', () => {
    const html =
      'Hello<script>window.__xssPwned = true;</script>World';

    const { container } = render(
      <TermsCard id="01" title="T" content={html} isActive={false} />,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(window.__xssPwned).toBeUndefined();
    // Visible text is preserved even though the script node is stripped.
    expect(container.textContent).toContain('Hello');
    expect(container.textContent).toContain('World');
  });

  it('removes onerror and other event-handler attributes', () => {
    const html =
      '<a href="mailto:x@example.com" onclick="window.__xssPwned = true">click</a>' +
      '<img src="x" onerror="window.__xssPwned = true">';

    const { container } = render(
      <TermsCard id="01" title="T" content={html} isActive={false} />,
    );

    const anchor = container.querySelector('a');
    expect(anchor?.getAttribute('onclick')).toBeNull();
    // <img> is not in the allow-list — it must be stripped entirely.
    expect(container.querySelector('img')).toBeNull();
    expect(window.__xssPwned).toBeUndefined();
  });

  it('removes javascript: URLs from anchor href', () => {
    const html = "<a href=\"javascript:window.__xssPwned = true\">click</a>";

    const { container } = render(
      <TermsCard id="01" title="T" content={html} isActive={false} />,
    );

    const link = container.querySelector('a');
    // DOMPurify either drops the href (null) or drops the whole anchor. In
    // either case the dangerous scheme must not survive.
    if (link) {
      const href = link.getAttribute('href');
      if (href !== null) {
        expect(href).not.toMatch(/^\s*javascript:/i);
      }
    }
    expect(window.__xssPwned).toBeUndefined();
  });

  it('strips forbidden tags: iframe, object, embed, svg, style', () => {
    const html =
      "<iframe src='https://evil.example'></iframe>" +
      "<object data='https://evil.example'></object>" +
      "<embed src='https://evil.example'>" +
      "<svg><g/></svg>" +
      "<style>*{color:red}</style>" +
      'Visible text';

    const { container } = render(
      <TermsCard id="01" title="T" content={html} isActive={false} />,
    );

    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('object')).toBeNull();
    expect(container.querySelector('embed')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('style')).toBeNull();
    expect(container.textContent).toContain('Visible text');
  });

  it('strips inline style attributes (defense against CSS-based injection)', () => {
    const html =
      "<a href='mailto:x@example.com' " +
      "style='background:url(javascript:window.__xssPwned=true)'>link</a>";

    const { container } = render(
      <TermsCard id="01" title="T" content={html} isActive={false} />,
    );

    const link = container.querySelector('a');
    expect(link?.getAttribute('style')).toBeNull();
    expect(window.__xssPwned).toBeUndefined();
  });

  it('preserves formatting: id badge, title, and inline formatting render', () => {
    render(
      <TermsCard
        id="07"
        title="Submission"
        content="<strong>Bold notice</strong> body text"
        isActive
      />,
    );

    expect(screen.getByText('07')).toBeTruthy();
    expect(screen.getByText('Submission')).toBeTruthy();
    expect(screen.getByText('Bold notice')).toBeTruthy();
  });
});
