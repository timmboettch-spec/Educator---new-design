import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  useClassDeepLinkExpansion,
  type UseClassDeepLinkExpansionParams,
} from '../../../src/hooks/useClassDeepLinkExpansion';

const clickEvent = () =>
  ({ stopPropagation: vi.fn() }) as unknown as React.MouseEvent;

const renderExpansion = (
  state: Record<string, unknown> | null = null,
  params: Partial<UseClassDeepLinkExpansionParams> = {}
) => {
  const setSearchTerm = vi.fn();
  const resetFilters = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[{ pathname: '/classes', state }]}>
      {children}
    </MemoryRouter>
  );
  const hook = renderHook(
    (props: Partial<UseClassDeepLinkExpansionParams>) => ({
      ...useClassDeepLinkExpansion({
        allClassesLength: 1,
        setSearchTerm,
        resetFilters,
        ...params,
        ...props,
      }),
      location: useLocation(),
    }),
    { wrapper, initialProps: {} }
  );
  return { setSearchTerm, resetFilters, ...hook };
};

describe('useClassDeepLinkExpansion', () => {
  it('starts with nothing expanded and no deep-link target', () => {
    const { result } = renderExpansion();
    expect(result.current).toMatchObject({
      expandedId: null,
      expandedType: null,
      targetClassId: null,
      targetSimulationId: null,
    });
  });

  it('toggles a sub-table open and closed without bubbling the click', () => {
    const { result } = renderExpansion();
    const event = clickEvent();

    act(() => result.current.toggleExpand('c-1', 'students', event));
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(result.current.expandedId).toBe('c-1');
    expect(result.current.expandedType).toBe('students');

    act(() => result.current.toggleExpand('c-1', 'students', clickEvent()));
    expect(result.current.expandedId).toBeNull();
    expect(result.current.expandedType).toBeNull();
  });

  it('switches to another sub-table of the same class', () => {
    const { result } = renderExpansion();
    act(() => result.current.toggleExpand('c-1', 'students', clickEvent()));
    act(() => result.current.toggleExpand('c-1', 'sims', clickEvent()));
    expect(result.current.expandedId).toBe('c-1');
    expect(result.current.expandedType).toBe('sims');
  });

  it('expands the linked class and clears search and filters (e.g. from a notification)', () => {
    const { result, setSearchTerm, resetFilters } = renderExpansion({
      classId: 'c-9',
      expandType: 'reports',
      simulationId: 'sim-1',
    });
    expect(result.current).toMatchObject({
      expandedId: 'c-9',
      expandedType: 'reports',
      targetClassId: 'c-9',
      targetSimulationId: 'sim-1',
    });
    expect(setSearchTerm).toHaveBeenCalledWith('');
    expect(resetFilters).toHaveBeenCalledTimes(1);
  });

  it('waits for the class list before expanding the linked class', () => {
    const { result, rerender, resetFilters } = renderExpansion(
      { classId: 'c-9', expandType: 'students' },
      { allClassesLength: 0 }
    );
    expect(result.current.expandedId).toBeNull();
    expect(resetFilters).not.toHaveBeenCalled();

    rerender({ allClassesLength: 3 });
    expect(result.current.expandedId).toBe('c-9');
    expect(resetFilters).toHaveBeenCalledTimes(1);
  });

  it('applies a deep link only once, so later rerenders keep the user’s choice', () => {
    const { result, rerender, resetFilters } = renderExpansion({
      classId: 'c-9',
      expandType: 'students',
    });
    act(() => result.current.toggleExpand('c-9', 'students', clickEvent()));

    rerender({ allClassesLength: 2 });
    expect(result.current.expandedId).toBeNull();
    expect(resetFilters).toHaveBeenCalledTimes(1);
  });

  it('keeps the one-shot flags for the class table after clearing them from the router state', () => {
    const { result } = renderExpansion({
      classId: 'c-9',
      openReportsModal: true,
      openStudentReports: true,
      studentId: 'st-1',
      openSimReports: true,
      simId: 'sim-1',
    });

    // The router state no longer carries them (a refresh won't reopen modals)…
    expect(result.current.location.state).toMatchObject({
      openReportsModal: undefined,
      openStudentReports: undefined,
      openSimReports: undefined,
    });
    // …but the table, which mounts once its data loads, still gets them.
    expect(result.current.locationState).toMatchObject({
      classId: 'c-9',
      openReportsModal: true,
      openStudentReports: true,
      studentId: 'st-1',
      openSimReports: true,
      simId: 'sim-1',
    });
  });

  it('drops the kept flags once the user expands or collapses a row', () => {
    const { result } = renderExpansion({
      classId: 'c-9',
      openReportsModal: true,
      openStudentReports: true,
      studentId: 'st-1',
    });

    act(() => result.current.toggleExpand('c-1', 'students', clickEvent()));

    expect(result.current.locationState).toMatchObject({
      classId: 'c-9',
      studentId: 'st-1',
      openReportsModal: undefined,
      openStudentReports: undefined,
      openSimReports: undefined,
    });
  });

  it('clears one-shot "open modal" flags from the location state on mount', () => {
    const { result } = renderExpansion({
      classId: 'c-9',
      openReportsModal: true,
      openStudentReports: true,
      openSimReports: true,
    });
    expect(result.current.location.state).toEqual({
      classId: 'c-9',
      openReportsModal: undefined,
      openStudentReports: undefined,
      openSimReports: undefined,
    });
  });

  describe('?reportsClass= (shared or reloaded Reports table URL)', () => {
    const renderAtUrl = (
      search: string,
      state: Record<string, unknown> | null = null
    ) =>
      renderHook(
        () =>
          useClassDeepLinkExpansion({
            allClassesLength: 1,
            setSearchTerm: vi.fn(),
            resetFilters: vi.fn(),
          }),
        {
          wrapper: ({ children }: { children: ReactNode }) => (
            <MemoryRouter
              initialEntries={[{ pathname: '/classes', search, state }]}
            >
              {children}
            </MemoryRouter>
          ),
        }
      );

    it('targets that class so its school opens, and re-opens its Reports table', () => {
      const { result } = renderAtUrl('?reportsClass=c-7&reportStatus=unread');
      expect(result.current).toMatchObject({
        targetClassId: 'c-7',
        expandedId: 'c-7',
        expandedType: 'reports',
      });
    });

    it('lets a navigation target in location.state take priority', () => {
      const { result } = renderAtUrl('?reportsClass=c-7', {
        classId: 'c-9',
        expandType: 'students',
      });
      expect(result.current.targetClassId).toBe('c-9');
    });
  });
});
