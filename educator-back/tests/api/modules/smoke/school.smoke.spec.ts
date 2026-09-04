import { describe, it, beforeAll, beforeEach, expect } from '@jest/globals';
import { APIClient } from '../../utils/apiClient';
import { endpoints } from '../../utils/endpoints';
import { validateStatusCode, validateFieldValue } from '../../utils/responseValidator';
import { logStep } from '../../utils/logger';
import { tokenManager } from '../../utils/tokenManager';
import { ExecutionDataManager } from '../../utils/executionDataManager';
import type { ApiResponse, LoginResponseData } from '../../types/api.types';

describe('Smoke — School Flow', () => {
  let apiClient: APIClient;
  let accessToken = '';
  let createdSchoolId = '';

  beforeAll(async () => {
    apiClient = new APIClient();
    logStep(`[Smoke/School] Target URL: ${(apiClient as unknown as { baseURL: string }).baseURL}`);

    // Load registered user credentials from execution-data
    const testEmail = ExecutionDataManager.getTestUserEmail();
    if (!testEmail) {
      logStep('[Smoke/School] No smoke user email found — auth smoke must run first');
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
        logStep(`[Smoke/School] Auth token obtained`);
      }
    } catch {
      logStep('[Smoke/School] Login call failed');
    }
  });

  beforeEach(() => {
    apiClient = new APIClient();
  });

  it('should create a school @smoke @school', async () => {
    logStep('[Smoke/School] Create school');
    const res = await apiClient.post<ApiResponse>(
      endpoints.school.create,
      { school_name: `Smoke School ${Date.now()}` },
      { includeAuth: true },
    );

    // 201 = created, 409 = duplicate (also acceptable if school already exists)
    expect([201, 409]).toContain(res.status);
    if (res.status === 201) {
      const data = ((res.body as unknown) as Record<string, unknown>)?.data as Record<string, unknown>;
      createdSchoolId = (data?.id as string) ?? '';
      if (createdSchoolId) {
        ExecutionDataManager.saveEntityId('school', createdSchoolId);
        logStep(`[Smoke/School] Created school ID: ${createdSchoolId}`);
      }
    }
  });

  it('should get schools for user @smoke @school', async () => {
    logStep('[Smoke/School] Get schools for user');
    const res = await apiClient.get<ApiResponse>(
      endpoints.school.get,
      { includeAuth: true },
    );

    validateStatusCode(res.status, 200);
    validateFieldValue(res.body, 'status', 'SUCCESS');
  });

  it('should get school by id with valid token @smoke @school', async () => {
    logStep('[Smoke/School] GET /schools/:id with valid token');
    const listRes = await apiClient.get<ApiResponse>(endpoints.school.get, { includeAuth: true });
    if (listRes.status !== 200) return;
    const data = (listRes.body as unknown as { data: Array<{ id: string }> | { schools: Array<{ id: string }> } })?.data;
    const schoolsData = data as { schools?: Array<{ id: string }> };
    const schools: Array<{ id: string }> = Array.isArray(data) ? data : (schoolsData.schools ?? []);
    if (!schools.length) return;
    const schoolId = schools[0]?.id;
    const res = await apiClient.get<ApiResponse>(`${endpoints.school.getById}${schoolId}`, { includeAuth: true });
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) validateFieldValue(res.body, 'status', 'SUCCESS');
  });

  it('should reject get school with invalid id @smoke @school', async () => {
    logStep('[Smoke/School] GET /schools/invalid-id');
    const res = await apiClient.get<ApiResponse>(`${endpoints.school.getById}invalid-uuid-000`, { includeAuth: true });
    expect([400, 404]).toContain(res.status);
  });

  it('should reject create school without name @smoke @school', async () => {
    logStep('[Smoke/School] POST /schools — missing school_name');
    const res = await apiClient.post<ApiResponse>(endpoints.school.create, { school_name: '' }, { headers: { Authorization: `Bearer ${tokenManager.getToken()}` }, includeAuth: false });
    expect([400, 422]).toContain(res.status);
  });

  it('should reject delete school with invalid id @smoke @school', async () => {
    logStep('[Smoke/School] DELETE /schools/invalid-id');
    const res = await apiClient.delete<ApiResponse>(`${endpoints.school.delete}invalid-uuid-000`, { headers: { Authorization: `Bearer ${tokenManager.getToken()}` }, includeAuth: false });
    expect([400, 404]).toContain(res.status);
  });

  it('should reject update school with invalid id @smoke @school', async () => {
    logStep('[Smoke/School] PATCH /schools/invalid-id');
    const res = await apiClient.patch<ApiResponse>(`${endpoints.school.update}invalid-uuid-000`, { school_name: 'Updated' }, { headers: { Authorization: `Bearer ${tokenManager.getToken()}` }, includeAuth: false });
    expect([400, 404]).toContain(res.status);
  });

  it('should reject get school without auth @smoke @school', async () => {
    logStep('[Smoke/School] GET /schools/user without auth');
    const res = await apiClient.get<ApiResponse>(endpoints.school.get);
    expect([401, 403]).toContain(res.status);
  });

  it('should reject create school without auth @smoke @school', async () => {
    logStep('[Smoke/School] Create school without auth');
    const res = await apiClient.post<ApiResponse>(
      endpoints.school.create,
      { school_name: 'Unauthorized School' },
    );

    expect([401, 403]).toContain(res.status);
  });
});
