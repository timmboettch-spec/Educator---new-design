import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../src/i18n';
import { MemoryRouter } from 'react-router-dom';
import Educators from '../../../src/pages/educator/index';

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

const mockDispatch = vi.fn((action) => {
  if (typeof action === 'function') {
    return action(mockDispatch, () => reduxState);
  }
  // Return a promise-like object with unwrap method for thunk actions
  return {
    ...action,
    unwrap: () => Promise.resolve({}),
  };
});

const reduxState = {
  GetEducator: {
    responseGetEducator: {
      data: {
        items: [
          {
            id: 'e1',
            full_name: 'Jane Doe',
            email: 'jane@example.com',
            status: 'ACTIVE',
            school_id: 's1',
            school_name: 'Alpha School',
            tokens: 10,
            tokensUsed: 5,
            remainingTokens: 5,
            totalTokens: 10,
          },
          {
            id: 'e2',
            full_name: 'John Smith',
            email: 'john@example.com',
            status: 'PENDING',
            school_id: 's2',
            school_name: 'Beta School',
            tokens: 20,
            tokensUsed: 0,
            remainingTokens: 20,
            totalTokens: 20,
          },
        ],
        total: 2,
      },
    },
    status: 'succeeded',
    error: null,
  },
  GetEducatorStatus: 'succeeded',
  GetEducatorError: null,
  Schools: [
    { id: 's1', school_name: 'Alpha School', status: 'ACTIVE', user_id: 'u1' },
    { id: 's2', school_name: 'Beta School', status: 'ACTIVE', user_id: 'u1' },
  ],
  SchoolStatus: 'succeeded',
  Notifications: [],
};

vi.mock('react-redux', async () => {
  const actual =
    await vi.importActual<typeof import('react-redux')>('react-redux');
  return {
    ...actual,
    useDispatch: () => mockDispatch,
    useSelector: (selector: (s: typeof reduxState) => unknown) =>
      selector(reduxState),
  };
});

vi.mock('../../../src/redux/educator/GetEducatorRedux', () => ({
  GetEducatorByUserRequest: vi.fn(() => ({ type: 'GET_EDU' })),
  clearGetEducatorState: vi.fn(() => ({ type: 'CLEAR_EDU' })),
  updateEducatorStatusInStore: vi.fn(() => ({ type: 'UPDATE_EDU_STATUS' })),
  selectGetEducatorsData: (s: typeof reduxState) => ({
    items: s.GetEducator.responseGetEducator?.data?.items ?? [],
    total: s.GetEducator.responseGetEducator?.data?.total ?? 0,
  }),
  selectGetEducatorStatus: (s: typeof reduxState) => s.GetEducator.status,
  selectGetEducatorError: (s: typeof reduxState) => s.GetEducator.error,
  selectGetEducatorResponse: (s: typeof reduxState) =>
    s.GetEducator.responseGetEducator,
}));

vi.mock('../../../src/redux/schools/GetSchoolsRedux', () => ({
  GetSchoolRequest: vi.fn(() => ({ type: 'GET_SCHOOL' })),
  selectSchools: (s: typeof reduxState) => s.Schools,
  selectSchoolStatus: (s: typeof reduxState) => s.SchoolStatus,
}));

vi.mock('../../../src/redux/notifications/NotificationsRedux', () => ({
  selectNotifications: (s: typeof reduxState) => s.Notifications,
}));

vi.mock('../../../src/redux/auth/MeRedux', () => ({
  fetchCurrentUser: vi.fn(() => ({ type: 'auth/Me' })),
}));

vi.mock('../../../src/redux/educator/CreateEducatorRedux', () => ({
  InviteEducatorRequest: vi.fn(() => ({ type: 'INVITE_EDU' })),
}));

vi.mock('../../../src/redux/educator/DeleteEducatorRedux', () => ({
  DeleteEducatorRequest: vi.fn(() => ({ type: 'DELETE_EDU' })),
}));

vi.mock('../../../src/redux/educator/UpdateEducatorRedux', () => ({
  UpdateEducatorRequest: vi.fn(() => ({ type: 'UPDATE_EDU' })),
}));

vi.mock('../../../src/redux/educator/AddEducatorSchoolRedux', () => ({
  AddEducatorSchoolRequest: vi.fn(() => ({ type: 'ADD_EDU_SCHOOL' })),
}));

vi.mock('../../../src/redux/educator/RemoveEducatorSchoolRedux', () => ({
  RemoveEducatorSchoolRequest: vi.fn(() => ({ type: 'REMOVE_EDU_SCHOOL' })),
}));

vi.mock('../../../src/redux/educator/ResendInviteRedux', () => ({
  ResendInviteRequest: vi.fn(() => ({ type: 'RESEND_INVITE' })),
}));

vi.mock('../../../src/redux/class/GetEducatorClassesRedux', () => ({
  GetEducatorClassesRequest: vi.fn(() => ({ type: 'FETCH_EDU_CLASSES' })),
  clearEducatorClasses: vi.fn(() => ({ type: 'CLEAR_EDU_CLASSES' })),
  selectEducatorClassesForTransfer: () => [],
  selectEducatorClassesStatus: () => 'idle',
}));

vi.mock('../../../src/redux/dashboard/admin/DashboardOverviewRedux', () => ({
  getDashboardOverview: vi.fn(() => ({ type: 'GET_DASHBOARD_OVERVIEW' })),
}));

vi.mock('../../../src/components/common/Toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  SESSION_TOAST_KEY: 'app_pending_toast',
}));

// The applied-filter chip for the educator picked from the notification.
const getNotificationFilterChip = () => {
  const region = screen.queryByRole('region', { name: 'Active filters' });
  return region ? within(region).queryByText('Jane Doe') : null;
};

describe('Notification Applied Filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDispatch.mockImplementation((action) => {
      if (typeof action === 'function') {
        return action(mockDispatch, () => reduxState);
      }
      // Return a promise-like object with unwrap method for thunk actions
      return {
        ...action,
        unwrap: () => Promise.resolve({}),
      };
    });
  });

  it('should display filter chip when educator filter is applied from notification', async () => {
    const initialState = {
      educatorId: 'e1',
    };

    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/educators', state: initialState }]}
      >
        <Educators />
      </MemoryRouter>
    );

    // Wait for the filter chip to appear
    await waitFor(() => {
      expect(screen.getByText(/Educator:/i)).toBeInTheDocument();
    });

    // Check that Jane Doe is shown (appears in both filter chip and table)
    const janeDoeElements = screen.getAllByText('Jane Doe');
    expect(janeDoeElements.length).toBeGreaterThan(0);
  });

  it('should show active filter icon state when filter is applied', async () => {
    const initialState = {
      educatorId: 'e1',
    };

    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/educators', state: initialState }]}
      >
        <Educators />
      </MemoryRouter>
    );

    // Find the filter button and check for active state
    await waitFor(() => {
      const filterButton = screen.getByLabelText(/filter \(active\)/i);
      expect(filterButton).toBeInTheDocument();
      expect(filterButton).toHaveClass('border-orange-500');
    });
  });

  it('should remove individual filter when X button is clicked', async () => {
    const initialState = {
      educatorId: 'e1',
    };

    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/educators', state: initialState }]}
      >
        <Educators />
      </MemoryRouter>
    );

    // Wait for the filter chip to appear
    await waitFor(() => {
      expect(screen.getByText(/Educator:/i)).toBeInTheDocument();
    });

    // Find and click the remove button
    const removeButton = screen.getByRole('button', {
      name: /remove educator filter/i,
    });
    fireEvent.click(removeButton);

    // Filter chip should be removed
    await waitFor(() => {
      expect(screen.queryByText(/Educator:/i)).not.toBeInTheDocument();
    });

    // Both educators should now be visible
    expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
    expect(screen.getByText('John Smith')).toBeInTheDocument();
  });

  it('should clear all filters when Clear All button is clicked', async () => {
    const initialState = {
      educatorId: 'e1',
    };

    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/educators', state: initialState }]}
      >
        <Educators />
      </MemoryRouter>
    );

    // Wait for the filter chip to appear
    await waitFor(() => {
      expect(screen.getByText(/Educator:/i)).toBeInTheDocument();
    });

    // With single filter, button should say "Clear" not "Clear All"
    const clearButton = screen.getByRole('button', {
      name: /clear all filters/i,
    });
    expect(clearButton).toHaveTextContent('Clear');

    fireEvent.click(clearButton);

    // Filter chips should be removed
    await waitFor(() => {
      expect(screen.queryByText(/Educator:/i)).not.toBeInTheDocument();
    });

    // Both educators should now be visible
    expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
    expect(screen.getByText('John Smith')).toBeInTheDocument();
  });

  it('should filter list to show only the targeted educator', async () => {
    const initialState = {
      educatorId: 'e1',
    };

    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/educators', state: initialState }]}
      >
        <Educators />
      </MemoryRouter>
    );

    // Wait for the component to render
    await waitFor(() => {
      expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
    });

    // Only Jane Doe should be visible, not John Smith
    expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
    expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
  });

  it('should support multiple active filters with chips', async () => {
    render(
      <MemoryRouter>
        <Educators />
      </MemoryRouter>
    );

    // Wait for the component to render
    await waitFor(() => {
      expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
    });

    // Open filter panel
    const filterButton = screen.getByLabelText(/^filter$/i);
    fireEvent.click(filterButton);

    // Wait for filter panel to open
    await waitFor(() => {
      expect(screen.getByText('Filter Educators')).toBeInTheDocument();
    });

    // Select a school filter (find the dropdown by placeholder)
    const schoolButtons = screen
      .getAllByRole('button')
      .filter((btn) =>
        btn.textContent?.toLowerCase().includes('select school')
      );

    if (schoolButtons.length > 0) {
      fireEvent.click(schoolButtons[0]);
      await waitFor(() => {
        const alphaOptions = screen.getAllByText('Alpha School');
        expect(alphaOptions.length).toBeGreaterThan(0);
      });
      const alphaOptions = screen.getAllByText('Alpha School');
      fireEvent.click(alphaOptions[alphaOptions.length - 1]);
    }

    // Select a status filter
    const statusButtons = screen
      .getAllByRole('button')
      .filter((btn) =>
        btn.textContent?.toLowerCase().includes('select status')
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

    // Click Apply Filter
    const applyButton = screen.getByRole('button', { name: /apply filter/i });
    fireEvent.click(applyButton);

    // Filter panel should close and filter chips should appear
    await waitFor(() => {
      expect(screen.queryByText('Filter Educators')).not.toBeInTheDocument();
      expect(screen.getByText(/School:/i)).toBeInTheDocument();
      expect(screen.getByText(/Status:/i)).toBeInTheDocument();
    });

    // With multiple filters, button should say "Clear All"
    const clearButton = screen.getByRole('button', {
      name: /clear all filters/i,
    });
    expect(clearButton).toHaveTextContent('Clear All');
  });

  it('should show inactive filter icon when no filters are applied', async () => {
    render(
      <MemoryRouter>
        <Educators />
      </MemoryRouter>
    );

    // Wait for the component to render
    await waitFor(() => {
      expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
    });

    // Find the filter button and check for inactive state
    const filterButton = screen.getByLabelText(/^filter$/i);
    expect(filterButton).toBeInTheDocument();
    expect(filterButton).toHaveClass('border-gray-400');
    expect(filterButton).not.toHaveClass('border-orange-500');
  });

  it('should restore full educator list after removing notification-applied filter', async () => {
    const initialState = {
      educatorId: 'e1',
    };

    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/educators', state: initialState }]}
      >
        <Educators />
      </MemoryRouter>
    );

    // Wait for the filtered view
    await waitFor(() => {
      expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
      expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
    });

    // The notification filter shows as an applied-filter chip for Jane Doe
    expect(getNotificationFilterChip()).not.toBeNull();

    // Remove the filter
    const removeButton = screen.getByRole('button', {
      name: /remove educator filter/i,
    });
    fireEvent.click(removeButton);

    // Full list should be restored
    await waitFor(() => {
      expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
      expect(screen.getByText('John Smith')).toBeInTheDocument();
    });

    // The notification filter chip is gone
    expect(getNotificationFilterChip()).toBeNull();
  });

  it('should remove the notification filter when Clear All is clicked', async () => {
    const initialState = {
      educatorId: 'e1',
    };

    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/educators', state: initialState }]}
      >
        <Educators />
      </MemoryRouter>
    );

    // Wait for the filtered view
    await waitFor(() => {
      expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
    });

    // The notification filter shows as an applied-filter chip for Jane Doe
    expect(getNotificationFilterChip()).not.toBeNull();

    // Click Clear All
    const clearAllButton = screen.getByRole('button', {
      name: /clear all filters/i,
    });
    fireEvent.click(clearAllButton);

    // Wait for full list to be restored
    await waitFor(() => {
      expect(screen.getByText('John Smith')).toBeInTheDocument();
    });

    // The notification filter chip is gone
    expect(getNotificationFilterChip()).toBeNull();
  });

  it('should show all educators on page refresh (no location state)', async () => {
    // This simulates a page refresh where location state is cleared
    render(
      <MemoryRouter>
        <Educators />
      </MemoryRouter>
    );

    // Wait for the component to render
    await waitFor(() => {
      expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
    });

    // Both educators should be visible (no filter applied)
    expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
    expect(screen.getByText('John Smith')).toBeInTheDocument();

    // No filter chips should be present
    expect(screen.queryByText(/Educator:/i)).not.toBeInTheDocument();

    // Filter icon should be in inactive state
    const filterButton = screen.getByLabelText(/^filter$/i);
    expect(filterButton).toHaveClass('border-gray-400');
    expect(filterButton).not.toHaveClass('border-orange-500');
  });
});
