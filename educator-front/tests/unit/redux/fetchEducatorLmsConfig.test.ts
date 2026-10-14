import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

const apiGet = vi.fn();

vi.mock('../../../src/redux/api', () => ({
  default: {
    get: (...args: unknown[]) => apiGet(...args),
    post: vi.fn(),
  },
}));

vi.mock('../../../src/redux/config', () => ({
  default: {
    LmsConfigureAPI: 'http://localhost:3000/api/lms/schools',
    LmsEducatorConfigAPI: 'http://localhost:3000/api/lms/educator/config',
  },
}));

import lmsReducer, {
  fetchEducatorLmsConfig,
} from '../../../src/redux/lms/LmsRedux';

describe('fetchEducatorLmsConfig', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiGet.mockResolvedValue({
      data: {
        data: {
          schoolId: 'school-1',
          lmsType: 'canvas',
          issuer: 'https://canvas.instructure.com',
          clientId: 'client-1',
          authEndpoint: 'https://sso.canvaslms.com/api/lti/authorize_redirect',
          tokenEndpoint: 'https://sso.canvaslms.com/login/oauth2/token',
          jwksUrl: 'https://sso.canvaslms.com/api/lti/security/jwks',
        },
      },
    });
  });

  it('requests educator config with ?toolType=educator by default', async () => {
    const store = configureStore({ reducer: { lms: lmsReducer } });
    await store.dispatch(fetchEducatorLmsConfig({ schoolId: 'school-1' }));

    expect(apiGet).toHaveBeenCalledWith(
      'http://localhost:3000/api/lms/schools/school-1/config?toolType=educator'
    );
  });

  it('requests student config with ?toolType=student', async () => {
    const store = configureStore({ reducer: { lms: lmsReducer } });
    await store.dispatch(
      fetchEducatorLmsConfig({ schoolId: 'school-1', toolType: 'student' })
    );

    expect(apiGet).toHaveBeenCalledWith(
      'http://localhost:3000/api/lms/schools/school-1/config?toolType=student'
    );
  });

  it('uses educator self config endpoint with toolType when schoolId omitted', async () => {
    const store = configureStore({ reducer: { lms: lmsReducer } });
    await store.dispatch(fetchEducatorLmsConfig({ toolType: 'educator' }));

    expect(apiGet).toHaveBeenCalledWith(
      'http://localhost:3000/api/lms/educator/config?toolType=educator'
    );
  });
});
