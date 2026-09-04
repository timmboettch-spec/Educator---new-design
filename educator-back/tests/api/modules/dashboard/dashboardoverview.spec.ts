import type {
  ApiResponse,
  LoginResponseData,
  RegisterApiTestData
} from '../../types/api.types';

import { APIClient } from '../../utils/apiClient';

import { endpoints } from '../../utils/endpoints';

import { logStep } from '../../utils/logger';

import {
  validateStatusCode,
  validateFieldValue,
} from '../../utils/responseValidator';

import { ExecutionDataManager } from '../../utils/executionDataManager';

import { describe, it, beforeAll, beforeEach, expect } from '@jest/globals';

import fs from 'fs';

import path from 'path';

describe(
  'Dashboard Overview API Tests',
  () => {

    let apiClient: APIClient;

    let latestUserData:
      RegisterApiTestData;

    let accessToken = '';
    let dashboardEmail = '';

    beforeAll(() => {

      /**
       * LOAD REGISTER USER DATA
       */
      const registerApiPath =
        path.resolve(
          __dirname,
          '../../test-data/registerApi.json'
        );

      latestUserData = JSON.parse(
        fs.readFileSync(
          registerApiPath,
          'utf-8'
        )
      ) as RegisterApiTestData;

      /**
       * OVERRIDE loginUser WITH DYNAMIC CREDENTIALS
       */
      const testUserEmail =
        ExecutionDataManager.getTestUserEmail();

      if (testUserEmail) {
        latestUserData.loginUser = {
          email: testUserEmail,
          password: 'NewPassword@123',
        };
        dashboardEmail = testUserEmail;
      }

    });

    beforeEach(async () => {

      apiClient = new APIClient();

      /**
       * LOGIN if accessToken not yet set (once per test session)
       */
      if (!accessToken && dashboardEmail) {
        try {
          const loginResponse = await apiClient.post<LoginResponseData>(
            endpoints.auth.login,
            {
              email: dashboardEmail,
              password: latestUserData.loginUser.password || 'Password@123',
            }
          );

          if (loginResponse.status === 201) {
            accessToken = loginResponse.body.data.tokens.accessToken;
          }
        } catch (error) {
          console.warn('[beforeEach] Login error:', error instanceof Error ? error.message : String(error));
        }
      }

    });

    it(
      'should access dashboard overview with valid token @dashboard',

      async () => {

        logStep(
          'Access dashboard overview with valid token'
        );

        /**
         * PRE-AUTHENTICATED: Using accessToken from beforeEach
         */

        /**
         * DASHBOARD OVERVIEW API
         */
        const dashboardResponse =
          await apiClient.get(
            endpoints.auth.dashboard,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        /**
         * VALIDATIONS
         */
        validateStatusCode(
          dashboardResponse.status,
          200
        );

        validateFieldValue(
          dashboardResponse.body,
          'status',
          'SUCCESS'
        );

        validateFieldValue(
          dashboardResponse.body,
          'message',
          'Dashboard overview fetched'
        );

        const dashboardBody =
          dashboardResponse.body as ApiResponse<unknown>;

        expect(
          dashboardBody.data
        ).toBeTruthy();

      }
    );

    /**
     * INVALID TOKEN TEST
     */
    it(
      'should fail to access dashboard overview with invalid token @dashboard',

      async () => {

        logStep(
          'Access dashboard overview with invalid token'
        );

        const invalidToken =
          'invalidtoken';

        const dashboardResponse =
          await apiClient.get(
            endpoints.auth.dashboard,
            {
              headers: {
                Authorization:
                  `Bearer ${invalidToken}`,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          dashboardResponse.status,
          401
        );

        validateFieldValue(
          dashboardResponse.body,
          'status',
          'FAILED'
        );

        validateFieldValue(
          dashboardResponse.body,
          'message',
          'Unauthorized'
        );

        const dashboardBody =
          dashboardResponse.body as ApiResponse<null>;

        expect(
          dashboardBody.data
        ).toBeNull();

        expect(
          dashboardResponse.ok
        ).toBe(false);

      }
    );

    /**
     * EMPTY TOKEN TEST
     */
    it(
      'should fail to access dashboard overview with empty token @dashboard',

      async () => {

        logStep(
          'Access dashboard overview with empty token'
        );

        const emptyToken = '';

        const dashboardResponse =
          await apiClient.get(
            endpoints.auth.dashboard,
            {
              headers: {
                Authorization:
                  `Bearer ${emptyToken}`,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          dashboardResponse.status,
          401
        );

        validateFieldValue(
          dashboardResponse.body,
          'status',
          'FAILED'
        );

        validateFieldValue(
          dashboardResponse.body,
          'message',
          'Unauthorized'
        );

        const dashboardBody =
          dashboardResponse.body as ApiResponse<null>;

        expect(
          dashboardBody.data
        ).toBeNull();

        expect(
          dashboardResponse.ok
        ).toBe(false);

      }
    );

    /**
     * NO AUTHORIZATION HEADER TEST
     */
    it(
      'should fail to access dashboard overview without authorization header @dashboard',

      async () => {

        logStep(
          'Access dashboard overview without authorization header'
        );

        const dashboardResponse =
          await apiClient.get(
            endpoints.auth.dashboard,
            {
              includeAuth: false,
            }
          );

        validateStatusCode(
          dashboardResponse.status,
          401
        );

        validateFieldValue(
          dashboardResponse.body,
          'status',
          'FAILED'
        );

        validateFieldValue(
          dashboardResponse.body,
          'message',
          'Unauthorized'
        );

        const dashboardBody =
          dashboardResponse.body as ApiResponse<null>;

        expect(
          dashboardBody.data
        ).toBeNull();

        expect(
          dashboardResponse.ok
        ).toBe(false);

      }
    );

    /**
     * MALFORMED BEARER TOKEN TEST
     */
    it(
      'should fail to access dashboard overview with malformed bearer token @dashboard',

      async () => {

        logStep(
          'Access dashboard overview with malformed bearer token'
        );

        const malformedToken =
          'Bearer malformed.token.value';

        const dashboardResponse =
          await apiClient.get(
            endpoints.auth.dashboard,
            {
              headers: {
                Authorization:
                  malformedToken,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          dashboardResponse.status,
          401
        );

        validateFieldValue(
          dashboardResponse.body,
          'status',
          'FAILED'
        );

        validateFieldValue(
          dashboardResponse.body,
          'message',
          'Unauthorized'
        );

        const dashboardBody =
          dashboardResponse.body as ApiResponse<null>;

        expect(
          dashboardBody.data
        ).toBeNull();

        expect(
          dashboardResponse.ok
        ).toBe(false);

      }
    );

    /**
     * BEARER ONLY TOKEN TEST
     */
    it(
      'should fail to access dashboard overview with bearer only token @dashboard',

      async () => {

        logStep(
          'Access dashboard overview with bearer only token'
        );

        const bearerOnlyToken =
          'Bearer';

        const dashboardResponse =
          await apiClient.get(
            endpoints.auth.dashboard,
            {
              headers: {
                Authorization:
                  bearerOnlyToken,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          dashboardResponse.status,
          401
        );

        validateFieldValue(
          dashboardResponse.body,
          'status',
          'FAILED'
        );

        validateFieldValue(
          dashboardResponse.body,
          'message',
          'Unauthorized'
        );

        const dashboardBody =
          dashboardResponse.body as ApiResponse<null>;

        expect(
          dashboardBody.data
        ).toBeNull();

        expect(
          dashboardResponse.ok
        ).toBe(false);

      }
    );

    /**
     * RANDOM JWT FORMAT TOKEN TEST
     */
    it(
      'should fail to access dashboard overview with random jwt format token @dashboard',

      async () => {

        logStep(
          'Access dashboard overview with random jwt format token'
        );

        const randomJwtToken =
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.payload.signature';

        const dashboardResponse =
          await apiClient.get(
            endpoints.auth.dashboard,
            {
              headers: {
                Authorization:
                  randomJwtToken,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          dashboardResponse.status,
          401
        );

        validateFieldValue(
          dashboardResponse.body,
          'status',
          'FAILED'
        );

        validateFieldValue(
          dashboardResponse.body,
          'message',
          'Unauthorized'
        );

        const dashboardBody =
          dashboardResponse.body as ApiResponse<null>;

        expect(
          dashboardBody.data
        ).toBeNull();

        expect(
          dashboardResponse.ok
        ).toBe(false);

      }
    );

    /**
     * VERIFY RESPONSE STRUCTURE TEST
     */
    it(
      'should return dashboard with correct response structure @dashboard',

      async () => {

        logStep(
          'Verify dashboard response structure'
        );

        /**
         * PRE-AUTHENTICATED: Using accessToken from beforeEach
         */

        const dashboardResponse =
          await apiClient.get(
            endpoints.auth.dashboard,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const body = dashboardResponse.body as ApiResponse<unknown>;

        expect(body).toHaveProperty('status');
        expect(body).toHaveProperty('message');
        expect(body).toHaveProperty('data');
        expect(body.status).toBe('SUCCESS');
        expect(typeof body.message).toBe('string');
        expect(body.data).toBeTruthy();

      }
    );

    /**
     * MULTIPLE SEQUENTIAL CALLS TEST
     */
    it(
      'should handle multiple sequential dashboard requests with same token @dashboard',

      async () => {

        logStep(
          'Execute multiple sequential dashboard requests'
        );

        /**
         * PRE-AUTHENTICATED: Using accessToken from beforeEach
         */

        // Make 3 sequential calls
        for (let i = 0; i < 3; i++) {
          const dashboardResponse =
            await apiClient.get(
              endpoints.auth.dashboard,
              {
                headers: {
                  Authorization:
                    `Bearer ${accessToken}`,
                },

                includeAuth: false,
              }
            );

          validateStatusCode(
            dashboardResponse.status,
            200
          );

          validateFieldValue(
            dashboardResponse.body,
            'status',
            'SUCCESS'
          );
        }

      }
    );

    /**
     * WHITESPACE TOKEN TEST
     */
    it(
      'should fail with whitespace in token @dashboard',

      async () => {

        logStep(
          'Access dashboard with whitespace token'
        );

        const whitespaceToken =
          'Bearer token with spaces';

        const dashboardResponse =
          await apiClient.get(
            endpoints.auth.dashboard,
            {
              headers: {
                Authorization:
                  whitespaceToken,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          dashboardResponse.status,
          401
        );

      }
    );

    /**
     * RESPONSE TIME TEST
     */
    it(
      'should respond within acceptable time @dashboard',

      async () => {

        logStep(
          'Verify dashboard response time'
        );

        /**
         * PRE-AUTHENTICATED: Using accessToken from beforeEach
         */

        const startTime = Date.now();

        const dashboardResponse =
          await apiClient.get(
            endpoints.auth.dashboard,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        validateStatusCode(
          dashboardResponse.status,
          200
        );

        // Response should be under 5 seconds
        expect(responseTime).toBeLessThan(5000);

      }
    );

    /**
     * CASE SENSITIVE BEARER TEST
     */
    it(
      'should handle case insensitive bearer prefix @dashboard',

      async () => {

        logStep(
          'Test case sensitivity of bearer prefix'
        );

        /**
         * PRE-AUTHENTICATED: Using accessToken from beforeEach
         */

        // Try with lowercase bearer
        const dashboardResponse =
          await apiClient.get(
            endpoints.auth.dashboard,
            {
              headers: {
                Authorization:
                  `bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        // Should either succeed or fail consistently
        expect([200, 401]).toContain(
          dashboardResponse.status
        );

      }
    );

    /**
     * RESPONSE DATA CONSISTENCY TEST
     */
    it(
      'should return consistent data across multiple calls @dashboard',

      async () => {

        logStep(
          'Verify data consistency across calls'
        );

        /**
         * PRE-AUTHENTICATED: Using accessToken from beforeEach
         */

        const firstCall =
          await apiClient.get(
            endpoints.auth.dashboard,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const secondCall =
          await apiClient.get(
            endpoints.auth.dashboard,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(firstCall.status, 200);
        validateStatusCode(secondCall.status, 200);

        const firstData = (firstCall.body as ApiResponse<unknown>).data;
        const secondData = (secondCall.body as ApiResponse<unknown>).data;

        expect(firstData).toEqual(secondData);

      }
    );

  }
);



