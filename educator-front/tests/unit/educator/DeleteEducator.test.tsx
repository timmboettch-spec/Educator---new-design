import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
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

vi.mock('/assets/dashboard/logout_svg.svg', () => ({
  default: 'logout-mock.svg',
}));

vi.mock('/assets/dashboard/notification_svg.svg', () => ({
  default: 'notification-mock.svg',
}));

const mockDispatch = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const mockReduxState = {
  GetEducator: {
    responseGetEducator: {
      data: {
        items: [
          { id: 'edu-1', full_name: 'Jane Doe', school_name: 'Springfield High', status: 'ACTIVE' },
        ],
        total: 1,
      },
    },
    status: 'succeeded',
    error: null,
  },
  getSchools: {
    responseGetSchools: [{ id: 'school-1', school_name: 'Springfield High' }],
    status: 'succeeded',
    error: null,
  },
};

vi.mock('react-redux', async () => {
  const actual = await vi.importActual<typeof import('react-redux')>('react-redux');
  return {
    ...actual,
    useDispatch: () => mockDispatch,
    useSelector: (selector: (state: typeof mockReduxState) => unknown) => selector(mockReduxState),
  };
});

vi.mock('../../../src/redux/educator/GetEducatorRedux', () => ({
  GetEducatorByUserRequest: vi.fn(() => ({ type: 'get' })),
  clearGetEducatorState: vi.fn(() => ({ type: 'educator/clearGet' })),
  selectGetEducatorsData: (s: {
    GetEducator: { responseGetEducator?: { data?: { items?: unknown[]; total?: number } } };
  }) => ({
    items: s.GetEducator.responseGetEducator?.data?.items ?? [],
    total: s.GetEducator.responseGetEducator?.data?.total ?? 0,
  }),
  selectGetEducatorStatus: (s: { GetEducator: { status: string } }) => s.GetEducator.status,
  selectGetEducatorError: (s: { GetEducator: { error: string | null } }) => s.GetEducator.error,
  selectGetEducatorResponse: (s: { GetEducator: { responseGetEducator?: unknown } }) => s.GetEducator.responseGetEducator ?? null,
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
  selectSchools: (s: { getSchools: { responseGetSchools: unknown[] } }) =>
    s.getSchools.responseGetSchools,
  selectSchoolStatus: (s: { getSchools: { status: string } }) => s.getSchools.status,
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  SESSION_TOAST_KEY: 'app_pending_toast',
  sonnerToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  default: () => null,
}));

describe('Delete Educator', () => {
  it('renders educators table and delete icons', () => {
    render(
      <MemoryRouter>
        <Educators />
      </MemoryRouter>,
    );
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });
});
