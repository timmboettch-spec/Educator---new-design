import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  request: vi.fn(),
}));

vi.mock('../../../src/redux/api', () => ({ default: apiMock }));

import { classSimulationsApi } from '../../../src/redux/api/classSimulations/classSimulationsApi';
import { addSimulationRequest } from '../../../src/redux/dashboard/simulationlibrary/addsimulationredux';
import { DeleteSimulationRequest } from '../../../src/redux/class/DeleteSimulationRedux';

const invalidateAction = classSimulationsApi.util.invalidateTags([
  'ClassSimulations',
]);

/** Runs a thunk and returns every action it dispatched. */
const run = async (thunk: (...args: never[]) => unknown) => {
  const dispatch = vi.fn();
  await (thunk as (d: unknown, g: unknown, e: unknown) => Promise<unknown>)(
    dispatch,
    () => ({}),
    undefined
  );
  return dispatch.mock.calls.map(([action]) => action);
};

describe('class simulation mutations refresh the assignments table', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('after adding an assignment', async () => {
    apiMock.post.mockResolvedValue({ data: { message: 'ok' } });
    const actions = await run(
      addSimulationRequest({
        class_id: 'class-1',
        simulation_id: 'sim-1',
        start_date: '01-01-2026',
        due_date: '01-15-2026',
        end_date: '01-31-2026',
        reduceToken: 0,
      })
    );
    expect(actions).toContainEqual(invalidateAction);
  });

  it('after deleting an assignment', async () => {
    apiMock.delete.mockResolvedValue({ data: { message: 'ok' } });
    const actions = await run(DeleteSimulationRequest({ simId: 'cs-1' }));
    expect(actions).toContainEqual(invalidateAction);
  });

  it('not when the request fails', async () => {
    apiMock.delete.mockRejectedValue({
      response: { status: 400, data: { message: 'Not allowed' } },
    });
    const actions = await run(DeleteSimulationRequest({ simId: 'cs-1' }));
    expect(actions).not.toContainEqual(invalidateAction);
  });
});
