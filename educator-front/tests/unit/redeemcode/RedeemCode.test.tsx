import { configureStore } from '@reduxjs/toolkit';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

vi.mock('../../../src/redux/config', () => ({
  default: { RedeemAPI: 'http://mock-api/redeem' },
}));

vi.mock('../../../src/store/hooks', async () => {
  const { useDispatch, useSelector } =
    await vi.importActual<typeof import('react-redux')>('react-redux');
  return { useAppDispatch: useDispatch, useAppSelector: useSelector };
});
vi.mock('../../../src/components/common/RedeemHeader', () => ({
  default: () => <div data-testid="redeem-header" />,
}));

import redeemReducer from '../../../src/redux/auth/RedeemRedux';
import { AUTH_MESSAGES } from '../../../src/utils/messages/auth';
import RedeemCode from '../../../src/pages/auth/RedeemCode/index';

const makeStore = () => configureStore({ reducer: { Redeem: redeemReducer } });

const renderRedeemCode = () =>
  render(
    <Provider store={makeStore()}>
      <MemoryRouter>
        <RedeemCode />
      </MemoryRouter>
    </Provider>,
  );

describe('RedeemCode', () => {
  it('renders the redeem code input step by default', () => {
    renderRedeemCode();
    expect(screen.getByText(AUTH_MESSAGES.TITLES.ENTER_REDEEM_CODE)).toBeInTheDocument();
  });

  it('renders 4 segmented inputs', () => {
    renderRedeemCode();
    expect(screen.getAllByPlaceholderText('XXXX')).toHaveLength(4);
  });

  it('Active License button is of type submit', () => {
    renderRedeemCode();
    expect(screen.getByRole('button', { name: /active license/i })).toHaveAttribute(
      'type',
      'submit',
    );
  });

  it('Start Trial button is of type button (not submit)', () => {
    renderRedeemCode();
    expect(screen.getByRole('button', { name: /start trial/i })).toHaveAttribute('type', 'button');
  });

  it('error message container has role-compatible structure for screen readers', async () => {
    const user = userEvent.setup();
    renderRedeemCode();
    await user.click(screen.getByRole('button', { name: /active license/i }));
    await waitFor(() => {
      const msg = screen.getByText(AUTH_MESSAGES.VALIDATION.REDEEM_CODE_REQUIRED);
      expect(msg.tagName.toLowerCase()).toBe('p');
    });
  });
});
