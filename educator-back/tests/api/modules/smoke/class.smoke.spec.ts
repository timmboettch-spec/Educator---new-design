import { describe, it, beforeAll, beforeEach, expect } from '@jest/globals';
import { APIClient } from '../../utils/apiClient';
import { endpoints } from '../../utils/endpoints';
import { validateFieldValue } from '../../utils/responseValidator';
import { logStep } from '../../utils/logger';
import { tokenManager } from '../../utils/tokenManager';
import { ExecutionDataManager } from '../../utils/executionDataManager';
import type { ApiResponse, LoginResponseData } from '../../types/api.types';

describe('Smoke — Class Flow', () => {
  let apiClient: APIClient;

  beforeAll(async () => {
    apiClient = new APIClient();
    logStep(`[Smoke/Class] Target URL: ${(apiClient as unknown as { baseURL: string }).baseURL}`);

    const testEmail = ExecutionDataManager.getTestUserEmail();
    if (!testEmail) return;

    try {
      const loginRes = await apiClient.post<LoginResponseData>(endpoints.auth.login, {
        email: testEmail,
        password: 'SmokeTest@123',
      });

      if (loginRes.status === 201) {
        const data = loginRes.body?.data as Record<string, unknown>;
        const tokens = data?.tokens as Record<string, unknown>;
        tokenManager.setToken(tokens?.accessToken as string ?? '');
      }
    } catch {
      logStep('[Smoke/Class] Login failed');
    }
  });

  beforeEach(() => {
    apiClient = new APIClient();
  });

  it('should list classes with valid token @smoke @class', async () => {
    logStep('[Smoke/Class] GET /classes');
    const res = await apiClient.get<ApiResponse>(
      endpoints.class.get,
      { includeAuth: true },
    );

    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      validateFieldValue(res.body, 'status', 'SUCCESS');
    }
  });

  it('should reject class list without auth @smoke @class', async () => {
    logStep('[Smoke/Class] GET /classes without auth');
    const res = await apiClient.get<ApiResponse>(endpoints.class.get);
    expect([401, 403, 404]).toContain(res.status);
  });

  it('should reject get class with invalid id @smoke @class', async () => {
    logStep('[Smoke/Class] GET /classes/invalid-id');
    const res = await apiClient.get<ApiResponse>(`${endpoints.class.getById}invalid-uuid-000`, { includeAuth: true });
    expect([400, 404]).toContain(res.status);
  });

  it('should reject create class with missing name @smoke @class', async () => {
    logStep('[Smoke/Class] POST /classes — missing class_name');
    const res = await apiClient.post<ApiResponse>(endpoints.class.create, { class_name: '' }, { headers: { Authorization: `Bearer ${tokenManager.getToken()}` }, includeAuth: false });
    expect([400, 422]).toContain(res.status);
  });

  it('should reject delete class with invalid id @smoke @class', async () => {
    logStep('[Smoke/Class] DELETE /classes/invalid-id');
    const res = await apiClient.delete<ApiResponse>(`${endpoints.class.delete}invalid-uuid-000`, { headers: { Authorization: `Bearer ${tokenManager.getToken()}` }, includeAuth: false });
    expect([400, 404]).toContain(res.status);
  });

  it('should reject create class without auth @smoke @class', async () => {
    logStep('[Smoke/Class] POST /classes without auth');
    const res = await apiClient.post<ApiResponse>(endpoints.class.create, { class_name: 'Test Class' });
    expect([401, 403]).toContain(res.status);
  });
});
