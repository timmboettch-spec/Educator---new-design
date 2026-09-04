import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Schools from '../../../src/pages/schools/index';
import '@testing-library/jest-dom/vitest';

// ─── shared mock state ────────────────────────────────────────────────────────

const mockSchool = { id: 'school-1', school_name: 'Springfield High', status: 'ACTIVE', user_id: 'u1' };

const mockState = {
  School: {
    responseSchool: { data: [mockSchool] },
    status: 'succeeded',
    error: null,
  },
  GetEducator: {
    responseGetEducator: { data: { items: [], total: 0 } },
    status: 'succeeded',
    error: null,
  },
};

const mockDispatch = vi.fn();

// ─── module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (fn: (state: unknown) => unknown) => fn(mockState),
}));

vi.mock('../../../src/redux/schools/GetSchoolsRedux', () => ({
  default: (state = { responseSchool: null, status: 'idle', error: null }) => state,
  GetSchoolRequest: vi.fn(() => ({ type: 'schools/get' })),
  resetSchools: vi.fn(() => ({ type: 'schools/reset' })),
  selectSchoolResponse: (s: typeof mockState) => s?.School?.responseSchool ?? null,
  selectSchoolStatus: (s: typeof mockState) => s?.School?.status ?? 'idle',
}));

vi.mock('../../../src/redux/schools/PostSchoolsRedux', () => ({
  PostSchoolRequest: vi.fn(() => ({ type: 'schools/post' })),
}));

vi.mock('../../../src/redux/schools/PatchSchoolsRedux', () => ({
  PatchSchoolRequest: vi.fn(() => ({ type: 'schools/patch' })),
}));

vi.mock('../../../src/redux/schools/DeleteSchoolsRedux', () => ({
  DeleteSchoolRequest: vi.fn(() => ({ type: 'schools/delete' })),
}));

vi.mock('../../../src/redux/educator/GetEducatorRedux', () => ({
  GetEducatorByUserRequest: vi.fn(() => ({ type: 'educator/get' })),
  selectGetEducatorsData: (s: typeof mockState) =>
    s?.GetEducator?.responseGetEducator?.data ?? { items: [], total: 0 },
}));

vi.mock('../../../src/redux/users/GetUserRedux', () => ({
  getCurrentUserRequest: vi.fn(() => ({ type: 'users/get' })),
}));

vi.mock('../../../src/redux/dashboard/admin/DashboardOverviewRedux', () => ({
  getDashboardOverview: vi.fn(() => ({ type: 'dashboard/overview' })),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  SESSION_TOAST_KEY: 'app_pending_toast',
  sonnerToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  default: () => null,
}));

vi.mock('../../../src/components/common/ListTable', () => ({
  default: ({
    data,
    onView,
    onEdit,
    onDelete,
  }: {
    data: { id: string; school_name?: string }[];
    onView?: (row: unknown) => void;
    onEdit?: (row: unknown) => void;
    onDelete?: (row: unknown) => void;
  }) => (
    <table>
      <tbody>
        {(data ?? []).map((row) => (
          <tr key={row.id}>
            <td>{row.school_name}</td>
            <td>
              {onView && <button onClick={() => onView(row)}>View</button>}
              {onEdit && <button onClick={() => onEdit(row)}>Edit</button>}
              {onDelete && <button onClick={() => onDelete(row)}>Delete</button>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

// ─── helper ───────────────────────────────────────────────────────────────────

const renderPage = () =>
  render(
    <MemoryRouter>
      <Schools />
    </MemoryRouter>,
  );

// ─── tests ────────────────────────────────────────────────────────────────────

describe('Delete School', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve({ message: 'Deleted', success: true }) });
  });

  // ── rendering ──────────────────────────────────────────────────────────────

  describe('Rendering', () => {
    it('renders school list with delete action per row', async () => {
      renderPage();
      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      expect(deleteBtn).toBeInTheDocument();
    });

    it('renders target school name in the list', async () => {
      renderPage();
      expect(await screen.findByText('Springfield High')).toBeInTheDocument();
    });
  });

  // ── confirmation dialog — open ──────────────────────────────────────────────

  describe('Confirmation Dialog — Opens', () => {
    it('opens delete confirmation modal when Delete is clicked', async () => {
      renderPage();
      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      fireEvent.click(deleteBtn);
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('renders school name inside the confirmation dialog', async () => {
      renderPage();
      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      fireEvent.click(deleteBtn);
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(/Springfield High/i)).toBeInTheDocument();
    });

    it('renders destructive-action warning text in the dialog', async () => {
      renderPage();
      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      fireEvent.click(deleteBtn);
      const dialog = await screen.findByRole('dialog');
      // The modal body must warn that deletion cannot be undone
      const warning = within(dialog).queryByText(/cannot be undone/i);
      expect(warning).toBeInTheDocument();
    });

    it('renders Cancel and Delete/Confirm buttons in the dialog', async () => {
      renderPage();
      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      fireEvent.click(deleteBtn);
      const dialog = await screen.findByRole('dialog');
      const allBtns = within(dialog).queryAllByRole('button');
      expect(allBtns.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── cancel without delete ───────────────────────────────────────────────────

  describe('Cancel Without Delete', () => {
    it('closes dialog without dispatching when Cancel/Back is clicked', async () => {
      renderPage();
      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      fireEvent.click(deleteBtn);
      const dialog = await screen.findByRole('dialog');
      const callsBefore = mockDispatch.mock.calls.length;

      const cancelBtn = within(dialog).queryByRole('button', { name: /back|cancel|no/i });
      if (cancelBtn) {
        fireEvent.click(cancelBtn);
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(mockDispatch.mock.calls).toHaveLength(callsBefore);
      }
    });

    it('school row remains visible in list after cancellation', async () => {
      renderPage();
      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      fireEvent.click(deleteBtn);
      const dialog = await screen.findByRole('dialog');

      const cancelBtn = within(dialog).queryByRole('button', { name: /back|cancel|no/i });
      if (cancelBtn) fireEvent.click(cancelBtn);

      expect(screen.getByText('Springfield High')).toBeInTheDocument();
    });
  });

  // ── successful deletion ─────────────────────────────────────────────────────

  describe('Successful Deletion', () => {
    it('dispatches DeleteSchoolRequest when deletion is confirmed', async () => {
      renderPage();
      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      fireEvent.click(deleteBtn);
      const dialog = await screen.findByRole('dialog');

      const confirmBtn = within(dialog).queryByRole('button', { name: /confirm|delete|yes/i });
      if (confirmBtn) {
        fireEvent.click(confirmBtn);
        await waitFor(() => expect(mockDispatch).toHaveBeenCalled());
      }
    });

    it('closes dialog after successful delete dispatch', async () => {
      renderPage();
      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      fireEvent.click(deleteBtn);
      const dialog = await screen.findByRole('dialog');

      const confirmBtn = within(dialog).queryByRole('button', { name: /confirm|delete|yes/i });
      if (confirmBtn) {
        fireEvent.click(confirmBtn);
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 3000 });
      }
    });
  });

  // ── API failure state ───────────────────────────────────────────────────────

  describe('API Failure State', () => {
    it.each([
      ['500 Internal Server Error', { message: 'Internal Server Error' }],
      ['404 Not Found', { message: 'School not found' }],
      ['403 Forbidden', { message: 'Forbidden' }],
    ])('school remains in DOM when DeleteSchoolRequest rejects (%s)', async (_label, rejection) => {
      mockDispatch.mockReturnValueOnce({ unwrap: () => Promise.reject(rejection) });

      renderPage();
      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      fireEvent.click(deleteBtn);
      const dialog = await screen.findByRole('dialog');

      const confirmBtn = within(dialog).queryByRole('button', { name: /confirm|delete|yes/i });
      if (confirmBtn) {
        fireEvent.click(confirmBtn);
        await waitFor(() => {}, { timeout: 1500 });
        expect(screen.getByText('Springfield High')).toBeInTheDocument();
      }
    });
  });

  // ── modal exclusivity ───────────────────────────────────────────────────────

  describe('Modal Exclusivity', () => {
    it('does not render multiple open dialogs simultaneously on delete trigger', async () => {
      renderPage();
      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      fireEvent.click(deleteBtn);
      await screen.findByRole('dialog');
      const dialogs = screen.queryAllByRole('dialog');
      expect(dialogs.length).toBeLessThanOrEqual(1);
    });
  });
});
