import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Educators from '../../../src/pages/educator/index';

vi.mock('../../../src/redux/educator/GetEducatorRedux', async () => {
  const actual = await vi.importActual('../../../src/redux/educator/GetEducatorRedux');

  return {
    ...actual,
    GetEducatorByUserRequest: vi.fn(() => ({
      type: 'educator/getByUser',
      unwrap: () =>
        Promise.resolve({
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
            ],
            total: 1,
          },
        }),
    })),
  };
});

vi.mock('../../../src/redux/schools/GetSchoolsRedux', async () => {
  const actual = await vi.importActual('../../../src/redux/schools/GetSchoolsRedux');

  return {
    ...actual,
    GetSchoolRequest: vi.fn(() => ({
      type: 'school/getSchools',
      unwrap: () =>
        Promise.resolve([
          {
            id: '101',
            school_name: 'ABC School',
          },
        ]),
    })),
  };
});

describe('Educators Get API Unit Test', () => {
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
            ],
            total: 1,
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
          ],
        },

        status: 'succeeded',
      }),
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
      }),
  });

  test('should fetch and display educators list', async () => {
    render(
      <Provider store={mockStore}>
        <MemoryRouter>
          <Educators />
        </MemoryRouter>
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Arthi')).toBeInTheDocument();
    });

    expect(screen.getByText('ABC School')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});
