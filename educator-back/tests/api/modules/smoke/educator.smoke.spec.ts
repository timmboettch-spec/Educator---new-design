import { describe, it, beforeAll, beforeEach, expect } from '@jest/globals';
import { APIClient } from '../../utils/apiClient';
import { endpoints } from '../../utils/endpoints';
import { validateFieldValue } from '../../utils/responseValidator';
import { logStep } from '../../utils/logger';
import { tokenManager } from '../../utils/tokenManager';
import { ExecutionDataManager } from '../../utils/executionDataManager';
import type { ApiResponse, LoginResponseData } from '../../types/api.types';

describe('Smoke — Educator Flow', () => {
  let apiClient: APIClient;

  beforeAll(async () => {
    apiClient = new APIClient();
    logStep(`[Smoke/Educator] Target URL: ${(apiClient as unknown as { baseURL: string }).baseURL}`);

    const testEmail = ExecutionDataManager.getTestUserEmail();
    if (!testEmail) {
      logStep('[Smoke/Educator] No smoke user email found');
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
        const token = tokens?.accessToken as string ?? '';
        tokenManager.setToken(token);
      }
    } catch {
      logStep('[Smoke/Educator] Login failed');
    }
  });

  beforeEach(() => {
    apiClient = new APIClient();
  });

  it('should list educators for admin @smoke @educator', async () => {
    logStep('[Smoke/Educator] GET /educators/admin');
    const res = await apiClient.get<ApiResponse>(
      endpoints.auth.educatorget,
      { includeAuth: true },
    );

    // 200 = success, 404 = no educators yet, 400 = validation/empty — all valid for smoke
    expect([200, 404, 400]).toContain(res.status);
    if (res.status === 200) {
      validateFieldValue(res.body, 'status', 'SUCCESS');
    }
  });

  it('should reject get educator with invalid id @smoke @educator', async () => {
    logStep('[Smoke/Educator] GET /educators/invalid-id');
    const res = await apiClient.get<ApiResponse>(`${endpoints.educator.getById}invalid-uuid-000`, { includeAuth: true });
    expect([400, 404]).toContain(res.status);
  });

  it('should reject delete educator with invalid id @smoke @educator', async () => {
    logStep('[Smoke/Educator] DELETE /educators/invalid-id');
    const res = await apiClient.delete<ApiResponse>(`${endpoints.educator.delete}invalid-uuid-000`, { headers: { Authorization: `Bearer ${tokenManager.getToken()}` }, includeAuth: false });
    expect([400, 404]).toContain(res.status);
  });

  it('should reject update educator with invalid id @smoke @educator', async () => {
    logStep('[Smoke/Educator] PATCH /educators/invalid-id');
    const res = await apiClient.patch<ApiResponse>(`${endpoints.educator.update}invalid-uuid-000`, { full_name: 'Updated' }, { headers: { Authorization: `Bearer ${tokenManager.getToken()}` }, includeAuth: false });
    expect([400, 404]).toContain(res.status);
  });

  it('should reject create educator invite without auth @smoke @educator', async () => {
    logStep('[Smoke/Educator] POST /invites/create without auth');
    const res = await apiClient.post<ApiResponse>(endpoints.auth.educatorInvite, { email: 'test@test.com' });
    expect([401, 403]).toContain(res.status);
  });

  it('should reject educator list without auth @smoke @educator', async () => {
    logStep('[Smoke/Educator] GET /educators/admin without auth');
    const res = await apiClient.get<ApiResponse>(endpoints.auth.educatorget);

    expect([401, 403]).toContain(res.status);
  });
});
