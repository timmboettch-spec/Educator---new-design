import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
vi.mock('../../../src/redux/api', () => ({
  default: { get: (...args: unknown[]) => apiGet(...args) },
}));

import { useClassLmsLinkage } from '../../../src/hooks/useClassLmsLinkage';

describe('useClassLmsLinkage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests the class-scoped linkage endpoint and keys assignments by simulation', async () => {
    apiGet.mockResolvedValue({
      data: {
        data: {
          provider: 'canvas',
          course: { id: '12345', name: null, url: null },
          assignments: [
            { simulationId: 'sim-1', label: 'Chest Pain Scenario', url: null },
            { simulationId: 'sim-2', label: null, url: null },
          ],
        },
      },
    });

    const { result } = renderHook(() => useClassLmsLinkage('class-1'));

    await waitFor(() => expect(result.current.provider).toBe('canvas'));
    expect(apiGet).toHaveBeenCalledWith(
      expect.stringContaining('/class-1/lms-linkage')
    );
    expect(result.current.assignmentBySimulationId.get('sim-1')).toMatchObject({
      label: 'Chest Pain Scenario',
    });
    expect(result.current.assignmentBySimulationId.get('sim-2')).toMatchObject({
      label: null,
    });
  });

  it('keeps a mapping whose LMS line item has no label', async () => {
    apiGet.mockResolvedValue({
      data: {
        data: {
          provider: 'moodle',
          course: { id: '12345', name: null, url: null },
          assignments: [{ simulationId: 'sim-1', label: null, url: null }],
        },
      },
    });

    const { result } = renderHook(() => useClassLmsLinkage('class-1'));

    await waitFor(() => expect(result.current.provider).toBe('moodle'));
    expect(result.current.assignmentBySimulationId.has('sim-1')).toBe(true);
  });

  it('reports the class as unlinked when the request fails', async () => {
    apiGet.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useClassLmsLinkage('class-1'));

    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(result.current.provider).toBeNull();
    expect(result.current.course).toBeNull();
    expect(result.current.assignmentBySimulationId.size).toBe(0);
  });

  it('skips the request when there is no class id', () => {
    renderHook(() => useClassLmsLinkage(''));

    expect(apiGet).not.toHaveBeenCalled();
  });

  it('skips the request for a class the listing already reported as unlinked', () => {
    const { result } = renderHook(() => useClassLmsLinkage('class-1', false));

    expect(apiGet).not.toHaveBeenCalled();
    expect(result.current.provider).toBeNull();
    expect(result.current.assignmentBySimulationId.size).toBe(0);
  });
});
