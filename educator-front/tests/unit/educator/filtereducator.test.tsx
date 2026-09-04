import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { describe, test, expect, vi } from 'vitest';
import Educators from '../../../src/pages/educator/index';

vi.mock('../../public/assets/dashboard/logout_svg.svg', () => ({
  default: 'logout-icon',
}));

vi.mock('../../public/dashboard/notification_svg.svg', () => ({
  default: 'notification-icon',
}));

vi.mock('../../../src/components/layout/Header', () => ({
  default: () => <div>Mock Header</div>,
}));

describe('Educators Filter & Search Unit Test', () => {
  const mockStore = configureStore({
    reducer: {
      GetEducator: () => ({
        responseGetEducator: {
          data: {
            items: [
              {
                id: '1',
                full_name: 'Arthi',
                school_name: 'ABC School',
                class_name: 'Class A',
                status: 'ACTIVE',
                school_id: '101',
                email: 'arthi@gmail.com',
                phone_number: '9876543210',
                tokens: 10,
              },
              {
                id: '2',
                full_name: 'Kavi',
                school_name: 'XYZ School',
                class_name: 'Class B',
                status: 'INACTIVE',
                school_id: '102',
                email: 'kavi@gmail.com',
                phone_number: '9876543211',
                tokens: 5,
              },
            ],
            total: 2,
          },
        },

        status: 'succeeded',
        error: null,
      }),

      getSchools: () => ({
        responseSchool: {
          data: [
            {
              id: '101',
              school_name: 'ABC School',
            },
            {
              id: '102',
              school_name: 'XYZ School',
            },
          ],
        },

        status: 'succeeded',
        error: null,
      }),
    },
  });

  const renderComponent = () =>
    render(
      <Provider store={mockStore}>
        <MemoryRouter>
          <Educators />
        </MemoryRouter>
      </Provider>,
    );

  test('should render educators list', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Arthi')).toBeInTheDocument();
    });

    expect(screen.getByText('Kavi')).toBeInTheDocument();
  });

  test('should update search input value', () => {
    renderComponent();

    const searchInput = screen.getByPlaceholderText(/search/i);

    fireEvent.change(searchInput, {
      target: { value: 'Arthi' },
    });

    expect(searchInput).toHaveValue('Arthi');
  });

  test('should open filter panel when filter button is clicked', () => {
    renderComponent();

    const buttons = screen.getAllByRole('button');

    fireEvent.click(buttons[1]);

    expect(screen.getByText('Filter Educators')).toBeInTheDocument();
  });

  test('should show entered invalid search value', () => {
    renderComponent();

    const searchInput = screen.getByPlaceholderText(/search/i);

    fireEvent.change(searchInput, {
      target: { value: 'Unknown User' },
    });

    expect(searchInput).toHaveValue('Unknown User');
  });

  test('should display educator status correctly', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  test('should display school names correctly', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('ABC School')).toBeInTheDocument();
    });

    expect(screen.getByText('XYZ School')).toBeInTheDocument();
  });
});
