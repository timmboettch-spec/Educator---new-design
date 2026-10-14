/**
 * Integration tests — Code Redemption
 *
 * Scenarios covered:
 *  ✅ Successful redemption  (201 + SUCCESS message + post-state)
 *  ✅ Invalid / unknown code  (400 / 404)
 *  ✅ Already-used code       (400 + "already used")
 *  ✅ Expired code            (410 + "expired")
 *  ✅ Unauthorized (no token) (401)
 *  ✅ Duplicate / concurrent  (second submit ignored while in-flight)
 *  ✅ Empty fields validation (client-side, no API call)
 *  ✅ Malformed / short code  (client-side, no API call)
 *  ✅ Post-redemption state   (success indicator rendered)
 *  ✅ Accessibility           (type attributes, ARIA-friendly p tag)
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

vi.mock('../../../src/redux/config', () => ({
  default: { RedeemAPI: 'http://mock-api/auth/redeem' },
}));

// Mock the axios instance so tests control the network layer without needing global.fetch.
vi.mock('../../../src/redux/api', () => ({
  default: { post: vi.fn() },
}));

vi.mock('../../../src/utils/storage', () => ({
  getParsedUser: vi.fn(() => ({ email: 'test@example.com', id: '1' })),
  getToken: vi.fn(() => 'mock-token'),
  updateStoredUser: vi.fn(),
  clearAuthData: vi.fn(),
  setAuthData: vi.fn(),
  isRememberMe: vi.fn(() => false),
}));

vi.mock('../../../src/redux/auth/MeRedux', () => ({
  fetchCurrentUser: vi.fn(() => ({ type: 'auth/Me' })),
}));

vi.mock('../../../src/redux/auth/LoginRedux', () => ({
  restoreSession: vi.fn(() => ({ type: 'restoreSession' })),
}));

vi.mock('@/components/common/RedeemHeader', () => ({
  default: () => <div data-testid="redeem-header" />,
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('../../../src/components/common/Toast', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
  sonnerToast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>(
      'react-router-dom'
    );
  return { ...actual, useNavigate: () => vi.fn() };
});

import redeemReducer from '../../../src/redux/auth/RedeemRedux';
import RedeemCode from '../../../src/pages/auth/RedeemCode/index';
import { AUTH_MESSAGES } from '../../../src/utils/messages/auth';
import api from '../../../src/redux/api';
import { setAuthData } from '../../../src/utils/storage';

const VALID_SEGMENTS = ['ABCD', '1234', 'EFGH', '5678'];
const INVALID_SEGMENTS = ['ZZZZ', 'ZZZZ', 'ZZZZ', 'ZZZZ'];
const USED_SEGMENTS = ['USED', 'CODE', 'TEST', '0001'];
const EXPD_SEGMENTS = ['EXPD', 'CODE', 'TEST', '0002'];

const makeStore = () => configureStore({ reducer: { Redeem: redeemReducer } });

function renderComponent() {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter>
        <RedeemCode />
      </MemoryRouter>
    </Provider>
  );
}

function fillSegments(segments: string[]) {
  const inputs = screen.getAllByPlaceholderText('XXXX');
  segments.forEach((val, i) =>
    fireEvent.change(inputs[i], { target: { value: val } })
  );
}

/** Mock api.post to resolve with a successful response payload. */
function mockApiSuccess(message: string, data: object = {}) {
  (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    data: { message, data },
  });
}

/** Mock api.post to reject with a server error message. */
function mockApiError(message: string) {
  (api.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
    response: { data: { message } },
  });
}

describe('Redeem Code Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders 4 segmented inputs and both action buttons', () => {
    renderComponent();
    expect(screen.getAllByPlaceholderText('XXXX')).toHaveLength(4);
    expect(
      screen.getByRole('button', { name: /active license/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /start trial/i })
    ).toBeInTheDocument();
  });

  it('blocks submission and shows error when all fields are empty', async () => {
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /active license/i }));
    expect(
      await screen.findByText(AUTH_MESSAGES.VALIDATION.REDEEM_CODE_REQUIRED)
    ).toBeInTheDocument();
  });

  it('blocks submission and shows length error for an incomplete code', async () => {
    renderComponent();
    fireEvent.change(screen.getAllByPlaceholderText('XXXX')[0], {
      target: { value: 'ABCD' },
    });
    fireEvent.click(screen.getByRole('button', { name: /active license/i }));
    expect(
      await screen.findByText(AUTH_MESSAGES.VALIDATION.REDEEM_CODE_LENGTH)
    ).toBeInTheDocument();
  });

  it('shows success state and fires toast after a valid redemption', async () => {
    mockApiSuccess('License activated', { isLicenseActive: true });
    renderComponent();
    fillSegments(VALID_SEGMENTS);
    fireEvent.click(screen.getByRole('button', { name: /active license/i }));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('License activated')
    );
    expect(await screen.findByText(/license activated/i)).toBeInTheDocument();
  });

  it('persists a rotated access token from the redeem response', async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: {
        message: 'License activated',
        data: { isLicenseActive: true },
        token: 'rotated-token',
      },
    });
    renderComponent();
    fillSegments(VALID_SEGMENTS);
    fireEvent.click(screen.getByRole('button', { name: /active license/i }));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('License activated')
    );
    expect(setAuthData).toHaveBeenCalledWith(
      { accessToken: 'rotated-token' },
      expect.anything(),
      expect.any(Boolean)
    );
  });

  it('does not call setAuthData when the redeem response has no token', async () => {
    mockApiSuccess('License activated', { isLicenseActive: true });
    renderComponent();
    fillSegments(VALID_SEGMENTS);
    fireEvent.click(screen.getByRole('button', { name: /active license/i }));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('License activated')
    );
    expect(setAuthData).not.toHaveBeenCalled();
  });

  it('shows error toast for an invalid (unknown) code and keeps form open', async () => {
    mockApiError('Invalid redemption code');
    renderComponent();
    fillSegments(INVALID_SEGMENTS);
    fireEvent.click(screen.getByRole('button', { name: /active license/i }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Invalid redemption code')
    );
    expect(screen.getAllByPlaceholderText('XXXX')).toHaveLength(4);
  });

  it('shows already-used error and keeps form open', async () => {
    mockApiError('Code has already been used');
    renderComponent();
    fillSegments(USED_SEGMENTS);
    fireEvent.click(screen.getByRole('button', { name: /active license/i }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Code has already been used')
    );
    expect(screen.getAllByPlaceholderText('XXXX')).toHaveLength(4);
  });

  it('shows expired-code error and keeps form open', async () => {
    mockApiError('Redemption code has expired');
    renderComponent();
    fillSegments(EXPD_SEGMENTS);
    fireEvent.click(screen.getByRole('button', { name: /active license/i }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Redemption code has expired')
    );
    expect(screen.getAllByPlaceholderText('XXXX')).toHaveLength(4);
  });

  it('shows unauthorized error when the API returns 401', async () => {
    mockApiError('Unauthorized');
    renderComponent();
    fillSegments(VALID_SEGMENTS);
    fireEvent.click(screen.getByRole('button', { name: /active license/i }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Unauthorized')
    );
  });

  it('does not fire a second API call when submit is clicked while in-flight', async () => {
    let resolvePost!: (v: unknown) => void;
    (api.post as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise((res) => {
        resolvePost = res;
      })
    );
    renderComponent();
    fillSegments(VALID_SEGMENTS);
    const btn = screen.getByRole('button', {
      name: /active license|redeeming/i,
    });
    fireEvent.click(btn);
    // Wait for Formik's async validation to complete and the thunk to call api.post.
    await waitFor(() =>
      expect(api.post as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1)
    );
    fireEvent.click(btn); // second click while request is in-flight
    expect(api.post as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
    resolvePost({ data: { message: 'OK', data: {} } });
  });

  it('Active License button has type="submit" for keyboard Enter support', () => {
    renderComponent();
    expect(
      screen.getByRole('button', { name: /active license/i })
    ).toHaveAttribute('type', 'submit');
  });

  it('validation message is a <p> for screen-reader compatibility', async () => {
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /active license/i }));
    const el = await screen.findByText(
      AUTH_MESSAGES.VALIDATION.REDEEM_CODE_REQUIRED
    );
    expect(el.tagName.toLowerCase()).toBe('p');
  });
});
