import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();
vi.mock('../../../src/redux/api', () => ({
  default: {
    request: (...args: unknown[]) => apiRequest(...args),
  },
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('../../../src/components/common/Toast', () => ({ toast }));

import '../../../src/i18n';
import { store } from '../../../src/store';
import { useInlineSimDateEdit } from '../../../src/hooks/useInlineSimDateEdit';
import type { SimulationItem } from '../../../src/types';

const wrapper = ({ children }: { children: ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

const sim = {
  id: 'cs-1',
  simulation_title: 'Cardiac Care',
  start_date: '2026-02-01',
  due_date: '2026-02-15',
  end_date: '2026-02-28',
} as SimulationItem;

const renderEdit = () => {
  const hook = renderHook(() => useInlineSimDateEdit(), { wrapper });
  act(() => hook.result.current.startEdit('cs-1', 'due_date'));
  return hook;
};

describe('useInlineSimDateEdit', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    toast.success.mockReset();
  });

  it('opens one date at a time', () => {
    const { result } = renderEdit();
    expect(result.current.editing).toEqual({
      simId: 'cs-1',
      field: 'due_date',
    });

    act(() => result.current.startEdit('cs-2', 'start_date'));
    expect(result.current.editing).toEqual({
      simId: 'cs-2',
      field: 'start_date',
    });
  });

  it('saves only the changed date, closes and confirms', async () => {
    apiRequest.mockResolvedValue({
      data: {
        message: 'Class simulation updated successfully',
        data: { id: 'cs-1', classId: 'class-1', simulationId: 'sim-1' },
      },
    });
    const { result } = renderEdit();

    await act(() => result.current.saveDate(sim, 'end_date', '2026-02-20'));

    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/class-simulations/cs-1',
        method: 'PUT',
        data: { endDate: '2026-02-20' },
      })
    );
    expect(result.current.editing).toBeNull();
    expect(result.current.error).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Date updated');
  });

  it('keeps the edit open with the message when validation fails', async () => {
    const { result } = renderEdit();

    await act(() => result.current.saveDate(sim, 'due_date', '2026-03-01'));

    expect(apiRequest).not.toHaveBeenCalled();
    expect(result.current.editing).not.toBeNull();
    expect(result.current.error).toBe(
      'Must be on or before the close date (02-28-2026).'
    );
  });

  it('closes without a request when the date is unchanged', async () => {
    const { result } = renderEdit();

    await act(() => result.current.saveDate(sim, 'due_date', '2026-02-15'));

    expect(apiRequest).not.toHaveBeenCalled();
    expect(result.current.editing).toBeNull();
  });

  it("shows the backend's message when the save is refused", async () => {
    apiRequest.mockRejectedValue({
      response: { status: 400, data: { message: 'Class is archived' } },
    });
    const { result } = renderEdit();

    await act(() => result.current.saveDate(sim, 'due_date', '2026-02-10'));

    expect(result.current.editing).not.toBeNull();
    expect(result.current.error).toBe('Class is archived');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('falls back to a friendly message when the save fails without one', async () => {
    apiRequest.mockRejectedValue(new Error('Network Error'));
    const { result } = renderEdit();

    await act(() => result.current.saveDate(sim, 'due_date', '2026-02-10'));

    expect(result.current.error).toBe(
      "Couldn't update the date. Please try again."
    );
  });

  it('cancels and clears the error', async () => {
    const { result } = renderEdit();
    await act(() => result.current.saveDate(sim, 'due_date', ''));
    expect(result.current.error).toBe('Enter a date.');

    act(() => result.current.cancelEdit());

    expect(result.current.editing).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("doesn't open another date while a save is in flight", async () => {
    apiRequest.mockReturnValue(new Promise(() => {}));
    const { result } = renderEdit();

    act(() => {
      void result.current.saveDate(sim, 'due_date', '2026-02-10');
    });
    await waitFor(() => expect(result.current.isSaving).toBe(true));

    act(() => result.current.startEdit('cs-2', 'start_date'));

    expect(result.current.editing).toEqual({
      simId: 'cs-1',
      field: 'due_date',
    });
  });

  describe('onSaved', () => {
    const renderWithOnSaved = (onSaved: () => void) => {
      const hook = renderHook(() => useInlineSimDateEdit({ onSaved }), {
        wrapper,
      });
      act(() => hook.result.current.startEdit('cs-1', 'due_date'));
      return hook;
    };

    it('runs after a successful save', async () => {
      apiRequest.mockResolvedValue({
        data: {
          message: 'ok',
          data: { id: 'cs-1', classId: 'class-1', simulationId: 'sim-1' },
        },
      });
      const onSaved = vi.fn();
      const { result } = renderWithOnSaved(onSaved);

      await act(() => result.current.saveDate(sim, 'due_date', '2026-02-10'));

      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it("doesn't run when validation fails or the save is refused", async () => {
      apiRequest.mockRejectedValue({
        response: { status: 400, data: { message: 'Class is archived' } },
      });
      const onSaved = vi.fn();
      const { result } = renderWithOnSaved(onSaved);

      await act(() => result.current.saveDate(sim, 'due_date', '2026-03-01'));
      await act(() => result.current.saveDate(sim, 'due_date', '2026-02-10'));

      expect(result.current.error).toBe('Class is archived');
      expect(onSaved).not.toHaveBeenCalled();
    });
  });
});
