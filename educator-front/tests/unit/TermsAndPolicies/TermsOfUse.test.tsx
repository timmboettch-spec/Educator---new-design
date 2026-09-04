import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TermsOfUse from '../../../src/pages/TermsOfUse';

vi.mock('@/components/TermsOfUse/TermsOfUseBanner', () => ({
  default: () => <div data-testid="banner">Banner</div>,
}));

vi.mock('@/components/TermsOfUse/QuickNavigation', () => ({
  default: ({
    activeSection,
    setActiveSection,
  }: {
    activeSection: number;
    setActiveSection: (index: number) => void;
  }) => (
    <div data-testid="quick-navigation">
      <span>Active: {activeSection}</span>
      <button onClick={() => setActiveSection(2)}>Change Section</button>
    </div>
  ),
}));

vi.mock('@/components/TermsOfUse/TermsCardList', () => ({
  default: ({ activeSection }: { activeSection: number }) => (
    <div data-testid="terms-card-list">
      Section: {activeSection}
    </div>
  ),
}));

describe('TermsOfUse', () => {
  it('renders all child components', () => {
    render(<TermsOfUse />);

    expect(screen.getByTestId('banner')).toBeTruthy();
    expect(screen.getByTestId('quick-navigation')).toBeTruthy();
    expect(screen.getByTestId('terms-card-list')).toBeTruthy();
  });

  it('initializes activeSection with 0', () => {
    render(<TermsOfUse />);

    expect(screen.getByText('Active: 0')).toBeTruthy();
    expect(screen.getByText('Section: 0')).toBeTruthy();
  });

  it('updates activeSection when QuickNavigation changes section', () => {
    render(<TermsOfUse />);

    fireEvent.click(screen.getByText('Change Section'));

    expect(screen.getByText('Active: 2')).toBeTruthy();
    expect(screen.getByText('Section: 2')).toBeTruthy();
  });
});