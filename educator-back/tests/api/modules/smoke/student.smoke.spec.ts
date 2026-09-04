import { describe, it, beforeAll, beforeEach, expect } from '@jest/globals';
import { APIClient } from '../../utils/apiClient';
import { endpoints } from '../../utils/endpoints';
import { validateFieldValue } from '../../utils/responseValidator';
import { logStep } from '../../utils/logger';
import { tokenManager } from '../../utils/tokenManager';
import { ExecutionDataManager } from '../../utils/executionDataManager';
import type { ApiResponse, LoginResponseData } from '../../types/api.types';

describe('Smoke — Student Flow', () => {
  let apiClient: APIClient;

  beforeAll(async () => {
    apiClient = new APIClient();
    logStep(`[Smoke/Student] Target URL: ${(apiClient as unknown as { baseURL: string }).baseURL}`);

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
      logStep('[Smoke/Student] Login failed');
    }
  });

  beforeEach(() => {
    apiClient = new APIClient();
  });

  it('should get students for user @smoke @student', async () => {
    logStep('[Smoke/Student] GET /students/user');
    const res = await apiClient.get<ApiResponse>(
      endpoints.auth.getstudentuser,
      { includeAuth: true },
    );

    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      validateFieldValue(res.body, 'status', 'SUCCESS');
    }
  });

  it('should reject student access without auth @smoke @student', async () => {
    logStep('[Smoke/Student] GET /students/user without auth');
    const res = await apiClient.get<ApiResponse>(endpoints.auth.getstudentuser);
    expect([401, 403]).toContain(res.status);
  });

  it('should get students by class id @smoke @student', async () => {
    logStep('[Smoke/Student] GET /students/class/:classId');
    const res = await apiClient.get<ApiResponse>(`${endpoints.student.getByClass}invalid-uuid-000`, { includeAuth: true });
    expect([200, 400, 404]).toContain(res.status);
  });

  it('should reject create student with missing fields @smoke @student', async () => {
    logStep('[Smoke/Student] POST /students — missing required fields');
    const res = await apiClient.post<ApiResponse>(endpoints.student.create, {}, { headers: { Authorization: `Bearer ${tokenManager.getToken()}` }, includeAuth: false });
    expect([400, 422]).toContain(res.status);
  });

  it('should reject create student without auth @smoke @student', async () => {
    logStep('[Smoke/Student] POST /students without auth');
    const res = await apiClient.post<ApiResponse>(endpoints.student.create, { full_name: 'Test' });
    expect([401, 403]).toContain(res.status);
  });

  it('should reject delete student with invalid id @smoke @student', async () => {
    logStep('[Smoke/Student] DELETE /students/invalid-id');
    const res = await apiClient.delete<ApiResponse>(`${endpoints.student.delete}invalid-uuid-000`, { headers: { Authorization: `Bearer ${tokenManager.getToken()}` }, includeAuth: false });
    expect([400, 404]).toContain(res.status);
  });
});
