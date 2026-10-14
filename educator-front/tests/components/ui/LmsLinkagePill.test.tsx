import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../../../src/i18n';
import { LmsLinkagePill } from '../../../src/components/ui/LmsLinkagePill';
import type { ClassLmsLinkageSummary } from '../../../src/types/Class_types';

const PROVIDERS: ClassLmsLinkageSummary['provider'][] = [
  'canvas',
  'moodle',
  'google_classroom',
  'lms',
];

const toneOf = (provider: ClassLmsLinkageSummary['provider']): string => {
  const { container, unmount } = render(
    <LmsLinkagePill
      linkage={{ provider, courseId: 'course-1', courseName: 'Nursing 101' }}
      fallbackCourseName="Nursing 101"
    />
  );
  const classes = (container.firstElementChild as HTMLElement).className;
  unmount();
  return classes;
};

describe('LmsLinkagePill', () => {
  it('uses one tone for every platform', () => {
    const tones = PROVIDERS.map((p) => ({
      provider: p,
      tone: ['border-gray-300', 'bg-gray-50', 'text-[#5f6060]'].filter((c) =>
        toneOf(p).split(' ').includes(c)
      ),
    }));

    for (const { provider, tone } of tones) {
      expect(tone, `tone for ${provider}`).toEqual([
        'border-gray-300',
        'bg-gray-50',
        'text-[#5f6060]',
      ]);
    }
  });

  it('carries no platform-specific tint', () => {
    for (const provider of PROVIDERS) {
      const classes = toneOf(provider);
      expect(classes, provider).not.toMatch(/amber|orange|blue/);
    }
  });

  it('names the platform and the course', () => {
    render(
      <LmsLinkagePill
        linkage={{
          provider: 'moodle',
          courseId: 'course-1',
          courseName: 'Nursing 101',
        }}
        fallbackCourseName="Nursing 101"
      />
    );

    expect(screen.getByText('Moodle')).toHaveAttribute(
      'aria-label',
      'Linked to Moodle course “Nursing 101”'
    );
  });
});
