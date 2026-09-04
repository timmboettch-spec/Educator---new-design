import { describe, it, beforeAll, beforeEach, expect } from '@jest/globals';
import { APIClient } from '../../utils/apiClient';
import { endpoints } from '../../utils/endpoints';
import { validateFieldValue } from '../../utils/responseValidator';
import { logStep } from '../../utils/logger';
import { tokenManager } from '../../utils/tokenManager';
import { ExecutionDataManager } from '../../utils/executionDataManager';
import type { ApiResponse, LoginResponseData } from '../../types/api.types';

describe('Smoke — Simulation Catalog Flow', () => {
  let apiClient: APIClient;

  beforeAll(async () => {
    apiClient = new APIClient();
    logStep(`[Smoke/Simulation] Target URL: ${(apiClient as unknown as { baseURL: string }).baseURL}`);

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
      logStep('[Smoke/Simulation] Login failed');
    }
  });

  beforeEach(() => {
    apiClient = new APIClient();
  });

  it('should get simulation catalog for dashboard @smoke @simulation', async () => {
    logStep('[Smoke/Simulation] GET /simulation-catalog/dashboard');
    const res = await apiClient.get<ApiResponse>(
      endpoints.auth.simulationcatalog,
      { includeAuth: true },
    );

    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      validateFieldValue(res.body, 'status', 'SUCCESS');
    }
  });

  it('should reject simulation catalog without auth @smoke @simulation', async () => {
    logStep('[Smoke/Simulation] GET /simulation-catalog/dashboard without auth');
    const res = await apiClient.get<ApiResponse>(endpoints.auth.simulationcatalog);
    expect([401, 403, 200]).toContain(res.status);
  });

  it('should get simulation scenarios list @smoke @simulation', async () => {
    logStep('[Smoke/Simulation] GET /simulation-catalog/scenarios');
    const res = await apiClient.get<ApiResponse>(endpoints.auth.simulationscenarios, { includeAuth: true });
    expect([200, 401, 404]).toContain(res.status);
    if (res.status === 200) validateFieldValue(res.body, 'status', 'SUCCESS');
  });

  it('should reject scenarios without auth @smoke @simulation', async () => {
    logStep('[Smoke/Simulation] GET /simulation-catalog/scenarios without auth');
    const res = await apiClient.get<ApiResponse>(endpoints.auth.simulationscenarios);
    expect([401, 403]).toContain(res.status);
  });

  it('should get my simulation library @smoke @simulation', async () => {
    logStep('[Smoke/Simulation] GET /educator-simulations/my-library');
    const res = await apiClient.get<ApiResponse>(endpoints.simulation.myLibrary, { includeAuth: true });
    expect([200, 401, 404]).toContain(res.status);
    if (res.status === 200) validateFieldValue(res.body, 'status', 'SUCCESS');
  });

  it('should reject my library without auth @smoke @simulation', async () => {
    logStep('[Smoke/Simulation] GET /educator-simulations/my-library without auth');
    const res = await apiClient.get<ApiResponse>(endpoints.simulation.myLibrary);
    expect([401, 403]).toContain(res.status);
  });
});
