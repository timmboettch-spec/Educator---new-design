import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import MetricsSummary from '../../../src/components/dashboard/MetricsSummary';

vi.mock('/assets/dashboard/student.svg', () => ({ default: 'student.svg' }));
vi.mock('/assets/dashboard/sims.svg', () => ({ default: 'sims.svg' }));
vi.mock('/assets/dashboard/report.svg', () => ({ default: 'report.svg' }));

const createMockStore = (classState: unknown, simsState: unknown) => {
  return configureStore({
    reducer: {
      GetClass: () => classState,
      GetSimsList: () => simsState,
    },
  });
};

describe('MetricsSummary', () => {
  it('renders 4 metric cards', () => {
    const store = createMockStore(
      { responseClass: null, status: 'idle', error: null },
      { simulationsByClass: {}, status: 'idle', error: null },
    );

    render(
      <Provider store={store}>
        <MetricsSummary reportsCount={0} />
      </Provider>,
    );

    expect(screen.getByText('Active Classes')).toBeInTheDocument();
    expect(screen.getByText('Total Students')).toBeInTheDocument();
    expect(screen.getByText('Total Simulations')).toBeInTheDocument();
    expect(screen.getByText('Unviewed New Reports')).toBeInTheDocument();
  });

  it('shows metric cards (without skeletons) when status is loading', () => {
    const store = createMockStore(
      { responseClass: null, status: 'loading', error: null },
      { simulationsByClass: {}, status: 'idle', error: null },
    );

    const { container } = render(
      <Provider store={store}>
        <MetricsSummary reportsCount={0} />
      </Provider>,
    );

    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(0);
    expect(screen.getByText('Active Classes')).toBeInTheDocument();
    expect(screen.getByText('Total Students')).toBeInTheDocument();
    expect(screen.getByText('Total Simulations')).toBeInTheDocument();
    expect(screen.getByText('Unviewed New Reports')).toBeInTheDocument();
  });

  it('displays correct counts when data is available', () => {
    const store = createMockStore(
      {
        responseClass: {
          data: {
            classes: [
              {
                id: '1',
                status: 'ACTIVE',
                start_date: '2000-01-01',
                end_date: '2099-12-31',
                students: [{}, {}],
                reports: 3,
              },
              {
                id: '2',
                status: 'ACTIVE',
                start_date: '2000-01-01',
                end_date: '2099-12-31',
                students: [{}],
                reports: 1,
              },
            ],
          },
        },
        status: 'succeeded',
        error: null,
      },
      {
        simulationsByClass: {
          '1': [{}, {}],
          '2': [{}],
        },
        status: 'succeeded',
        error: null,
      },
    );

    render(
      <Provider store={store}>
        <MetricsSummary reportsCount={4} />
      </Provider>,
    );

    expect(screen.getAllByText('2')[0]).toBeInTheDocument(); // 2 active classes
    expect(screen.getAllByText('3')[0]).toBeInTheDocument(); // 3 total students
    expect(screen.getByText('4')).toBeInTheDocument(); // 4 new reports (3+1)
  });

  it('displays 0 when no data is available', () => {
    const store = createMockStore(
      {
        responseClass: { data: { classes: [] }, status: 'succeeded', error: null },
        status: 'succeeded',
        error: null,
      },
      { simulationsByClass: {}, status: 'succeeded', error: null },
    );

    render(
      <Provider store={store}>
        <MetricsSummary reportsCount={0} />
      </Provider>,
    );

    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(3); // At least 3 metrics should show 0
  });

  it('filters only ACTIVE classes', () => {
    const store = createMockStore(
      {
        responseClass: {
          data: {
            classes: [
              {
                id: '1',
                status: 'ACTIVE',
                start_date: '2000-01-01',
                end_date: '2099-12-31',
                students: [{}],
                reports: 1,
              },
              {
                id: '2',
                status: 'INACTIVE',
                start_date: '2000-01-01',
                end_date: '2000-01-31',
                students: [{}],
                reports: 1,
              },
            ],
          },
        },
        status: 'succeeded',
        error: null,
      },
      { simulationsByClass: {}, status: 'succeeded', error: null },
    );

    render(
      <Provider store={store}>
        <MetricsSummary reportsCount={0} />
      </Provider>,
    );

    expect(screen.getAllByText('1')[0]).toBeInTheDocument(); // Only 1 active class
  });

  it('has correct aria-label for accessibility', () => {
    const store = createMockStore(
      { responseClass: null, status: 'idle', error: null },
      { simulationsByClass: {}, status: 'idle', error: null },
    );

    render(
      <Provider store={store}>
        <MetricsSummary reportsCount={0} />
      </Provider>,
    );

    expect(screen.getByRole('region', { name: 'Metrics Summary' })).toBeInTheDocument();
  });
});
