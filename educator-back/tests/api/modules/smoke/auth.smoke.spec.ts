import { describe, it, beforeAll, beforeEach, expect } from '@jest/globals';
import { APIClient } from '../../utils/apiClient';
import { endpoints } from '../../utils/endpoints';
import { validateStatusCode, validateFieldValue } from '../../utils/responseValidator';
import { logStep } from '../../utils/logger';
import type { ApiResponse } from '../../types/api.types';
import { ExecutionDataManager } from '../../utils/executionDataManager';

describe('Smoke — Auth Flow', () => {
  let apiClient: APIClient;
  let smokeEmail: string;
  const smokePassword = 'SmokeTest@123';

  beforeAll(async () => {
    smokeEmail = `smoke-${Date.now()}@smoketest.invalid`;
    apiClient = new APIClient();
    logStep(`[Smoke/Auth] Target URL: ${(apiClient as unknown as { baseURL: string }).baseURL}`);
    logStep(`[Smoke/Auth] Using smoke user: ${smokeEmail}`);

    // Signup once before all auth tests
    try {
      const res = await apiClient.post<ApiResponse>(endpoints.auth.signup, {
        full_name: 'Smoke Test User',
        email: smokeEmail,
        password: smokePassword,
      });
      logStep(`[Smoke/Auth] Signup status: ${res.status}`);
      if (res.status === 201) {
        ExecutionDataManager.setTestUserEmail(smokeEmail);
      }
    } catch {
      logStep('[Smoke/Auth] Signup call completed (may have succeeded server-side)');
    }
  });

  beforeEach(() => {
    apiClient = new APIClient();
  });

  it('should login with valid credentials @smoke @auth', async () => {
    logStep('[Smoke/Auth] Login with valid credentials');
    const res = await apiClient.post<ApiResponse>(endpoints.auth.login, {
      email: smokeEmail,
      password: smokePassword,
    });

    validateStatusCode(res.status, 201);
    validateFieldValue(res.body, 'status', 'SUCCESS');

    const data = ((res.body as unknown) as Record<string, unknown>)?.data as Record<string, unknown>;
    expect(data).toBeDefined();
    expect(data?.tokens).toBeDefined();

    const tokens = data?.tokens as Record<string, unknown>;
    expect(typeof tokens?.accessToken).toBe('string');
    const _accessToken = tokens.accessToken as string;
    expect(typeof _accessToken).toBe('string');
  });

  it('should reject login with invalid password @smoke @auth', async () => {
    logStep('[Smoke/Auth] Login with wrong password');
    const res = await apiClient.post<ApiResponse>(endpoints.auth.login, {
      email: smokeEmail,
      password: 'WrongPassword@999',
    });

    validateStatusCode(res.status, 401);
    validateFieldValue(res.body, 'status', 'FAILED');
  });

  it('should reject login with missing email @smoke @auth', async () => {
    logStep('[Smoke/Auth] Login with empty email');
    const res = await apiClient.post<ApiResponse>(endpoints.auth.login, {
      email: '',
      password: smokePassword,
    });

    validateStatusCode(res.status, 400);
    validateFieldValue(res.body, 'status', 'FAILED');
  });

  it('should reject login with missing password @smoke @auth', async () => {
    logStep('[Smoke/Auth] Login with empty password');
    const res = await apiClient.post<ApiResponse>(endpoints.auth.login, {
      email: smokeEmail,
      password: '',
    });

    validateStatusCode(res.status, 400);
    validateFieldValue(res.body, 'status', 'FAILED');
  });

  it('should reject login with invalid email format @smoke @auth', async () => {
    logStep('[Smoke/Auth] Login with invalid email format');
    const res = await apiClient.post<ApiResponse>(endpoints.auth.login, {
      email: 'not-an-email',
      password: smokePassword,
    });
    expect([400, 401]).toContain(res.status);
    validateFieldValue(res.body, 'status', 'FAILED');
  });

  it('should reject login with non-existent email @smoke @auth', async () => {
    logStep('[Smoke/Auth] Login with unknown email');
    const res = await apiClient.post<ApiResponse>(endpoints.auth.login, {
      email: 'ghost-user-never-exists@nomail.invalid',
      password: smokePassword,
    });
    expect([401, 404]).toContain(res.status);
    validateFieldValue(res.body, 'status', 'FAILED');
  });

  it('should initiate forgot-password flow @smoke @auth', async () => {
    logStep('[Smoke/Auth] POST /auth/forgot-password');
    const res = await apiClient.post<ApiResponse>(endpoints.auth.forgotPassword, {
      email: smokeEmail,
    });
    expect([200, 201]).toContain(res.status);
  });

  it('should reject forgot-password with missing email @smoke @auth', async () => {
    logStep('[Smoke/Auth] POST /auth/forgot-password — empty email');
    const res = await apiClient.post<ApiResponse>(endpoints.auth.forgotPassword, {
      email: '',
    });
    expect([400, 422]).toContain(res.status);
  });

  it('should reject logout without token @smoke @auth', async () => {
    logStep('[Smoke/Auth] POST /auth/logout without token');
    const res = await apiClient.post<ApiResponse>(endpoints.auth.logout, {});
    expect([401, 403]).toContain(res.status);
  });

  it('should reject signup with duplicate email @smoke @auth', async () => {
    logStep('[Smoke/Auth] POST /auth/signup — duplicate email');
    const res = await apiClient.post<ApiResponse>(endpoints.auth.signup, {
      full_name: 'Duplicate User',
      email: smokeEmail,
      password: smokePassword,
    });
    expect([400, 409, 422]).toContain(res.status);
  });

  it('should reject signup with invalid email format @smoke @auth', async () => {
    logStep('[Smoke/Auth] POST /auth/signup — invalid email format');
    const res = await apiClient.post<ApiResponse>(endpoints.auth.signup, {
      full_name: 'Bad Email User',
      email: 'not-an-email',
      password: smokePassword,
    });
    expect([400, 422]).toContain(res.status);
  });

  it('should reject signup with weak password @smoke @auth', async () => {
    logStep('[Smoke/Auth] POST /auth/signup — weak password');
    const res = await apiClient.post<ApiResponse>(endpoints.auth.signup, {
      full_name: 'Weak Pass User',
      email: `weak-${Date.now()}@smoketest.invalid`,
      password: '123',
    });
    expect([400, 422]).toContain(res.status);
  });
});
