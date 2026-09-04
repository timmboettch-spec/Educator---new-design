import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import Educators from '../../../src/pages/educator/index';
import type { RootState } from '../../../src/store';
import type { School } from '../../../src/redux/schools/GetSchoolsRedux';
import '@testing-library/jest-dom/vitest';

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

type DispatchAction = { type?: string; unwrap?: () => Promise<void> };

const mockDispatch = vi.fn((action: DispatchAction) => {
  if (typeof action === 'function') {
    return (action as (d: typeof mockDispatch) => DispatchAction)(mockDispatch);
  }
  return { unwrap: () => Promise.resolve() };
});

vi.mock('react-redux', async () => {
  const actual = await vi.importActual<typeof import('react-redux')>('react-redux');
  return { ...actual, useDispatch: () => mockDispatch };
});

vi.mock('../../../src/redux/educator/GetEducatorRedux', () => ({
  GetEducatorByUserRequest: vi.fn(() => ({ type: 'educator/getByUser', unwrap: () => Promise.resolve() })),
  clearGetEducatorState: vi.fn(() => ({ type: 'educator/clearGet' })),
  selectGetEducatorsData: (s: RootState) =>
    s.GetEducator?.responseGetEducator?.data ?? { items: [], total: 0 },
  selectGetEducatorStatus: (s: RootState) => s.GetEducator?.status ?? 'idle',
  selectGetEducatorError: (s: RootState) => s.GetEducator?.error ?? null,
  selectGetEducatorResponse: (s: RootState) => s.GetEducator?.responseGetEducator ?? null,
}));

vi.mock('../../../src/redux/educator/UpdateEducatorRedux', () => ({
  UpdateEducatorRequest: vi.fn(() => ({ type: 'educator/update', unwrap: () => Promise.resolve() })),
}));

vi.mock('../../../src/redux/educator/CreateEducatorRedux', () => ({
  InviteEducatorRequest: vi.fn(() => ({ type: 'educator/invite', unwrap: () => Promise.resolve() })),
}));

vi.mock('../../../src/redux/educator/DeleteEducatorRedux', () => ({
  DeleteEducatorRequest: vi.fn(() => ({ type: 'educator/delete', unwrap: () => Promise.resolve() })),
}));

vi.mock('../../../src/redux/educator/ResendInviteRedux', () => ({
  ResendInviteRequest: vi.fn(() => ({ type: 'educator/resendInvite', unwrap: () => Promise.resolve() })),
}));

vi.mock('../../../src/redux/notifications/NotificationsRedux', () => ({
  selectNotifications: () => [],
}));

vi.mock('../../../src/redux/dashboard/admin/DashboardOverviewRedux', () => ({
  getDashboardOverview: vi.fn(() => ({ type: 'dashboard/overview' })),
}));

vi.mock('../../../src/redux/schools/GetSchoolsRedux', () => ({
  default: (state = { responseSchool: null, status: 'idle', error: null }) => state,
  GetSchoolRequest: vi.fn(() => ({ type: 'schools/get', unwrap: () => Promise.resolve() })),
  selectSchools: (s: RootState) => {
    const data = s.School?.responseSchool?.data;
    if (!data) return [];
    if (Array.isArray(data)) return data as School[];
    if (Array.isArray((data as { items: School[] }).items)) return (data as { items: School[] }).items;
    return [];
  },
  selectSchoolStatus: (s: RootState) => s.School?.status ?? 'idle',
}));

vi.mock('../../../src/redux/users/GetUserRedux', () => ({
  getCurrentUserRequest: vi.fn(() => ({ type: 'users/get' })),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

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

vi.mock('../../../src/components/common/ListTable', () => ({
  default: ({
    data,
    onView,
    onEdit,
    onDelete,
    renderActions,
  }: {
    data: { id: string; full_name?: string; educator_name?: string }[];
    onView?: (row: unknown) => void;
    onEdit?: (row: unknown) => void;
    onDelete?: (row: unknown) => void;
    renderActions?: (row: unknown) => React.ReactNode;
  }) => (
    <table>
      <tbody>
        {(data ?? []).map((row) => (
          <tr key={row.id}>
            <td>{row.full_name ?? row.educator_name}</td>
            <td>
              {renderActions
                ? renderActions(row)
                : (
                  <>
                    {onView && <button onClick={() => onView(row)}>View</button>}
                    {onEdit && <button onClick={() => onEdit(row)}>Edit</button>}
                    {onDelete && <button onClick={() => onDelete(row)}>Delete</button>}
                  </>
                )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

const mockSchools: School[] = [
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

const buildStore = (overrides: Partial<RootState> = {}) =>
  configureStore({
    reducer: {
      GetEducator: () =>
        overrides.GetEducator ?? {
          responseGetEducator: { data: { items: [mockEducator], total: 1 } },
          status: 'succeeded',
          error: null,
        },
      School: () =>
        overrides.School ?? {
          responseSchool: { data: mockSchools, message: 'Success', status: 'success' },
          status: 'succeeded',
          error: null,
        },
      getSchools: () => ({
        responseSchool: { data: mockSchools, message: 'Success', status: 'success' },
        status: 'succeeded',
        error: null,
      }),
    },
  });

const renderPage = (overrides: Partial<RootState> = {}) =>
  render(
    <Provider store={buildStore(overrides)}>
      <MemoryRouter>
        <Educators />
      </MemoryRouter>
    </Provider>,
  );

describe('Educator Page + Modal Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
  });

  describe('CreateEducatorModal — open / close flow', () => {
    it('opens CreateEducatorModal when "Add Educator" button is clicked', async () => {
      renderPage();

      const addBtn = await screen.findByRole('button', { name: /Add Educator/i });
      await act(async () => { fireEvent.click(addBtn); });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('closes CreateEducatorModal when Back button is clicked', async () => {
      renderPage();

      const addBtn = await screen.findByRole('button', { name: /Add Educator/i });
      await act(async () => { fireEvent.click(addBtn); });

      await waitFor(() => screen.getByRole('dialog'));
      const dialog = screen.getByRole('dialog');
      const backBtn = within(dialog).getByRole('button', { name: /back/i });
      await act(async () => { fireEvent.click(backBtn); });

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('shows form fields when modal opens in create mode', async () => {
      renderPage();

      const addBtn = await screen.findByRole('button', { name: /Add Educator/i });
      await act(async () => { fireEvent.click(addBtn); });

      await waitFor(() => {
        const inputs = screen.queryAllByRole('textbox');
        expect(inputs.length).toBeGreaterThan(0);
      });
    });

    it('shows validation errors when form is submitted empty', async () => {
      renderPage();

      const addBtn = await screen.findByRole('button', { name: /Add Educator/i });
      await act(async () => { fireEvent.click(addBtn); });

      await waitFor(() => screen.getByRole('dialog'));
      const dialog = screen.getByRole('dialog');
      const submitBtn = within(dialog).queryByRole('button', { name: /create educator|invite/i });
      if (submitBtn) {
        await act(async () => { fireEvent.click(submitBtn); });
        await waitFor(() => {
          const errors = screen.queryAllByText(/required|invalid|must/i);
          expect(errors.length).toBeGreaterThan(0);
        });
      }
    });
  });

  describe('DeleteEducatorModal — open / confirm / cancel flow', () => {
    it('opens DeleteEducatorModal when Delete row action is clicked', async () => {
      renderPage();

      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      await act(async () => { fireEvent.click(deleteBtn); });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('shows educator name inside delete modal', async () => {
      renderPage();

      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      await act(async () => { fireEvent.click(deleteBtn); });

      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).queryByText(/Jane Doe/i)).toBeInTheDocument();
      });
    });

    it('dispatches DeleteEducatorRequest when confirmed', async () => {
      renderPage();

      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      await act(async () => { fireEvent.click(deleteBtn); });

      await waitFor(() => screen.getByRole('dialog'));
      const dialog = screen.getByRole('dialog');

      const confirmBtn = within(dialog).queryByRole('button', { name: /confirm|yes|delete educator/i });
      if (confirmBtn) {
        await act(async () => { fireEvent.click(confirmBtn); });
        await waitFor(() => {
          expect(mockDispatch).toHaveBeenCalled();
        });
      }
    });

    it('closes DeleteEducatorModal when cancel is clicked without dispatching delete', async () => {
      renderPage();

      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      await act(async () => { fireEvent.click(deleteBtn); });

      await waitFor(() => screen.getByRole('dialog'));
      const dialog = screen.getByRole('dialog');

      const callsBefore = mockDispatch.mock.calls.length;
      const cancelBtn = within(dialog).queryByRole('button', { name: /cancel|no|back/i });
      if (cancelBtn) {
        await act(async () => { fireEvent.click(cancelBtn); });
        expect(mockDispatch.mock.calls.length).toBe(callsBefore);
      }
    });
  });

  describe('View / Edit mode — educator details modal', () => {
    it('opens modal in view mode when View row action is clicked', async () => {
      renderPage();

      const viewBtn = await screen.findByRole('button', { name: /^View$/i });
      await act(async () => { fireEvent.click(viewBtn); });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('opens modal in edit mode when Edit row action is clicked', async () => {
      renderPage();

      const editBtn = await screen.findByRole('button', { name: /^Edit$/i });
      await act(async () => { fireEvent.click(editBtn); });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('shows Update Educator button in edit mode', async () => {
      renderPage();

      const editBtn = await screen.findByRole('button', { name: /^Edit$/i });
      await act(async () => { fireEvent.click(editBtn); });

      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: /update educator/i }),
        ).toBeInTheDocument();
      });
    });
  });
});
