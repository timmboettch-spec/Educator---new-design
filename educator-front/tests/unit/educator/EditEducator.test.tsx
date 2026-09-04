import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import Educators from '../../../src/pages/educator/index';
import '@testing-library/jest-dom';

vi.mock('../../../src/components/ui/DropdownMenu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect, disabled, className }: { children: React.ReactNode; onSelect?: () => void; disabled?: boolean; className?: string }) => (
    <button type="button" onClick={() => onSelect?.()} disabled={disabled} className={className}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

const mockDispatch = vi.fn(() => ({ unwrap: () => Promise.resolve() }));
const mockReduxState = {
  GetEducator: {
    items: [
      {
        id: 'edu-1',
        full_name: 'Jane Doe',
        email: 'jane@example.com',
        phone_number: '555-1234',
        status: 'ACTIVE',
        school_id: 'school-1',
        school_name: 'Springfield High',
        tokens: 10,
      },
    ],
    total: 1,
  },
  GetEducatorStatus: 'succeeded',
  GetEducatorError: null,
  Schools: [{ id: 'school-1', school_name: 'Springfield High' }],
  SchoolStatus: 'succeeded',
};

vi.mock('/assets/dashboard/logout_svg.svg', () => ({
  default: 'logout-mock.svg',
}));

vi.mock('/assets/dashboard/notification_svg.svg', () => ({
  default: 'notification-mock.svg',
}));

vi.mock('react-redux', async () => {
  const actual = await vi.importActual<typeof import('react-redux')>('react-redux');
  return {
    ...actual,
    useDispatch: () => mockDispatch,
    useSelector: (selector: (s: typeof mockReduxState) => unknown) => selector(mockReduxState),
  };
});

vi.mock('../../../src/redux/educator/GetEducatorRedux', () => ({
  GetEducatorByUserRequest: vi.fn(() => ({ type: 'get' })),
  clearGetEducatorState: vi.fn(() => ({ type: 'educator/clearGet' })),
  selectGetEducatorsData: (s: { GetEducator: unknown }) => s.GetEducator,
  selectGetEducatorStatus: (s: { GetEducatorStatus: string }) => s.GetEducatorStatus,
  selectGetEducatorError: (s: { GetEducatorError: string | null }) => s.GetEducatorError,
  selectGetEducatorResponse: (s: { GetEducator: unknown }) => s.GetEducator,
}));

vi.mock('../../../src/redux/educator/UpdateEducatorRedux', () => ({
  UpdateEducatorRequest: vi.fn(() => ({
    type: 'educator/update',
    unwrap: () => Promise.resolve(),
  })),
}));

vi.mock('../../../src/redux/educator/CreateEducatorRedux', () => ({
  InviteEducatorRequest: vi.fn(() => ({
    type: 'educator/invite',
    unwrap: () => Promise.resolve(),
  })),
}));

vi.mock('../../../src/redux/educator/DeleteEducatorRedux', () => ({
  DeleteEducatorRequest: vi.fn(() => ({
    type: 'educator/delete',
    unwrap: () => Promise.resolve(),
  })),
}));

vi.mock('../../../src/redux/schools/GetSchoolsRedux', () => ({
  default: (state = { responseSchool: null, status: 'idle', error: null }) => state,
  GetSchoolRequest: vi.fn(() => ({ type: 'schools/get' })),
  selectSchools: (s: { Schools: unknown[] }) => s.Schools,
  selectSchoolStatus: (s: { SchoolStatus: string }) => s.SchoolStatus,
}));
vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (s: typeof mockReduxState) => unknown) => selector(mockReduxState),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  SESSION_TOAST_KEY: 'app_pending_toast',
  sonnerToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  default: () => null,
}));

const mockSchools = [
  { id: 'school-1', school_name: 'Springfield High', status: 'ACTIVE', user_id: 'u1' },
  { id: 'school-2', school_name: 'Shelbyville Academy', status: 'ACTIVE', user_id: 'u1' },
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

const buildStore = (overrides: Record<string, unknown> = {}) =>
  configureStore({
    reducer: {
      GetEducator: () => overrides.GetEducator ?? { items: [mockEducator], total: 1 },
      GetEducatorStatus: () => overrides.GetEducatorStatus ?? 'succeeded',
      GetEducatorError: () => overrides.GetEducatorError ?? null,
      Schools: () => overrides.Schools ?? mockSchools,
      SchoolStatus: () => overrides.SchoolStatus ?? 'succeeded',
    },
  });

const renderPage = (overrides: Record<string, unknown> = {}) =>
  render(
    <Provider store={buildStore(overrides)}>
      <MemoryRouter>
        <Educators />
      </MemoryRouter>
    </Provider>,
  );

const openEditModal = async (overrides: Record<string, unknown> = {}) => {
  renderPage(overrides);

  const editButton = await screen.findByRole('button', {
    name: /edit/i,
  });

  fireEvent.click(editButton);
};

describe('Edit Educator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
  });

  it('opens Edit Educator modal', async () => {
    await openEditModal();
    expect(screen.getByText('Edit Educator')).toBeInTheDocument();
  });

  it('prefills educator data', async () => {
    await openEditModal();
    expect(screen.getByDisplayValue('Jane Doe')).toBeInTheDocument();
    expect(screen.getByDisplayValue('jane@example.com')).toBeInTheDocument();
  });

  it('updates full_name and dispatches', async () => {
    const { UpdateEducatorRequest } =
      await import('../../../src/redux/educator/UpdateEducatorRedux');
    await openEditModal();

    fireEvent.change(screen.getByDisplayValue('Jane Doe'), {
      target: { value: 'Updated Name' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Update Educator' }));
    });

    await waitFor(() => {
      expect(UpdateEducatorRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ full_name: 'Updated Name' }),
        }),
      );
    });
  });

  it('closes modal on Back', async () => {
    await openEditModal();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => {
      expect(screen.queryByText('Edit Educator')).not.toBeInTheDocument();
    });
  });

  it('keeps modal open on failure', async () => {
    mockDispatch.mockReturnValue({ unwrap: () => Promise.reject(new Error('fail')) });

    await openEditModal();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Update Educator' }));
    });

    expect(screen.getByText('Edit Educator')).toBeInTheDocument();
  });

  it('re-fetches after success', async () => {
    const { GetEducatorByUserRequest } =
      await import('../../../src/redux/educator/GetEducatorRedux');

    await openEditModal();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Update Educator' }));
    });

    await waitFor(() => {
      expect(GetEducatorByUserRequest).toHaveBeenCalled();
    });
  });
});
