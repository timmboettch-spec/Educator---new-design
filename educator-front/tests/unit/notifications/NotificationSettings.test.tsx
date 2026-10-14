import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import NotificationSettings from '../../../src/components/notifications/NotificationSettings';
import type { NotificationPreference } from '../../../src/redux/notifications/NotificationsRedux';

// Mutable fake redux state so dispatch/selectors can be driven per test.
let mockState: {
  preferences: NotificationPreference[];
  preferencesStatus: string;
};

const mockDispatch = vi.fn(
  (action: { type: string; payload?: NotificationPreference[] }) => {
    if (action.type === 'savePreferences') {
      mockState = { ...mockState, preferences: action.payload ?? [] };
      return { unwrap: () => Promise.resolve(action.payload ?? []) };
    }
    return { unwrap: () => Promise.resolve([]) };
  }
);

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: typeof mockState) => unknown) =>
    selector(mockState),
}));

vi.mock('../../../src/redux/notifications/NotificationsRedux', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/redux/notifications/NotificationsRedux')
  >('../../../src/redux/notifications/NotificationsRedux');
  return {
    ...actual,
    fetchPreferences: vi.fn(() => ({ type: 'fetchPreferences' })),
    savePreferences: vi.fn((preferences: NotificationPreference[]) => ({
      type: 'savePreferences',
      payload: preferences,
    })),
    selectPreferences: (state: typeof mockState) => state.preferences,
    selectPreferencesStatus: (state: typeof mockState) =>
      state.preferencesStatus,
  };
});

vi.mock('../../../src/components/common/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function getSaveButton() {
  return screen.getByRole('button', { name: /save preferences/i });
}

function getToggle(name: RegExp) {
  return screen.getByRole('switch', { name });
}

describe('NotificationSettings save button (value-based dirty state)', () => {
  beforeEach(() => {
    mockDispatch.mockClear();
    mockState = { preferences: [], preferencesStatus: 'succeeded' };
  });

  test('button starts disabled with nothing changed', () => {
    render(<NotificationSettings role="educator" />);
    expect(getSaveButton()).toBeDisabled();
  });

  test('toggling a value enables the button', () => {
    render(<NotificationSettings role="educator" />);
    fireEvent.click(getToggle(/enable student report available/i));
    expect(getSaveButton()).toBeEnabled();
  });

  test('saving disables the button again without a page reload', async () => {
    render(<NotificationSettings role="educator" />);
    fireEvent.click(getToggle(/enable student report available/i));
    expect(getSaveButton()).toBeEnabled();

    fireEvent.click(getSaveButton());

    await waitFor(() => expect(getSaveButton()).toBeDisabled());
  });

  test('reverting a toggle back to its saved value disables the button', () => {
    render(<NotificationSettings role="educator" />);
    const toggle = getToggle(/enable student report available/i);

    fireEvent.click(toggle); // on
    expect(getSaveButton()).toBeEnabled();

    fireEvent.click(getToggle(/disable student report available/i)); // back off
    expect(getSaveButton()).toBeDisabled();
  });

  test('multi-toggle: button stays enabled while any value differs, disables only when all are reverted', () => {
    render(<NotificationSettings role="educator" />);

    fireEvent.click(getToggle(/enable student report available/i));
    fireEvent.click(getToggle(/enable simulation due date reminder/i));
    expect(getSaveButton()).toBeEnabled();

    // Revert only one of the two toggles — button must remain enabled.
    fireEvent.click(getToggle(/disable student report available/i));
    expect(getSaveButton()).toBeEnabled();

    // Revert the second toggle — now everything matches the saved state.
    fireEvent.click(getToggle(/disable simulation due date reminder/i));
    expect(getSaveButton()).toBeDisabled();
  });
});
