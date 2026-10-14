import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { vi, describe, it, expect, beforeAll } from 'vitest';
import { Provider } from 'react-redux';

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';

import Educators from '../../../src/pages/educator/index';
import { type RootState } from '@/store';
import type { School } from '../../../src/redux/schools/GetSchoolsRedux';

type DispatchAction = { type?: string; unwrap?: () => Promise<unknown> };

const mockDispatch = vi.fn((action: DispatchAction) => {
  if (typeof action === 'function') {
    return (action as (d: typeof mockDispatch) => DispatchAction)(mockDispatch);
  }
  return { unwrap: () => Promise.resolve() };
});

vi.mock('react-redux', async () => {
  const actual =
    await vi.importActual<typeof import('react-redux')>('react-redux');

  return {
    ...actual,
    useDispatch: () => mockDispatch,
  };
});

vi.mock('../../../src/redux/educator/GetEducatorRedux', () => ({
  default: (state = {}, _action?: unknown) => state,
  GetEducatorByUserRequest: vi.fn(() => ({
    type: 'educator/getByUser',
    unwrap: () => Promise.resolve(),
  })),

  clearGetEducatorState: vi.fn(() => ({
    type: 'educator/clearGet',
  })),

  selectGetEducatorsData: (s: RootState) => {
    const data = s.GetEducator?.responseGetEducator?.data;
    return {
      items: data?.items ?? [],
      total: data?.total ?? 0,
    };
  },
  selectGetEducatorStatus: (s: RootState) => s.GetEducator?.status ?? 'idle',
  selectGetEducatorError: (s: RootState) => s.GetEducator?.error ?? null,
  selectGetEducatorResponse: (s: RootState) =>
    s.GetEducator?.responseGetEducator ?? null,
}));

vi.mock('../../../src/redux/educator/UpdateEducatorRedux', () => ({
  default: (state = {}, _action?: unknown) => state,
  UpdateEducatorRequest: vi.fn(() => ({
    type: 'educator/update',
    unwrap: () => Promise.resolve(),
  })),
}));

vi.mock('../../../src/redux/educator/CreateEducatorRedux', () => ({
  default: (state = {}, _action?: unknown) => state,
  InviteEducatorRequest: vi.fn(() => ({
    type: 'educator/invite',
    unwrap: () => Promise.resolve(),
  })),
}));

vi.mock('../../../src/redux/educator/DeleteEducatorRedux', () => ({
  default: (state = {}, _action?: unknown) => state,
  DeleteEducatorRequest: vi.fn(() => ({
    type: 'educator/delete',
    unwrap: () => Promise.resolve(),
  })),
}));

vi.mock('../../../src/redux/schools/GetSchoolsRedux', () => ({
  default: (state = { responseSchool: null, status: 'idle', error: null }) =>
    state,
  GetSchoolRequest: vi.fn(() => ({
    type: 'schools/get',
    unwrap: () => Promise.resolve(),
  })),

  selectSchools: (s: RootState) => {
    const response = s.School?.responseSchool;
    const data = response?.data;
    if (!data) return [];
    if (Array.isArray(data)) return data as School[];
    if (Array.isArray((data as { items: School[] }).items)) {
      return (data as { items: School[] }).items;
    }
    return [];
  },
  selectSchoolStatus: (s: RootState) => s.School?.status ?? 'idle',
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  SESSION_TOAST_KEY: 'app_pending_toast',
  sonnerToast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
  default: () => null,
}));

const mockSchools = [
  {
    id: 'school-1',
    school_name: 'Springfield High',
    status: 'ACTIVE',
    user_id: 'u1',
  },
  {
    id: 'school-2',
    school_name: 'Shelbyville Academy',
    status: 'ACTIVE',
    user_id: 'u1',
  },
];

const mockEducator = {
  id: 'edu-1',
  full_name: 'Jane Doe',
  email: 'jane@example.com',
  phone_number: '555-1234',
  status: 'ACTIVE',
  school_id: 'school-1',
  school_name: 'Springfield High',
  educator_name: 'Jane Doe',
  tokens: 10,
};

const buildStore = (overrides: Partial<RootState> = {}) =>
  configureStore({
    reducer: {
      GetEducator: () =>
        overrides.GetEducator ?? {
          responseGetEducator: {
            data: {
              items: [mockEducator],
              total: 1,
            },
          },
        },

      GetEducatorStatus: () => overrides.GetEducator?.status ?? 'succeeded',

      GetEducatorError: () => overrides.GetEducator?.error ?? null,

      School: () =>
        overrides.School ?? {
          responseSchool: {
            data: mockSchools,
            message: 'Success',
            status: 'success',
          },
          status: 'succeeded',
          error: null,
        },

      getSchools: () =>
        overrides.getSchools ?? {
          responseSchool: {
            data: mockSchools,
            message: 'Success',
            status: 'success',
          },
          status: 'succeeded',
          error: null,
        },
    },
  });

const renderPage = (overrides: Partial<RootState> = {}) =>
  render(
    <Provider store={buildStore(overrides)}>
      <MemoryRouter>
        <Educators />
      </MemoryRouter>
    </Provider>
  );

const openCreateModal = async (overrides: Partial<RootState> = {}) => {
  renderPage(overrides);

  const addButton = await screen.findByRole('button', {
    name: /Add Educator/i,
  });

  await act(async () => {
    fireEvent.click(addButton);
  });
};

const selectSchool = async (schoolName: string) => {
  fireEvent.click(screen.getByRole('button', { name: /Select school/i }));
  const allMatches = await screen.findAllByText(schoolName);

  const dropdownOption = allMatches.find(
    (el) =>
      el.className.includes('cursor-pointer') ||
      el.className.includes('hover:bg-orange-50')
  );

  expect(dropdownOption).toBeTruthy();

  fireEvent.click(dropdownOption!);
};

describe('Create Educator', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockDispatch.mockReturnValue({
      unwrap: () => Promise.resolve(),
    });
  });

  it('opens Create Educator modal', async () => {
    await openCreateModal();

    expect(
      await screen.findByRole('heading', {
        name: 'Create Educator',
      })
    ).toBeInTheDocument();
  });

  it('valid submit dispatches InviteEducatorRequest', async () => {
    await openCreateModal();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Enter educator name'), {
        target: { value: 'Alice Johnson' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Enter Educator Email'), {
        target: { value: 'alice@school.com' },
      });
    });

    await selectSchool('Springfield High');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Active/i }));
    });
    const activeOptions = screen.getAllByText('Active');
    fireEvent.click(activeOptions[activeOptions.length - 1]);

    const tokenInput = screen.getByPlaceholderText(/seats/i);

    await act(async () => {
      fireEvent.change(tokenInput, {
        target: { value: 5 },
      });
    });

    const buttons = screen.getAllByRole('button', {
      name: /Add Educator|Create Educator|Invite/i,
    });

    const submitButton = buttons[buttons.length - 1];

    await act(async () => {
      fireEvent.click(submitButton);
    });

    // Check if dispatch was called with the invite action
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'educator/invite',
        })
      );
    });
  });

  it('keeps modal open when dispatch fails', async () => {
    mockDispatch.mockImplementation((action: DispatchAction) => {
      if (action?.type === 'educator/invite') {
        return { unwrap: () => Promise.reject(new Error('Server error')) };
      }
      return { unwrap: () => Promise.resolve() };
    });

    await openCreateModal();

    fireEvent.change(screen.getByPlaceholderText('Enter educator name'), {
      target: {
        value: 'Alice Johnson',
      },
    });

    fireEvent.change(screen.getByPlaceholderText('Enter Educator Email'), {
      target: {
        value: 'alice@school.com',
      },
    });

    const phoneInput =
      screen.queryByPlaceholderText(/phone/i) ||
      screen.queryByPlaceholderText(/mobile/i);

    if (phoneInput) {
      fireEvent.change(phoneInput, {
        target: {
          value: '9876543210',
        },
      });
    }

    await selectSchool('Springfield High');

    const tokenInput = screen.queryByPlaceholderText(/token/i);

    if (tokenInput) {
      fireEvent.change(tokenInput, {
        target: {
          value: '5',
        },
      });
    }

    const buttons = screen.getAllByRole('button', {
      name: /Add Educator|Create Educator/i,
    });

    const submitButton = buttons[buttons.length - 1];

    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: 'Create Educator',
        })
      ).toBeInTheDocument();
    });
  });

  it('renders Add Educator button', async () => {
    renderPage();

    expect(
      await screen.findByRole('button', { name: /Add Educator/i })
    ).toBeInTheDocument();
  });

  it('successful creation shows toast.success and closes modal', async () => {
    const { toast } = await import('../../../src/components/common/Toast');

    mockDispatch.mockReturnValue({
      unwrap: () =>
        Promise.resolve({ message: 'Educator invited successfully' }),
    });

    await openCreateModal();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Enter educator name'), {
        target: { value: 'Alice Johnson' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Enter Educator Email'), {
        target: { value: 'alice@school.com' },
      });
    });

    await selectSchool('Springfield High');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Active/i }));
    });
    const activeOptions = screen.getAllByText('Active');
    fireEvent.click(activeOptions[activeOptions.length - 1]);

    const tokenInput = screen.getByPlaceholderText(/seats/i);
    await act(async () => {
      fireEvent.change(tokenInput, { target: { value: '5' } });
    });

    const buttons = screen.getAllByRole('button', {
      name: /Add Educator|Create Educator|Invite/i,
    });
    const submitButton = buttons[buttons.length - 1];

    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Educator invited successfully'
      );
    });

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Create Educator' })
      ).not.toBeInTheDocument();
    });
  });

  it('shows toast.error when API call fails', async () => {
    const { toast } = await import('../../../src/components/common/Toast');

    mockDispatch.mockImplementation((action: DispatchAction) => {
      if (action?.type === 'educator/invite') {
        return {
          unwrap: () => Promise.reject({ message: 'Something went wrong' }),
        };
      }
      return { unwrap: () => Promise.resolve() };
    });

    await openCreateModal();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Enter educator name'), {
        target: { value: 'Alice Johnson' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Enter Educator Email'), {
        target: { value: 'alice@school.com' },
      });
    });

    await selectSchool('Springfield High');

    const tokenInput = screen.getByPlaceholderText(/seats/i);
    await act(async () => {
      fireEvent.change(tokenInput, { target: { value: '5' } });
    });

    const buttons = screen.getAllByRole('button', {
      name: /Add Educator|Create Educator|Invite/i,
    });
    const submitButton = buttons[buttons.length - 1];

    await act(async () => {
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Something went wrong');
    });
  });

  it('closes modal when Back button clicked', async () => {
    await openCreateModal();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /back/i }));
    });

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: 'Create Educator' })
      ).not.toBeInTheDocument();
    });
  });
});
