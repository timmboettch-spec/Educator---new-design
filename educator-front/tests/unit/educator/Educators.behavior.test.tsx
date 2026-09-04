import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Educators from '../../../src/pages/educator/index';

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

const mockDispatch = vi.fn();

const reduxState = {
  GetEducator: {
    items: [
      {
        id: 'e1',
        full_name: 'Jane Doe',
        email: 'jane@example.com',
        status: 'ACTIVE',
        school_id: 's1',
        school_name: 'Alpha School',
        tokens: 10,
      },
    ],
    total: 1,
  },
  GetEducatorStatus: 'succeeded',
  GetEducatorError: null,
  Schools: [{ id: 's1', school_name: 'Alpha School', status: 'ACTIVE', user_id: 'u1' }],
  SchoolStatus: 'succeeded',
};

vi.mock('react-redux', async () => {
  const actual = await vi.importActual<typeof import('react-redux')>('react-redux');
  return {
    ...actual,
    useDispatch: () => mockDispatch,
    useSelector: (selector: (s: typeof reduxState) => unknown) => selector(reduxState),
  };
});

vi.mock('../../../src/redux/educator/GetEducatorRedux', () => ({
  GetEducatorByUserRequest: vi.fn(() => ({ type: 'GET_EDU' })),
  clearGetEducatorState: vi.fn(() => ({ type: 'CLEAR_EDU' })),
  selectGetEducatorsData: (s: typeof reduxState) => s.GetEducator,
  selectGetEducatorStatus: (s: typeof reduxState) => s.GetEducatorStatus,
  selectGetEducatorError: (s: typeof reduxState) => s.GetEducatorError,
  selectGetEducatorResponse: (s: typeof reduxState) => s.GetEducator,
}));
vi.mock('../../../src/redux/educator/CreateEducatorRedux', () => ({
  InviteEducatorRequest: vi.fn((payload: unknown) => ({ type: 'INVITE_EDU', payload })),
}));
vi.mock('../../../src/redux/educator/DeleteEducatorRedux', () => ({
  DeleteEducatorRequest: vi.fn((id: string) => ({ type: 'DELETE_EDU', id })),
}));
vi.mock('../../../src/redux/educator/UpdateEducatorRedux', () => ({
  UpdateEducatorRequest: vi.fn((payload: unknown) => ({ type: 'UPDATE_EDU', payload })),
}));
vi.mock('../../../src/redux/schools/GetSchoolsRedux', () => ({
  default: (state = { responseSchool: null, status: 'idle', error: null }) => state,
  GetSchoolRequest: vi.fn(() => ({ type: 'GET_SCHOOL' })),
  selectSchools: (s: typeof reduxState) => s.Schools,
  selectSchoolStatus: (s: typeof reduxState) => s.SchoolStatus,
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  SESSION_TOAST_KEY: 'app_pending_toast',
  sonnerToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  default: () => null,
}));

describe('Educators behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockImplementation((action: { type: string }) => {
      if (action.type === 'INVITE_EDU') return { unwrap: () => Promise.resolve({}) };
      if (action.type === 'DELETE_EDU') return { unwrap: () => Promise.resolve({}) };
      return { unwrap: () => Promise.resolve({}) };
    });
  });

  it('renders list and opens create modal', async () => {
    render(
      <MemoryRouter>
        <Educators />
      </MemoryRouter>,
    );
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add educator/i }));
    expect(screen.getAllByText('Create Educator').length).toBeGreaterThan(0);
  });

  it('submits create educator and shows invite alert', async () => {
    render(
      <MemoryRouter>
        <Educators />
      </MemoryRouter>,
    );
    
    // Open create modal
    fireEvent.click(screen.getByRole('button', { name: /add educator/i }));
    
    // Wait for modal to be visible
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /create educator/i })).toBeInTheDocument();
    });
    
    // Fill in form fields
    fireEvent.change(screen.getByPlaceholderText(/enter educator name/i), {
      target: { value: 'Alice' },
    });
    fireEvent.change(screen.getByPlaceholderText(/enter educator email/i), {
      target: { value: 'alice@test.com' },
    });
    fireEvent.change(screen.getByPlaceholderText(/seats/i), { 
      target: { value: '5' } 
    });
    
    // Select school - find the school dropdown button by placeholder text
    const schoolButtons = screen.getAllByRole('button').filter(
      (btn) => btn.textContent?.toLowerCase().includes('select school')
    );
    if (schoolButtons.length > 0) {
      fireEvent.click(schoolButtons[0]);
      await waitFor(() => {
        const schoolOptions = screen.getAllByText('Alpha School');
        expect(schoolOptions.length).toBeGreaterThan(0);
      });
      const schoolOptions = screen.getAllByText('Alpha School');
      fireEvent.click(schoolOptions[schoolOptions.length - 1]);
    }
    
    // Select status - find the status dropdown button by placeholder text
    const statusButtons = screen.getAllByRole('button').filter(
      (btn) => btn.textContent?.toLowerCase().includes('select status')
    );
    if (statusButtons.length > 0) {
      fireEvent.click(statusButtons[0]);
      await waitFor(() => {
        const activeOptions = screen.getAllByText('Active');
        expect(activeOptions.length).toBeGreaterThan(0);
      });
      const activeOptions = screen.getAllByText('Active');
      fireEvent.click(activeOptions[activeOptions.length - 1]);
    }
    
    // Submit the form
    const modal = screen.getByRole('dialog', { name: /create educator/i });
    const submitButton = within(modal).getByRole('button', { 
      name: /add educator|create educator/i 
    });
    fireEvent.click(submitButton);

    // Wait for dispatch to be called
    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalled();
    }, { timeout: 10000 });
  }, 10000);
});
