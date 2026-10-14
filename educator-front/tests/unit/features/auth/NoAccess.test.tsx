import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders } from '../../../../src/test/testUtils';
import NoAccess from '../../../../src/pages/auth/NoAccess';
import * as storage from '../../../../src/utils/storage';

describe('NoAccess', () => {
  let replaceSpy: ReturnType<typeof vi.fn>;
  const originalLocation = window.location;

  beforeEach(() => {
    replaceSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, replace: replaceSpy },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it('renders its copy through i18n, not the legacy locale files', () => {
    renderWithProviders(<NoAccess />);
    expect(
      screen.getByText('This account cannot access the Educator app')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign in with a different account' })
    ).toBeInTheDocument();
  });

  it('signs out and redirects to /login', () => {
    renderWithProviders(<NoAccess />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Sign in with a different account' })
    );
    expect(replaceSpy).toHaveBeenCalledWith('/login');
  });

  // Regression: `clearAuthData()` used to run unguarded. In a blocked-storage
  // environment (a locked-down private window, a third-party iframe) a throw there
  // skipped `logout()` and the redirect, trapping the user on this screen with a
  // dead button — the one path this component exists to always offer.
  it('still signs out and redirects when storage access throws', () => {
    vi.spyOn(storage, 'clearAuthData').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    renderWithProviders(<NoAccess />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Sign in with a different account' })
    );
    expect(replaceSpy).toHaveBeenCalledWith('/login');
  });
});
