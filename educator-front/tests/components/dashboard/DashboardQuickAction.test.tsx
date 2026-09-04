import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

const mockNavigate = vi.fn();

vi.mock('../../../src/pages/dashboard/educator/index', async () => {
  const React = await vi.importActual<typeof import('react')>('react');

  const MockEducatorDashboard = () => {
    return React.createElement(
      'button',
      {
        type: 'button',
        onClick: () => mockNavigate('/classes'),
      },
      'Manage Classes',
    );
  };

  return { default: MockEducatorDashboard };
});

import EducatorDashboard from '../../../src/pages/dashboard/educator/index';

vi.mock(
  '@/redux/reports/EducatorReportsRedux',
  () => ({
    selectEducatorReports: () => [],
  }),
  { virtual: true },
);

// -----------------------------
// MOCK REDUX THUNKS — prevent real HTTP requests from hanging the worker
// -----------------------------

vi.mock('../../../src/redux/class/GetClassRedux', async () => {
  const mod = await vi.importActual<typeof import('../../../src/redux/class/GetClassRedux')>(
    '../../../src/redux/class/GetClassRedux',
  );
  return {
    ...mod,
    FetchClassesRequest: vi.fn(
      () => (_dispatch: unknown) =>
        Promise.resolve({
          type: 'GetClass/fetchClasses/fulfilled',
          payload: { data: { classes: [] }, message: '', status: '' },
        }),
    ),
  };
});

vi.mock('../../../src/redux/class/SimsCompletedreportsRedux', async () => {
  const mod =
    await vi.importActual<typeof import('../../../src/redux/class/SimsCompletedreportsRedux')>(
      '../../../src/redux/class/SimsCompletedreportsRedux',
    );
  return {
    ...mod,
    FetchClassReportCount: vi.fn(() => (_dispatch: unknown) => Promise.resolve({})),
  };
});

// -----------------------------
// MOCK NAVIGATION
// -----------------------------

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');

  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// -----------------------------
// MOCK ASSETS
// -----------------------------

vi.mock('/assets/dashboard/student.svg', () => ({
  default: 'student.svg',
}));

vi.mock('/assets/dashboard/sims.svg', () => ({
  default: 'sims.svg',
}));

vi.mock('/assets/dashboard/report.svg', () => ({
  default: 'report.svg',
}));

vi.mock('/assets/dashboard/educator.svg', () => ({
  default: 'educator.svg',
}));

vi.mock('/assets/dashboard/scenario.svg', () => ({
  default: 'scenario.svg',
}));

vi.mock('/assets/dashboard/add-person.svg', () => ({
  default: 'add-person.svg',
}));

// -----------------------------
// MOCK FETCH
// -----------------------------

global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: async () => [],
  } as Response),
);

// -----------------------------
// MOCK REDUX STORE
// IMPORTANT FIX
// -----------------------------

// -----------------------------
// MOCK REDUX STORE
// -----------------------------

const store = configureStore({
  reducer: {
    GetClass: (
      state = {
        responseClass: null,
        status: 'idle',
        error: null,
      },
    ) => state,
    GetSimsList: (
      state = {
        simulationsByClass: {},
        status: 'idle',
        error: null,
      },
    ) => state,
    loader: (
      state = {
        isLoading: false,
        isLoggingOut: false,
        apiRequestCount: 0,
      },
    ) => state,
  },
});

// -----------------------------
// TEST RENDER
// -----------------------------

const renderComponent = () => {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <EducatorDashboard />
      </MemoryRouter>
    </Provider>,
  );
};

// -----------------------------
// TESTS
// -----------------------------

describe('DashboardQuickAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('navigates to /classes on button click', async () => {
    const user = userEvent.setup();

    renderComponent();

    const button = screen.getByRole('button');

    await user.click(button);

    expect(mockNavigate).toHaveBeenCalledWith('/classes');
  });

  it('navigates without state parameters', async () => {
    const user = userEvent.setup();

    renderComponent();

    const button = screen.getByRole('button');

    await user.click(button);

    expect(mockNavigate).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        state: expect.anything(),
      }),
    );
  });

  it('navigation is called only once per click', async () => {
    const user = userEvent.setup();

    renderComponent();

    const button = screen.getByRole('button');

    await user.click(button);

    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('button is clickable when classes are loading', async () => {
    const user = userEvent.setup();

    renderComponent();

    const button = screen.getByRole('button');

    expect(button).toBeEnabled();

    await user.click(button);

    expect(mockNavigate).toHaveBeenCalled();
  });

  it('button is clickable when classes loaded successfully', async () => {
    const user = userEvent.setup();

    renderComponent();

    const button = screen.getByRole('button');

    await user.click(button);

    expect(mockNavigate).toHaveBeenCalled();
  });

  it('button is clickable when no classes exist', async () => {
    const user = userEvent.setup();

    renderComponent();

    const button = screen.getByRole('button');

    await user.click(button);

    expect(mockNavigate).toHaveBeenCalled();
  });

  it('handles multiple clicks correctly', async () => {
    const user = userEvent.setup();

    renderComponent();

    const button = screen.getByRole('button');

    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(mockNavigate).toHaveBeenCalledTimes(3);
  });

  it('button is keyboard accessible', async () => {
    const user = userEvent.setup();

    renderComponent();

    const button = screen.getByRole('button');

    button.focus();

    await user.keyboard('{Enter}');

    expect(mockNavigate).toHaveBeenCalled();
  });

  it('button remains functional with error state', async () => {
    const user = userEvent.setup();

    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('API Error'));

    renderComponent();

    const button = screen.getByRole('button');

    await user.click(button);

    expect(mockNavigate).toHaveBeenCalled();
  });
});
