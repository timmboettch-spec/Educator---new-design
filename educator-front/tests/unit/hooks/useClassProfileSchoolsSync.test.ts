import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/redux/api', () => ({
  default: { get: vi.fn() },
}));
vi.mock('../../../src/utils/storage', () => ({
  updateStoredUser: vi.fn(),
}));

import api from '../../../src/redux/api';
import config from '../../../src/redux/config';
import { updateStoredUser } from '../../../src/utils/storage';
import { useClassProfileSchoolsSync } from '../../../src/hooks/useClassProfileSchoolsSync';

const schools = [{ id: 's-1', school_name: 'Hillcrest' }];
const mockGet = vi.mocked(api.get);

describe('useClassProfileSchoolsSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches the educator profile once on mount', () => {
    mockGet.mockResolvedValue({ data: { data: { schools } } });
    const { rerender } = renderHook(() => useClassProfileSchoolsSync());
    rerender();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith(
      `${config.GetEducatorAPI}/profile`,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it.each([
    ['the data envelope', { data: { schools } }],
    ['the top level', { schools }],
  ])('stores the schools read from %s', async (_case, data) => {
    mockGet.mockResolvedValue({ data });
    renderHook(() => useClassProfileSchoolsSync());

    await waitFor(() =>
      expect(updateStoredUser).toHaveBeenCalledWith({ schools })
    );
  });

  it('leaves the stored user alone when the profile has no schools list', async () => {
    mockGet.mockResolvedValue({ data: { data: {} } });
    renderHook(() => useClassProfileSchoolsSync());

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    await Promise.resolve();
    expect(updateStoredUser).not.toHaveBeenCalled();
  });

  it('ignores a failed request', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    renderHook(() => useClassProfileSchoolsSync());

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(updateStoredUser).not.toHaveBeenCalled();
  });

  it('aborts the request on unmount', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    const { unmount } = renderHook(() => useClassProfileSchoolsSync());
    const { signal } = mockGet.mock.calls[0]?.[1] as { signal: AbortSignal };

    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
