import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Schools from '../../../src/pages/schools/index';

const mockDispatch = vi.fn((): { unwrap: () => Promise<unknown> } => ({
  unwrap: () => Promise.resolve(),
}));

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({
      schoolResponse: {
        data: [
          {
            id: '1',
            school_name: 'ABC School',
            status: 'ACTIVE',
            user_id: 'u1',
          },
        ],
      },
      schoolStatus: 'succeeded',
    }),
}));

vi.mock('../../../src/redux/schools/GetSchoolsRedux', () => ({
  default: (state = { responseSchool: null, status: 'idle', error: null }) =>
    state,
  GetSchoolRequest: vi.fn(() => ({ type: 'get' })),
  selectSchoolResponse: (s: { schoolResponse: { data: unknown[] } }) =>
    s.schoolResponse,
  selectSchoolStatus: (s: { schoolStatus: string }) => s.schoolStatus,
}));

vi.mock('../../../src/redux/educator/GetEducatorRedux', () => ({
  GetEducatorByUserRequest: vi.fn(() => ({ type: 'educator/get' })),
  selectGetEducatorsData: () => ({
    items: [],
    totalItems: 0,
    currentPage: 1,
    totalPages: 1,
  }),
}));

vi.mock('../../../src/redux/auth/MeRedux', () => ({
  fetchCurrentUser: vi.fn(() => ({ type: 'auth/Me' })),
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

describe('Schools Listing Page', () => {
  it('renders schools page heading', () => {
    render(
      <MemoryRouter>
        <Schools />
      </MemoryRouter>
    );
    expect(screen.getByText('Schools')).toBeInTheDocument();
  });

  it('shows list title', () => {
    render(
      <MemoryRouter>
        <Schools />
      </MemoryRouter>
    );
    expect(screen.getByText('All School List')).toBeInTheDocument();
  });

  it('renders at least one school row', () => {
    render(
      <MemoryRouter>
        <Schools />
      </MemoryRouter>
    );
    expect(screen.getByText('ABC School')).toBeInTheDocument();
  });
});
