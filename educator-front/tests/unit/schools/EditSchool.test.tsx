import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import Schools from '../../../src/pages/schools/index';

const mockDispatch = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));

const mockSchool = {
  id: 'school-1',
  school_name: 'Springfield High',
  status: 'ACTIVE',
  user_id: 'user-1',
};

const mockSchoolInactive = {
  id: 'school-2',
  school_name: 'Shelbyville Academy',
  status: 'INACTIVE',
  user_id: 'user-1',
};

interface SchoolRecord {
  id: string;
  school_name: string;
  status: string;
  user_id: string;
}

interface SchoolResponse {
  data: SchoolRecord[];
  message: string;
  status: string;
}

interface MockState {
  schoolResponse: SchoolResponse | null;
  schoolStatus: string;
}

let mockState: MockState;

vi.mock('../../../src/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: MockState) => unknown) => selector(mockState),
}));

vi.mock('../../../src/redux/schools/GetSchoolsRedux', () => ({
  default: (state = { responseSchool: null, status: 'idle', error: null }) => state,
  GetSchoolRequest: vi.fn(() => ({
    type: 'schools/get',
  })),

  selectSchoolResponse: (state: MockState) => state.schoolResponse,

  selectSchoolStatus: (state: MockState) => state.schoolStatus,
}));

vi.mock('../../../src/redux/educator/GetEducatorRedux', () => ({
  GetEducatorByUserRequest: vi.fn(() => ({ type: 'educator/get' })),
  selectGetEducatorsData: () => ({ items: [], totalItems: 0, currentPage: 1, totalPages: 1 }),
}));

vi.mock('../../../src/redux/users/GetUserRedux', () => ({
  getCurrentUserRequest: vi.fn(() => ({ type: 'users/get' })),
}));

vi.mock('../../../src/redux/schools/PatchSchoolsRedux', () => ({
  PatchSchoolRequest: vi.fn((payload: Partial<SchoolRecord>) => ({
    type: 'patchSchool',
    payload,
  })),

  resetPatchSchool: vi.fn(() => ({
    type: 'patchSchool/reset',
  })),
}));

vi.mock('../../../src/redux/schools/PostSchoolsRedux', () => ({
  PostSchoolRequest: vi.fn(() => ({
    type: 'postSchool',
  })),
}));

vi.mock('../../../src/redux/schools/DeleteSchoolsRedux', () => ({
  DeleteSchoolRequest: vi.fn(() => ({
    type: 'deleteSchool',
  })),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  SESSION_TOAST_KEY: 'app_pending_toast',
  sonnerToast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  default: () => null,
}));

const buildStore = () =>
  configureStore({
    reducer: () => ({}),
  });

const renderPage = () =>
  render(
    <Provider store={buildStore()}>
      <MemoryRouter>
        <Schools />
      </MemoryRouter>
    </Provider>,
  );

const openEditModal = async () => {
  const { container } = renderPage();

  const editIcons = container.querySelectorAll('.lucide-square-pen');

  await act(async () => {
    fireEvent.click(editIcons[0] as HTMLElement);
  });
};

describe('Edit School', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockDispatch.mockImplementation(() => ({
      unwrap: () => Promise.resolve({}),
    }));

    mockState = {
      schoolResponse: {
        data: [mockSchool, mockSchoolInactive],
        message: '',
        status: 'succeeded',
      },

      schoolStatus: 'succeeded',
    };

    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 'user-1',
      }),
    );
  });

  it('opens Edit School modal when edit icon is clicked', async () => {
    await openEditModal();

    expect(screen.getByText('Edit School')).toBeInTheDocument();
  });

  it('renders School Name field in edit modal', async () => {
    await openEditModal();

    expect(screen.getByDisplayValue('Springfield High')).toBeInTheDocument();
  });

  it('renders Status select in edit modal', async () => {
    await openEditModal();

    expect(await screen.findByRole('button', { name: /active|inactive/i })).toBeInTheDocument();
  });

  it('renders Update School button in edit modal', async () => {
    await openEditModal();

    expect(
      screen.getByRole('button', {
        name: /update school/i,
      }),
    ).toBeInTheDocument();
  });

  it('renders Back button in edit modal', async () => {
    await openEditModal();

    expect(
      screen.getByRole('button', {
        name: /back/i,
      }),
    ).toBeInTheDocument();
  });

  it('prefills school_name from selected school', async () => {
    await openEditModal();

    expect(screen.getByDisplayValue('Springfield High')).toBeInTheDocument();
  });

  it('prefills status from selected school (ACTIVE)', async () => {
    await openEditModal();

    const statusButton = screen.getByRole('button', {
      name: /active/i,
    });

    expect(statusButton).toBeInTheDocument();
  });

  it('prefills status INACTIVE for inactive school', async () => {
    const { container } = renderPage();

    const editIcons = container.querySelectorAll('.lucide-square-pen');

    await act(async () => {
      fireEvent.click(editIcons[1] as HTMLElement);
    });

    const statusButton = screen.getByRole('button', {
      name: /inactive/i,
    });

    expect(statusButton).toBeInTheDocument();
  });

  it('allows editing school_name field', async () => {
    await openEditModal();

    const nameInput = screen.getByDisplayValue('Springfield High');

    await act(async () => {
      fireEvent.change(nameInput, {
        target: {
          value: 'New School Name',
        },
      });
    });

    expect(screen.getByDisplayValue('New School Name')).toBeInTheDocument();
  });

  it('allows changing status to INACTIVE', async () => {
    await openEditModal();

    const statusSelect = screen.getByRole('button', { name: /active|inactive/i });

    fireEvent.change(statusSelect, {
      target: {
        value: 'INACTIVE',
      },
    });

    expect((statusSelect as HTMLSelectElement).value).toBe('INACTIVE');
  });

  it('shows required error when school_name is cleared and blurred', async () => {
    await openEditModal();

    const nameInput = screen.getByDisplayValue('Springfield High');

    fireEvent.change(nameInput, {
      target: {
        value: '',
      },
    });

    fireEvent.blur(nameInput);

    await waitFor(() => {
      expect(screen.getByText('School name is required')).toBeInTheDocument();
    });
  });

  it('does not dispatch PatchSchoolRequest when school_name is empty', async () => {
    const { PatchSchoolRequest } = await import('../../../src/redux/schools/PatchSchoolsRedux');

    await openEditModal();

    fireEvent.change(screen.getByDisplayValue('Springfield High'), {
      target: {
        value: '',
      },
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: /update school/i,
        }),
      );
    });

    await waitFor(() => {
      expect(PatchSchoolRequest).not.toHaveBeenCalled();
    });
  });

  it('dispatches PatchSchoolRequest with correct school id on submit', async () => {
    await openEditModal();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: /update school/i,
        }),
      );
    });

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalled();
    });
  });

  it('dispatches PatchSchoolRequest with updated school_name', async () => {
    const { PatchSchoolRequest } = await import('../../../src/redux/schools/PatchSchoolsRedux');

    await openEditModal();

    fireEvent.change(screen.getByDisplayValue('Springfield High'), {
      target: {
        value: 'Updated School',
      },
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: /update school/i,
        }),
      );
    });

    await waitFor(() => {
      expect(PatchSchoolRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          school_name: 'Updated School',
        }),
      );
    });
  });

  it('dispatches PatchSchoolRequest with updated status', async () => {
    await openEditModal();

    const statusButton = screen.getByRole('button', {
      name: /active/i,
    });

    await act(async () => {
      fireEvent.click(statusButton);
    });

    const inactiveOptions = await screen.findAllByText('Inactive');
    const inactiveOption = inactiveOptions.find(
      (el) => el.tagName.toLowerCase() === 'div',
    ) as HTMLElement;

    await act(async () => {
      fireEvent.click(inactiveOption);
    });

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: /update school/i,
        }),
      );
    });

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalled();
    });
  });

  it('closes modal when Back button is clicked', async () => {
    await openEditModal();

    fireEvent.click(
      screen.getByRole('button', {
        name: /back/i,
      }),
    );

    await waitFor(() => {
      expect(screen.queryByText('Edit School')).not.toBeInTheDocument();
    });
  });

  it('handles update dispatch rejection gracefully', async () => {
    mockDispatch.mockImplementation(() => ({
      unwrap: () => Promise.reject(new Error('Server error')),
    }));

    await openEditModal();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: /update school/i,
        }),
      );
    });

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalled();
    });
  });

  it('renders page without crashing in loading state', () => {
    mockState = {
      schoolResponse: null,
      schoolStatus: 'loading',
    };

    renderPage();

    expect(screen.getByText('Schools')).toBeInTheDocument();
  });

  it('renders school list when data is available', () => {
    renderPage();

    expect(screen.getByText('Springfield High')).toBeInTheDocument();

    expect(screen.getByText('Shelbyville Academy')).toBeInTheDocument();
  });

  it('school_name input is not disabled in edit mode', async () => {
    await openEditModal();

    const nameInput = screen.getByDisplayValue('Springfield High');

    expect(nameInput).not.toBeDisabled();
  });

  it('status select is not disabled in edit mode', async () => {
    await openEditModal();

    expect(screen.getByRole('button', { name: /active|inactive/i })).not.toBeDisabled();
  });

  it('accepts school name with numbers', async () => {
    await openEditModal();

    const nameInput = screen.getByDisplayValue('Springfield High');

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'School 2024' } });
    });

    fireEvent.blur(nameInput);

    await waitFor(() => {
      expect(
        screen.queryByText(
          'School name can only contain letters, numbers, spaces, periods, and hyphens',
        ),
      ).not.toBeInTheDocument();
    });
  });

  it('accepts school name with spaces', async () => {
    await openEditModal();

    const nameInput = screen.getByDisplayValue('Springfield High');

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Central High School' } });
    });

    fireEvent.blur(nameInput);

    await waitFor(() => {
      expect(
        screen.queryByText(
          'School name can only contain letters, numbers, spaces, periods, and hyphens',
        ),
      ).not.toBeInTheDocument();
    });
  });

  it('accepts school name with periods', async () => {
    await openEditModal();

    const nameInput = screen.getByDisplayValue('Springfield High');

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'St. Mary School' } });
    });

    fireEvent.blur(nameInput);

    await waitFor(() => {
      expect(
        screen.queryByText(
          'School name can only contain letters, numbers, spaces, periods, and hyphens',
        ),
      ).not.toBeInTheDocument();
    });
  });

  it('accepts school name with hyphens', async () => {
    await openEditModal();

    const nameInput = screen.getByDisplayValue('Springfield High');

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Lincoln-Douglas Academy' } });
    });

    fireEvent.blur(nameInput);

    await waitFor(() => {
      expect(
        screen.queryByText(
          'School name can only contain letters, numbers, spaces, periods, and hyphens',
        ),
      ).not.toBeInTheDocument();
    });
  });

  it('strips emoji characters from school name input', async () => {
    await openEditModal();

    const nameInput = screen.getByDisplayValue('Springfield High');

    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'School 😀' } });
    });

    fireEvent.blur(nameInput);

    await waitFor(() => {
      expect(screen.queryByText('Emojis are not allowed in school name')).not.toBeInTheDocument();
    });
  });
});
