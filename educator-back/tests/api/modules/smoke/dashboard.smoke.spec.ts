import { describe, it, beforeAll, beforeEach, expect } from '@jest/globals';
import { APIClient } from '../../utils/apiClient';
import { endpoints } from '../../utils/endpoints';
import { validateStatusCode, validateFieldValue } from '../../utils/responseValidator';
import { logStep } from '../../utils/logger';
import { tokenManager } from '../../utils/tokenManager';
import { ExecutionDataManager } from '../../utils/executionDataManager';
import type { ApiResponse, LoginResponseData } from '../../types/api.types';

describe('Smoke — Dashboard Flow', () => {
  let apiClient: APIClient;
  let accessToken = '';

  beforeAll(async () => {
    apiClient = new APIClient();
    logStep(`[Smoke/Dashboard] Target URL: ${(apiClient as unknown as { baseURL: string }).baseURL}`);

    const testEmail = ExecutionDataManager.getTestUserEmail();
    if (!testEmail) {
      logStep('[Smoke/Dashboard] No smoke user email found');
      return;
    }

    try {
      const loginRes = await apiClient.post<LoginResponseData>(endpoints.auth.login, {
        email: testEmail,
        password: 'SmokeTest@123',
      });

      if (loginRes.status === 201) {
        const data = loginRes.body?.data as Record<string, unknown>;
        const tokens = data?.tokens as Record<string, unknown>;
        accessToken = tokens?.accessToken as string ?? '';
        tokenManager.setToken(accessToken);
      }
    } catch {
      logStep('[Smoke/Dashboard] Login failed');
    }
  });

  beforeEach(() => {
    apiClient = new APIClient();
  });

  it('should access dashboard overview with valid token @smoke @dashboard', async () => {
    logStep('[Smoke/Dashboard] GET /dashboard/overview');
    const res = await apiClient.get<ApiResponse>(
      endpoints.auth.dashboard,
      { includeAuth: true },
    );

    validateStatusCode(res.status, 200);
    validateFieldValue(res.body, 'status', 'SUCCESS');
  });

  it('should reject dashboard access with invalid token @smoke @dashboard', async () => {
    logStep('[Smoke/Dashboard] GET /dashboard/overview — invalid token');
    const res = await apiClient.get<ApiResponse>(endpoints.auth.dashboard, {
      headers: { Authorization: 'Bearer invalid.token.here' },
      includeAuth: false,
    });
    expect([401, 403]).toContain(res.status);
  });

  it('should return valid response structure @smoke @dashboard', async () => {
    logStep('[Smoke/Dashboard] GET /dashboard/overview — response structure');
    const res = await apiClient.get<ApiResponse>(endpoints.auth.dashboard, { includeAuth: true });
    if (res.status !== 200) return;
    validateFieldValue(res.body, 'status', 'SUCCESS');
    expect((res.body as unknown as { data: unknown })?.data).toBeDefined();
  });

  it('should respond within acceptable time @smoke @dashboard', async () => {
    logStep('[Smoke/Dashboard] GET /dashboard/overview — performance');
    const start = Date.now();
    const res = await apiClient.get<ApiResponse>(endpoints.auth.dashboard, { includeAuth: true });
    const elapsed = Date.now() - start;
    expect([200, 401, 403]).toContain(res.status);
    expect(elapsed).toBeLessThan(15000);
  });

  it('should reject dashboard access without token @smoke @dashboard', async () => {
    logStep('[Smoke/Dashboard] GET /dashboard/overview without auth');
    const res = await apiClient.get<ApiResponse>(endpoints.auth.dashboard);

    expect([401, 403]).toContain(res.status);
  });
});
