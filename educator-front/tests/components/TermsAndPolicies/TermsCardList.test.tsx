import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TermsCardList from '../../../src/components/TermsOfUse/TermsCardList';

vi.mock('../../../src/components/TermsOfUse/TermsCard', () => ({
  default: ({
    id,
    title,
    isActive,
  }: {
    id: string;
    title: string;
    isActive: boolean;
  }) => (
    <div data-testid="terms-card">
      <span>{id}</span>
      <span>{title}</span>
      <span>{isActive ? 'active' : 'inactive'}</span>
    </div>
  ),
}));

vi.mock(
  '../../../../public/assets/TermsAndPolicies/termsOfUseData.json',
  () => ({
    default: [
      {
        id: '01',
        title: 'Terms Section 1',
        content: ['Content 1'],
      },
      {
        id: '02',
        title: 'Terms Section 2',
        content: ['Content 2'],
      },
    ],
  })
);

vi.mock(
  '../../../../public/assets/TermsAndPolicies/termsOfUsePrivacyPolicy.json',
  () => ({
    default: [
      {
        id: '01',
        title: 'Privacy Section 1',
        content: ['Content 1'],
      },
      {
        id: '02',
        title: 'Privacy Section 2',
        content: ['Content 2'],
      },
    ],
  })
);

describe('TermsCardList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Terms Of Use cards by default', () => {
    render(<TermsCardList activeSection={0} />);

    expect(
      screen.getByText('Acceptance of Terms of Use and Amendments')
    ).toBeTruthy();

    expect(screen.getByText("The Site Editor's Service")).toBeTruthy();
  });

  it('renders Privacy Policy cards when isPrivacyPolicy is true', () => {
    render(<TermsCardList activeSection={0} isPrivacyPolicy />);

    expect(
      screen.getByText('Information Collection, Use and Sharing')
    ).toBeTruthy();

    expect(
      screen.getByText('Your Access To And Control Over Information')
    ).toBeTruthy();
  });

  it('marks active card correctly', () => {
    render(<TermsCardList activeSection={1} />);

    const activeElements = screen.getAllByText('active');

    expect(activeElements).toHaveLength(1);
  });

  it('renders all cards', () => {
    render(<TermsCardList activeSection={0} />);

    const cards = screen.getAllByTestId('terms-card');

    expect(cards).toHaveLength(15);
  });

  it('calls scrollIntoView when matching section exists', () => {
    const scrollIntoViewMock = vi.fn();

    const element = document.createElement('div');
    element.id = 'section-01';
    element.scrollIntoView = scrollIntoViewMock;

    document.body.appendChild(element);

    render(<TermsCardList activeSection={0} />);

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);

    document.body.removeChild(element);
  });

  it('does not fail when section element is not found', () => {
    render(<TermsCardList activeSection={99} />);

    expect(screen.getAllByTestId('terms-card')).toHaveLength(15);
  });
});
