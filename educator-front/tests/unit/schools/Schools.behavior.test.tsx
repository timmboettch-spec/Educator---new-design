import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import postStudentReducer, {
  PostStudentRequest,
  clearPostStudentState,
  selectPostStudentLoading,
  selectPostStudentSuccess,
  selectPostStudentError,
  selectPostStudentResponse,
} from '../../../src/redux/class/Student/PostStudentRedux';

import config from '../../../src/redux/config';

const { apiPostMock } = vi.hoisted(() => ({ apiPostMock: vi.fn() }));
vi.mock('../../../src/redux/api', () => ({
  default: {
    post: apiPostMock,
  },
}));
vi.mock('../../../src/utils/storage', () => ({
  getToken: vi.fn(() => 'test-token'),
  clearAuthData: vi.fn(),
}));

import { getToken } from '../../../src/utils/storage';
const mockedGetToken = vi.mocked(getToken);

type PostStudentState = ReturnType<typeof postStudentReducer>;

const buildStore = (preloaded?: Partial<PostStudentState>) =>
  configureStore({
    reducer: {
      PostStudent: postStudentReducer,
    },
    preloadedState: preloaded
      ? {
          PostStudent: preloaded as PostStudentState,
        }
      : undefined,
  });

const validPayload = {
  class_id: 'cls-1',
  student_name: 'Alice Johnson',
  email: 'alice@example.com',
};

const mockResponse = {
  status: 'success',
  message: 'Student created',
  data: {
    id: 'stu-1',
    student_id: 'CODE001',
    student_name: 'Alice Johnson',
    email: 'alice@example.com',
    class_id: 'cls-1',
    status: 'ACTIVE',
  },
};

describe('PostStudentRedux – reducer', () => {
  it('returns initial state', () => {
    const store = buildStore();
    const state = store.getState().PostStudent;
    expect(state.status).toBe('idle');
    expect(state.response).toBeNull();
    expect(state.error).toBeNull();
  });

  it('sets status to loading on pending', () => {
    const store = buildStore();
    store.dispatch({ type: PostStudentRequest.pending.type });
    const state = store.getState().PostStudent;
    expect(state.status).toBe('loading');
    expect(state.error).toBeNull();
  });

  it('sets status to succeeded and stores response on fulfilled', () => {
    const store = buildStore();
    store.dispatch({
      type: PostStudentRequest.fulfilled.type,
      payload: mockResponse,
    });
    const state = store.getState().PostStudent;
    expect(state.status).toBe('succeeded');
    expect(state.response).toEqual(mockResponse);
  });

  it('sets status to failed and stores error on rejected', () => {
    const store = buildStore();
    store.dispatch({
      type: PostStudentRequest.rejected.type,
      payload: { message: 'Failed to add student' },
    });
    const state = store.getState().PostStudent;
    expect(state.status).toBe('failed');
    expect(state.error).toBe('Failed to add student');
  });

  it('uses fallback error message when payload is undefined', () => {
    const store = buildStore();
    store.dispatch({
      type: PostStudentRequest.rejected.type,
      payload: undefined,
    });
    expect(store.getState().PostStudent.error).toBe('Failed to add student');
  });

  it('clearPostStudentState resets to initial state', () => {
    const store = buildStore({
      status: 'succeeded',
      response: mockResponse,
      error: null,
    });
    store.dispatch(clearPostStudentState());
    const state = store.getState().PostStudent;
    expect(state.status).toBe('idle');
    expect(state.response).toBeNull();
    expect(state.error).toBeNull();
  });
});

describe('PostStudentRedux – thunk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetToken.mockReturnValue('test-token');
  });

  it('dispatches fulfilled on successful API call', async () => {
    apiPostMock.mockResolvedValue({ data: mockResponse });
    const store = buildStore();

    await store.dispatch(
      PostStudentRequest(validPayload) as ReturnType<typeof PostStudentRequest>
    );

    const state = store.getState().PostStudent;
    expect(state.status).toBe('succeeded');
    expect(state.response).toEqual(mockResponse);
  });

  it('calls POST with correct URL and payload', async () => {
    apiPostMock.mockResolvedValue({ data: mockResponse });
    const store = buildStore();

    await store.dispatch(
      PostStudentRequest(validPayload) as ReturnType<typeof PostStudentRequest>
    );

    expect(apiPostMock).toHaveBeenCalledTimes(1);
    expect(apiPostMock).toHaveBeenCalledWith(config.StudentAPI, validPayload);
  });

  it('dispatches rejected on API failure', async () => {
    apiPostMock.mockRejectedValue({
      response: { data: { message: 'Student already exists' } },
    });
    const store = buildStore();

    await store.dispatch(
      PostStudentRequest(validPayload) as ReturnType<typeof PostStudentRequest>
    );

    const state = store.getState().PostStudent;
    expect(state.status).toBe('failed');
    expect(state.error).toBe('Student already exists');
  });

  it('uses fallback error message on generic failure', async () => {
    apiPostMock.mockRejectedValue(new Error('Network error'));
    const store = buildStore();

    await store.dispatch(
      PostStudentRequest(validPayload) as ReturnType<typeof PostStudentRequest>
    );

    expect(store.getState().PostStudent.error).toBe('Failed to add student');
  });

  it('rejects with Unauthorized when API returns unauthorized', async () => {
    mockedGetToken.mockReturnValue(null);
    apiPostMock.mockRejectedValue({
      response: { data: { message: 'Unauthorized' } },
    });
    const store = buildStore();

    await store.dispatch(
      PostStudentRequest(validPayload) as ReturnType<typeof PostStudentRequest>
    );

    const state = store.getState().PostStudent;
    expect(state.status).toBe('failed');
    expect(state.error).toContain('Unauthorized');
  });

  it('works without optional email field', async () => {
    apiPostMock.mockResolvedValue({ data: mockResponse });
    const store = buildStore();

    await store.dispatch(
      PostStudentRequest({
        class_id: 'cls-1',
        student_name: 'Bob',
      }) as ReturnType<typeof PostStudentRequest>
    );

    expect(store.getState().PostStudent.status).toBe('succeeded');
  });
});

describe('PostStudentRedux – selectors', () => {
  const createMockState = (postStudentState: PostStudentState) =>
    ({ PostStudent: postStudentState }) as Parameters<
      typeof selectPostStudentLoading
    >[0];

  it('selectPostStudentLoading returns true when loading', () => {
    expect(
      selectPostStudentLoading(
        createMockState({ status: 'loading', response: null, error: null })
      )
    ).toBe(true);
  });

  it('selectPostStudentLoading returns false when not loading', () => {
    expect(
      selectPostStudentLoading(
        createMockState({ status: 'idle', response: null, error: null })
      )
    ).toBe(false);
  });

  it('selectPostStudentSuccess returns true when succeeded', () => {
    expect(
      selectPostStudentSuccess(
        createMockState({
          status: 'succeeded',
          response: mockResponse,
          error: null,
        })
      )
    ).toBe(true);
  });

  it('selectPostStudentSuccess returns false when not succeeded', () => {
    expect(
      selectPostStudentSuccess(
        createMockState({ status: 'failed', response: null, error: 'err' })
      )
    ).toBe(false);
  });

  it('selectPostStudentError returns error string', () => {
    expect(
      selectPostStudentError(
        createMockState({ status: 'failed', response: null, error: 'oops' })
      )
    ).toBe('oops');
  });

  it('selectPostStudentError returns null when no error', () => {
    expect(
      selectPostStudentError(
        createMockState({ status: 'idle', response: null, error: null })
      )
    ).toBeNull();
  });

  it('selectPostStudentResponse returns response data', () => {
    expect(
      selectPostStudentResponse(
        createMockState({
          status: 'succeeded',
          response: mockResponse,
          error: null,
        })
      )
    ).toEqual(mockResponse);
  });

  it('selectPostStudentResponse returns null initially', () => {
    expect(
      selectPostStudentResponse(
        createMockState({ status: 'idle', response: null, error: null })
      )
    ).toBeNull();
  });
});
