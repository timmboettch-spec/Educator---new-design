import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import QuickNavigation from '../../../src/components/TermsOfUse/QuickNavigation';

describe('QuickNavigation', () => {
  const mockSetActiveSection = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Quick Navigation heading', () => {
    render(
      <QuickNavigation
        activeSection={0}
        setActiveSection={mockSetActiveSection}
      />
    );

    expect(screen.getByText('Quick Navigation')).toBeTruthy();
  });

  it('renders Terms Of Use navigation items by default', () => {
    render(
      <QuickNavigation
        activeSection={0}
        setActiveSection={mockSetActiveSection}
      />
    );

    expect(
      screen.getByText('Acceptance of Terms of Use and Amendments')
    ).toBeTruthy();

    expect(
      screen.getByText("The Site Editor's Service")
    ).toBeTruthy();

    expect(
      screen.getByText('Your Responsibilities and Registration Obligations')
    ).toBeTruthy();

    expect(
      screen.getByText('Miscellaneous Information')
    ).toBeTruthy();
  });

  it('renders Privacy Policy navigation items when screenType is privacyPolicy', () => {
    render(
      <QuickNavigation
        activeSection={0}
        setActiveSection={mockSetActiveSection}
        screenType="privacyPolicy"
      />
    );

    expect(
      screen.getByText('Information Collection, Use and Sharing')
    ).toBeTruthy();

    expect(
      screen.getByText('Your Access to and Control Over Information')
    ).toBeTruthy();

    expect(screen.getByText('Questions')).toBeTruthy();
  });

  it('renders Privacy Policy items when isPrivacyPolicy is true', () => {
    render(
      <QuickNavigation
        activeSection={0}
        setActiveSection={mockSetActiveSection}
        isPrivacyPolicy
      />
    );

    expect(
      screen.getByText('Information Collection, Use and Sharing')
    ).toBeTruthy();

    expect(screen.getByText('Questions')).toBeTruthy();
  });

  it('calls setActiveSection when a navigation item is clicked', () => {
    render(
      <QuickNavigation
        activeSection={0}
        setActiveSection={mockSetActiveSection}
      />
    );

    fireEvent.click(screen.getByText('Privacy Policy'));

    expect(mockSetActiveSection).toHaveBeenCalledTimes(1);
    expect(mockSetActiveSection).toHaveBeenCalledWith(3);
  });

  it('renders all Terms Of Use navigation items', () => {
    render(
      <QuickNavigation
        activeSection={0}
        setActiveSection={mockSetActiveSection}
      />
    );

    const buttons = screen.getAllByRole('button');

    expect(buttons).toHaveLength(15);
  });

  it('renders all Privacy Policy navigation items', () => {
    render(
      <QuickNavigation
        activeSection={0}
        setActiveSection={mockSetActiveSection}
        screenType="privacyPolicy"
      />
    );

    const buttons = screen.getAllByRole('button');

    expect(buttons).toHaveLength(10);
  });

  it('highlights the active section', () => {
    render(
      <QuickNavigation
        activeSection={2}
        setActiveSection={mockSetActiveSection}
      />
    );

    const activeItem = screen.getByText(
      'Your Responsibilities and Registration Obligations'
    );

    expect(activeItem).toBeTruthy();
  });

  it('renders numbering correctly for Terms Of Use items', () => {
    render(
      <QuickNavigation
        activeSection={0}
        setActiveSection={mockSetActiveSection}
      />
    );

    expect(screen.getByText('1.')).toBeTruthy();
    expect(screen.getByText('15.')).toBeTruthy();
  });

  it('renders numbering correctly for Privacy Policy items', () => {
    render(
      <QuickNavigation
        activeSection={0}
        setActiveSection={mockSetActiveSection}
        screenType="privacyPolicy"
      />
    );

    expect(screen.getByText('1.')).toBeTruthy();
    expect(screen.getByText('10.')).toBeTruthy();
  });

  it('renders Terms Of Use items when screenType is not provided', () => {
    render(
      <QuickNavigation
        activeSection={0}
        setActiveSection={mockSetActiveSection}
      />
    );

    expect(
      screen.getByText('Acceptance of Terms of Use and Amendments')
    ).toBeTruthy();
  });

  it('gives priority to isPrivacyPolicy over screenType', () => {
    render(
      <QuickNavigation
        activeSection={0}
        setActiveSection={mockSetActiveSection}
        screenType="termsOfUse"
        isPrivacyPolicy
      />
    );

    expect(
      screen.getByText('Information Collection, Use and Sharing')
    ).toBeTruthy();

    expect(
      screen.queryByText('Miscellaneous Information')
    ).toBeNull();
  });
});