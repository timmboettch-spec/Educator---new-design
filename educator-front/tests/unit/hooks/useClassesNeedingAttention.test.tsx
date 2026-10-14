import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';

const apiRequest = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    request: (...args: unknown[]) => apiRequest(...args),
  },
}));

import { classesApi } from '../../../src/redux/api/classes/classesApi';
import { useClassesNeedingAttention } from '../../../src/hooks/useClassesNeedingAttention';

const renderWithFreshStore = () => {
  const store = configureStore({
    reducer: { [classesApi.reducerPath]: classesApi.reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(classesApi.middleware),
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return renderHook(() => useClassesNeedingAttention(), { wrapper });
};

describe('useClassesNeedingAttention', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('is loading until the summary resolves', () => {
    apiRequest.mockReturnValue(new Promise(() => {}));
    const { result } = renderWithFreshStore();
    expect(result.current.status).toBe('loading');
  });

  it('makes a single attention-summary request and uses the distinct count, not the bucket sum', async () => {
    apiRequest.mockResolvedValue({
      data: {
        message: 'ok',
        data: {
          totalClasses: 555,
          classesNeedingAttention: 3,
          unreadReports: 2,
          noStudents: 1,
          noAssignedSims: 1,
        },
      },
    });
    const { result } = renderWithFreshStore();
    await waitFor(() => expect(result.current.status).toBe('succeeded'));

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/classes/user/attention-summary' })
    );
    expect(result.current).toEqual({
      status: 'succeeded',
      totalActive: 555,
      needingCount: 3,
      unreadCount: 2,
      noStudentsCount: 1,
      noSimsCount: 1,
    });
  });

  it('reports failed when the request errors', async () => {
    apiRequest.mockRejectedValue({ response: { status: 403, data: 'nope' } });
    const { result } = renderWithFreshStore();
    await waitFor(() => expect(result.current.status).toBe('failed'));
  });
});
