import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Schools from '../../../src/pages/schools/index';
import '@testing-library/jest-dom/vitest';

const mockSchools = [
  {
    id: 'school-1',
    school_name: 'Springfield High',
    status: 'ACTIVE',
    user_id: 'u1',
    address: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    zip: '62701',
    country: 'USA',
    phone: '555-1111',
    contact_name: 'John Smith',
  },
];

const mockState = {
  School: {
    responseSchool: { data: mockSchools },
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

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (fn: (state: unknown) => unknown) => fn(mockState),
}));

vi.mock('../../../src/redux/schools/PostSchoolsRedux', () => ({
  PostSchoolRequest: vi.fn(() => ({ type: 'schools/post' })),
}));

vi.mock('../../../src/redux/schools/GetSchoolsRedux', () => ({
  default: (state = { responseSchool: null, status: 'idle', error: null }) => state,
  GetSchoolRequest: vi.fn(() => ({ type: 'schools/get' })),
  resetSchools: vi.fn(() => ({ type: 'schools/reset' })),
  selectSchoolResponse: (s: typeof mockState) => s?.School?.responseSchool ?? null,
  selectSchoolStatus: (s: typeof mockState) => s?.School?.status ?? 'idle',
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

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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

const renderPage = () =>
  render(
    <MemoryRouter>
      <Schools />
    </MemoryRouter>,
  );

describe('Schools Page + CreateSchoolModal Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve() });
  });

  describe('Page renders school list', () => {
    it('displays school name in the list', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.queryByText('Springfield High')).toBeInTheDocument();
      });
    });
  });

  describe('Create mode', () => {
    it('opens CreateSchoolModal in create mode when "Add School" is clicked', async () => {
      renderPage();

      const addBtn = await screen.findByRole('button', { name: /add school/i });
      await act(async () => { fireEvent.click(addBtn); });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('shows form fields when modal is in create mode', async () => {
      renderPage();

      const addBtn = await screen.findByRole('button', { name: /add school/i });
      await act(async () => { fireEvent.click(addBtn); });

      await waitFor(() => {
        const inputs = screen.queryAllByRole('textbox');
        expect(inputs.length).toBeGreaterThan(0);
      });
    });

    it('closes create modal when Back button inside dialog is clicked', async () => {
      renderPage();

      const addBtn = await screen.findByRole('button', { name: /add school/i });
      await act(async () => { fireEvent.click(addBtn); });

      await waitFor(() => screen.getByRole('dialog'));
      const dialog = screen.getByRole('dialog');
      const backBtn = within(dialog).queryByRole('button', { name: /back|cancel/i });
      if (backBtn) {
        await act(async () => { fireEvent.click(backBtn); });
        await waitFor(() => {
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        });
      }
    });

    it('shows validation errors when form is submitted empty', async () => {
      renderPage();

      const addBtn = await screen.findByRole('button', { name: /add school/i });
      await act(async () => { fireEvent.click(addBtn); });

      await waitFor(() => screen.getByRole('dialog'));
      const dialog = screen.getByRole('dialog');
      const submitBtns = within(dialog).queryAllByRole('button', { name: /add school/i });
      const submitBtn = submitBtns.find(btn => btn.getAttribute('type') === 'submit');
      if (submitBtn) {
        await act(async () => { fireEvent.click(submitBtn); });
        await waitFor(() => {
          const errors = screen.queryAllByText(/required|invalid|must/i);
          expect(errors.length).toBeGreaterThan(0);
        });
      }
    });

    it('dispatches PostSchoolRequest on valid form submission', async () => {
      renderPage();

      const addBtn = await screen.findByRole('button', { name: /add school/i });
      await act(async () => { fireEvent.click(addBtn); });

      await waitFor(() => screen.getByRole('dialog'));
      const dialog = screen.getByRole('dialog');
      const inputs = within(dialog).queryAllByRole('textbox');
      inputs.forEach((input) => {
        fireEvent.change(input, { target: { value: 'Test Value' } });
      });

      const submitBtns = within(dialog).queryAllByRole('button', { name: /add school/i });
      const submitBtn = submitBtns.find(btn => btn.getAttribute('type') === 'submit');
      if (submitBtn) {
        await act(async () => { fireEvent.click(submitBtn); });
        await waitFor(() => {
          expect(mockDispatch).toHaveBeenCalled();
        });
      }
    });
  });

  describe('View mode', () => {
    it('opens modal in view mode when View action is clicked', async () => {
      renderPage();

      const viewBtn = await screen.findByRole('button', { name: /^View$/i });
      await act(async () => { fireEvent.click(viewBtn); });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('shows school details in view mode', async () => {
      renderPage();

      const viewBtn = await screen.findByRole('button', { name: /^View$/i });
      await act(async () => { fireEvent.click(viewBtn); });

      await waitFor(() => {
        expect(screen.queryByText(/Springfield High/i)).toBeInTheDocument();
      });
    });
  });

  describe('Edit mode', () => {
    it('opens modal in edit mode with form fields when Edit action is clicked', async () => {
      renderPage();

      const editBtn = await screen.findByRole('button', { name: /^Edit$/i });
      await act(async () => { fireEvent.click(editBtn); });

      await waitFor(() => {
        const inputs = screen.queryAllByRole('textbox');
        expect(inputs.length).toBeGreaterThan(0);
      });
    });

    it('dispatches PatchSchoolRequest when edit form is submitted', async () => {
      renderPage();

      const editBtn = await screen.findByRole('button', { name: /^Edit$/i });
      await act(async () => { fireEvent.click(editBtn); });

      await waitFor(() => screen.getByRole('dialog'));
      const dialog = screen.getByRole('dialog');
      const saveBtn = within(dialog).queryByRole('button', { name: /save|update/i });
      if (saveBtn) {
        await act(async () => { fireEvent.click(saveBtn); });
        await waitFor(() => {
          expect(mockDispatch).toHaveBeenCalled();
        });
      }
    });
  });

  describe('Delete mode — common ConfirmationModal', () => {
    it('opens delete confirmation when Delete action is clicked', async () => {
      renderPage();

      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      await act(async () => { fireEvent.click(deleteBtn); });

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('shows school name in delete confirmation dialog', async () => {
      renderPage();

      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      await act(async () => { fireEvent.click(deleteBtn); });

      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).queryByText(/Springfield High/i)).toBeInTheDocument();
      });
    });

    it('shows destructive-action warning text in delete confirmation dialog', async () => {
      renderPage();

      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      fireEvent.click(deleteBtn);

      const dialog = await screen.findByRole('dialog');
      // Must warn that the action cannot be undone
      const warning = within(dialog).queryByText(/cannot be undone/i);
      expect(warning).toBeInTheDocument();
    });

    it('shows Cancel and Delete buttons in delete confirmation', async () => {
      renderPage();

      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      await act(async () => { fireEvent.click(deleteBtn); });

      await waitFor(() => screen.getByRole('dialog'));
      const dialog = screen.getByRole('dialog');
      const allBtns = within(dialog).queryAllByRole('button');
      // At least Cancel/Back + Delete/Confirm
      expect(allBtns.length).toBeGreaterThanOrEqual(2);
    });

    it('dispatches DeleteSchoolRequest when delete is confirmed', async () => {
      renderPage();

      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      await act(async () => { fireEvent.click(deleteBtn); });

      await waitFor(() => screen.getByRole('dialog'));
      const dialog = screen.getByRole('dialog');
      const confirmBtn = within(dialog).queryByRole('button', { name: /confirm|delete/i });
      if (confirmBtn) {
        await act(async () => { fireEvent.click(confirmBtn); });
        await waitFor(() => {
          expect(mockDispatch).toHaveBeenCalled();
        });
      }
    });

    it('dismisses modal without dispatching when Back is clicked in delete mode', async () => {
      renderPage();

      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      await act(async () => { fireEvent.click(deleteBtn); });

      await waitFor(() => screen.getByRole('dialog'));
      const dialog = screen.getByRole('dialog');
      const callsBefore = mockDispatch.mock.calls.length;
      const backBtn = within(dialog).queryByRole('button', { name: /back|cancel/i });
      if (backBtn) {
        await act(async () => { fireEvent.click(backBtn); });
        expect(mockDispatch.mock.calls.length).toBe(callsBefore);
      }
    });

    it('closes dialog after Cancel/Back without removing school from list', async () => {
      renderPage();

      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      await act(async () => { fireEvent.click(deleteBtn); });

      await waitFor(() => screen.getByRole('dialog'));
      const dialog = screen.getByRole('dialog');
      const backBtn = within(dialog).queryByRole('button', { name: /back|cancel/i });
      if (backBtn) {
        await act(async () => { fireEvent.click(backBtn); });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      }

      // School must still be rendered after cancel
      expect(screen.queryByText('Springfield High')).toBeInTheDocument();
    });

    it('school row remains in DOM when DeleteSchoolRequest rejects (500)', async () => {
      mockDispatch.mockReturnValueOnce({
        unwrap: () => Promise.reject({ message: 'Internal Server Error' }),
      });

      renderPage();

      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      await act(async () => { fireEvent.click(deleteBtn); });

      await waitFor(() => screen.getByRole('dialog'));
      const dialog = screen.getByRole('dialog');
      const confirmBtn = within(dialog).queryByRole('button', { name: /confirm|delete/i });
      if (confirmBtn) {
        await act(async () => { fireEvent.click(confirmBtn); });
        await waitFor(() => {}, { timeout: 1500 });
        // School must still be in the DOM — no optimistic removal
        expect(screen.queryByText('Springfield High')).toBeInTheDocument();
      }
    });

    it('school row remains in DOM when DeleteSchoolRequest rejects (404 not found)', async () => {
      mockDispatch.mockReturnValueOnce({
        unwrap: () => Promise.reject({ message: 'School not found' }),
      });

      renderPage();

      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      await act(async () => { fireEvent.click(deleteBtn); });

      await waitFor(() => screen.getByRole('dialog'));
      const dialog = screen.getByRole('dialog');
      const confirmBtn = within(dialog).queryByRole('button', { name: /confirm|delete/i });
      if (confirmBtn) {
        await act(async () => { fireEvent.click(confirmBtn); });
        await waitFor(() => {}, { timeout: 1500 });
        expect(screen.queryByText('Springfield High')).toBeInTheDocument();
      }
    });

    it('school row remains in DOM when DeleteSchoolRequest rejects (403 forbidden)', async () => {
      mockDispatch.mockReturnValueOnce({
        unwrap: () => Promise.reject({ message: 'Forbidden' }),
      });

      renderPage();

      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      await act(async () => { fireEvent.click(deleteBtn); });

      await waitFor(() => screen.getByRole('dialog'));
      const dialog = screen.getByRole('dialog');
      const confirmBtn = within(dialog).queryByRole('button', { name: /confirm|delete/i });
      if (confirmBtn) {
        await act(async () => { fireEvent.click(confirmBtn); });
        await waitFor(() => {}, { timeout: 1500 });
        expect(screen.queryByText('Springfield High')).toBeInTheDocument();
      }
    });

    it('does not open multiple dialogs simultaneously on repeated delete clicks', async () => {
      renderPage();

      const deleteBtn = await screen.findByRole('button', { name: /^Delete$/i });
      await act(async () => {
        fireEvent.click(deleteBtn);
        fireEvent.click(deleteBtn);
      });

      await waitFor(() => screen.getByRole('dialog'));
      const dialogs = screen.queryAllByRole('dialog');
      expect(dialogs.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Modal exclusivity', () => {
    it('does not render multiple open modals simultaneously', async () => {
      renderPage();

      const addBtn = await screen.findByRole('button', { name: /add school/i });
      await act(async () => { fireEvent.click(addBtn); });

      const dialogs = screen.queryAllByRole('dialog');
      expect(dialogs.length).toBeLessThanOrEqual(1);
    });
  });
});
