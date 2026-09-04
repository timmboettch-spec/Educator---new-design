import { describe, it, beforeAll, beforeEach, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { APIClient } from '../../utils/apiClient';
import { endpoints } from '../../utils/endpoints';
import { logStep } from '../../utils/logger';
import {
  validateStatusCode,
  validateFieldValue,
} from '../../utils/responseValidator';
import type { LoginResponseData, RegisterApiTestData } from '../../types/api.types';

/**
 * Generic API Response Type
 */
interface ApiResponse {
  status: 'SUCCESS' | 'FAILED';
  message: string;
  data: unknown;
}

/**
 * Execution Data Structure
 */
interface ExecutionData {
  auth: {
    userId?: string;
    accessToken?: string;
  };
  entities: {
    student?: {
      created: string[];
      deleted: string[];
      deletedCount: number;
      failedCount: number;
    };
    class?: {
      created: string[];
      deleted: string[];
      deletedCount: number;
      failedCount: number;
    };
    educator?: {
      created: string[];
      deleted: string[];
      deletedCount: number;
      failedCount: number;
    };
    school?: {
      created: string[];
      deleted: string[];
      deletedCount: number;
      failedCount: number;
    };
  };
  cleanup: {
    status: string;
    results: Array<{
      entity: string;
      id: string;
      status: 'deleted' | 'failed' | 'pending';
      httpStatus?: number;
      message?: string;
    }>;
  };
}

/**
 * Reality Works - Cleanup Module API Tests
 * @tag @cleanup
 */
describe(
  'Cleanup Module - Delete Test Resources',
  () => {

    let apiClient: APIClient;
    let executionData: ExecutionData | null = null;
    let studentIds: string[] = [];
    let classIds: string[] = [];
    let educatorIds: string[] = [];
    let schoolIds: string[] = [];

    beforeAll(() => {
      logStep('Loading execution data for cleanup');

      try {
        const executionDataPath = path.resolve(
          __dirname,
          '../../test-data/execution-data.json'
        );

        if (fs.existsSync(executionDataPath)) {
          const content = fs.readFileSync(executionDataPath, 'utf-8');
          executionData = JSON.parse(content) as ExecutionData;

          // Extract entity IDs in reverse dependency order
          studentIds =
            executionData?.entities?.student?.created || [];
          classIds =
            executionData?.entities?.class?.created || [];
          educatorIds =
            executionData?.entities?.educator?.created || [];
          schoolIds =
            executionData?.entities?.school?.created || [];
        } else {
          executionData = null;
        }
      } catch (error) {
        console.error(
          '\nFailed to load execution data:',
          error instanceof Error ? error.message : String(error)
        );
        executionData = null;
      }
    });

    beforeEach(() => {
      apiClient = new APIClient();
    });

    /**
     * Helper function to login and get token
     */
    async function getAccessToken(email: string, password: string): Promise<string> {
      logStep(`Getting access token for: ${email}`);

      try {
        const loginResponse = await apiClient.post<
          LoginResponseData
        >(
          endpoints.auth.login,
          {
            email,
            password,
          }
        );
        if (loginResponse.status === 201 && loginResponse.body?.data?.tokens?.accessToken) {
          const token = loginResponse.body.data.tokens.accessToken;
          return token;
        } else {
          console.error(`Failed to obtain access token (status: ${loginResponse.status})`);
          return '';
        }
      } catch (error) {
        console.error(
          'Failed to login:',
          error instanceof Error ? error.message : String(error)
        );
        return '';
      }
    }

    describe('Class Cleanup', () => {

      it(
        'should delete class with valid ID and token @cleanup',
        async () => {

          if (!classIds.length) {
            return;
          }

          logStep(
            `Deleting ${classIds.length} class(es) created from previous tests`
          );

          // Load test data to get educator credentials
          const registerApiPath = path.resolve(
            __dirname,
            '../../test-data/registerApi.json'
          );

          const registerData = JSON.parse(
            fs.readFileSync(registerApiPath, 'utf-8')
          ) as RegisterApiTestData;

          // Get educator token (classes are created by educator)
          const educatorToken = await getAccessToken(
            registerData.educatorcreate.email,
            registerData.educatorcreate.password
          );

          if (!educatorToken) {
            console.error('Failed to get educator token');
            return;
          }

          for (const classId of classIds) {
            const response = await apiClient.delete<
              ApiResponse
            >(
              `${endpoints.class.classdelete}${classId}`,
              {
                headers: {
                  Authorization: `Bearer ${educatorToken}`,
                },
                includeAuth: false,
              }
            );
            expect([200, 404]).toContain(response.status);
            
            if (response.status === 200) {
              validateFieldValue(
                response.body,
                'status',
                'SUCCESS'
              );
            }
          }
        }
      );

      it(
        'should fail to delete class with invalid ID format @cleanup',
        async () => {

          logStep(
            'Testing delete class with invalid ID format'
          );

          const registerApiPath = path.resolve(
            __dirname,
            '../../test-data/registerApi.json'
          );

          const registerData = JSON.parse(
            fs.readFileSync(registerApiPath, 'utf-8')
          ) as RegisterApiTestData;

          const educatorToken = await getAccessToken(
            registerData.educatorcreate.email,
            registerData.educatorcreate.password
          );

          const response = await apiClient.delete<
            ApiResponse
          >(
            `${endpoints.class.classdelete}invalid-class-id`,
            {
              headers: {
                Authorization: `Bearer ${educatorToken}`,
              },
              includeAuth: false,
            }
          );

          validateStatusCode(response.status, 400);
          validateFieldValue(
            response.body,
            'status',
            'FAILED'
          );
        }
      );

      it(
        'should fail to delete class without token @cleanup',
        async () => {

          logStep('Testing delete class without token');

          const classId = 'test-class-id';

          const response = await apiClient.delete<
            ApiResponse
          >(
            `${endpoints.class.classdelete}${classId}`,
            {
              includeAuth: false,
            }
          );

          validateStatusCode(response.status, 401);
          validateFieldValue(
            response.body,
            'status',
            'FAILED'
          );
        }
      );

      it(
        'should fail to delete class with invalid token @cleanup',
        async () => {

          logStep(
            'Testing delete class with invalid token'
          );

          const classId = 'test-class-id';

          const response = await apiClient.delete<
            ApiResponse
          >(
            `${endpoints.class.classdelete}${classId}`,
            {
              headers: {
                Authorization:
                  'Bearer invalid.token.value',
              },
              includeAuth: false,
            }
          );

          validateStatusCode(response.status, 401);
          validateFieldValue(
            response.body,
            'status',
            'FAILED'
          );
        }
      );

      it(
        'should handle idempotent delete of already deleted class @cleanup',
        async () => {

          if (!classIds.length) {
            return;
          }

          logStep('Testing idempotent delete of class');

          const registerApiPath = path.resolve(
            __dirname,
            '../../test-data/registerApi.json'
          );

          const registerData = JSON.parse(
            fs.readFileSync(registerApiPath, 'utf-8')
          ) as RegisterApiTestData;

          const educatorToken = await getAccessToken(
            registerData.educatorcreate.email,
            registerData.educatorcreate.password
          );

          const classId = classIds[0];

          // Delete class
          await apiClient.delete<ApiResponse>(
            `${endpoints.class.classdelete}${classId}`,
            {
              headers: {
                Authorization: `Bearer ${educatorToken}`,
              },
              includeAuth: false,
            }
          );

          // Attempt to delete again
          const secondDeleteResponse =
            await apiClient.delete<ApiResponse>(
              `${endpoints.class.classdelete}${classId}`,
              {
                headers: {
                  Authorization: `Bearer ${educatorToken}`,
                },
                includeAuth: false,
              }
            );

          // Should fail with 404 (not found)
          expect([404, 400]).toContain(
            secondDeleteResponse.status
          );
          validateFieldValue(
            secondDeleteResponse.body,
            'status',
            'FAILED'
          );
        }
      );

    });

    /**
     * ========================================================================
     * EDUCATOR CLEANUP TESTS
     * ========================================================================
     * Delete all educators created during test execution
     */
    describe('Educator Cleanup', () => {

      it(
        'should delete educator with valid ID and token @cleanup',
        async () => {

          if (!educatorIds.length) {
            return;
          }

          logStep(
            `Deleting ${educatorIds.length} educator(s)`
          );

          // Load test data to get admin credentials
          const registerApiPath = path.resolve(
            __dirname,
            '../../test-data/registerApi.json'
          );

          const registerData = JSON.parse(
            fs.readFileSync(registerApiPath, 'utf-8')
          ) as RegisterApiTestData;

          // Get admin token (educators are created by admin/loginUser)
          const adminToken = await getAccessToken(
            registerData.loginUser.email,
            registerData.loginUser.password
          );

          if (!adminToken) {
            console.error('Failed to get admin token');
            return;
          }

          for (const educatorId of educatorIds) {
            const response = await apiClient.delete<
              ApiResponse
            >(
              `${endpoints.educator.educatordelete}${educatorId}`,
              {
                headers: {
                  Authorization: `Bearer ${adminToken}`,
                },
                includeAuth: false,
              }
            );

            expect([200, 404]).toContain(response.status);
            
            if (response.status === 200) {
              validateFieldValue(
                response.body,
                'status',
                'SUCCESS'
              );
            }
          }
        }
      );

      it(
        'should fail to delete educator with invalid ID format @cleanup',
        async () => {

          logStep(
            'Testing delete educator with invalid ID format'
          );

          const registerApiPath = path.resolve(
            __dirname,
            '../../test-data/registerApi.json'
          );

          const registerData = JSON.parse(
            fs.readFileSync(registerApiPath, 'utf-8')
          ) as RegisterApiTestData;

          const adminToken = await getAccessToken(
            registerData.loginUser.email,
            registerData.loginUser.password
          );

          const response = await apiClient.delete<
            ApiResponse
          >(
            `${endpoints.educator.educatordelete}invalid-educator-id`,
            {
              headers: {
                Authorization: `Bearer ${adminToken}`,
              },
              includeAuth: false,
            }
          );

          validateStatusCode(response.status, 400);
          validateFieldValue(
            response.body,
            'status',
            'FAILED'
          );
        }
      );

      it(
        'should fail to delete educator without token @cleanup',
        async () => {

          logStep(
            'Testing delete educator without token'
          );

          const educatorId = 'test-educator-id';

          const response = await apiClient.delete<
            ApiResponse
          >(
            `${endpoints.educator.educatordelete}${educatorId}`,
            {
              includeAuth: false,
            }
          );

          validateStatusCode(response.status, 401);
          validateFieldValue(
            response.body,
            'status',
            'FAILED'
          );
        }
      );

      it(
        'should fail to delete educator with invalid token @cleanup',
        async () => {

          logStep(
            'Testing delete educator with invalid token'
          );

          const educatorId = 'test-educator-id';

          const response = await apiClient.delete<
            ApiResponse
          >(
            `${endpoints.educator.educatordelete}${educatorId}`,
            {
              headers: {
                Authorization:
                  'Bearer invalid.token.value',
              },
              includeAuth: false,
            }
          );

          validateStatusCode(response.status, 401);
          validateFieldValue(
            response.body,
            'status',
            'FAILED'
          );
        }
      );

      it(
        'should handle idempotent delete of already deleted educator @cleanup',
        async () => {

          if (!educatorIds.length) {
            return;
          }

          logStep(
            'Testing idempotent delete of educator'
          );

          const registerApiPath = path.resolve(
            __dirname,
            '../../test-data/registerApi.json'
          );

          const registerData = JSON.parse(
            fs.readFileSync(registerApiPath, 'utf-8')
          ) as RegisterApiTestData;

          const adminToken = await getAccessToken(
            registerData.loginUser.email,
            registerData.loginUser.password
          );

          const educatorId = educatorIds[0];

          // Delete educator
          await apiClient.delete<ApiResponse>(
            `${endpoints.educator.educatordelete}${educatorId}`,
            {
              headers: {
                Authorization: `Bearer ${adminToken}`,
              },
              includeAuth: false,
            }
          );

          // Attempt to delete again
          const secondDeleteResponse =
            await apiClient.delete<ApiResponse>(
              `${endpoints.educator.educatordelete}${educatorId}`,
              {
                headers: {
                  Authorization: `Bearer ${adminToken}`,
                },
                includeAuth: false,
              }
            );

          // Should fail with 404 (not found)
          expect([404, 400]).toContain(
            secondDeleteResponse.status
          );
          validateFieldValue(
            secondDeleteResponse.body,
            'status',
            'FAILED'
          );
        }
      );

    });

    /**
     * ========================================================================
     * SCHOOL CLEANUP TESTS
     * ========================================================================
     * Delete all schools created during test execution
     */
    describe('School Cleanup', () => {

      it(
        'should delete school with valid ID and token @cleanup',
        async () => {
          if (!schoolIds.length) {
            return;
          }
          logStep(
            `Deleting ${schoolIds.length} school(s)`
          );
          const registerApiPath = path.resolve(
            __dirname,
            '../../test-data/registerApi.json'
          );

          const registerData = JSON.parse(
            fs.readFileSync(registerApiPath, 'utf-8')
          ) as RegisterApiTestData;
          const adminToken = await getAccessToken(
            registerData.loginUser.email,
            registerData.loginUser.password
          );

          if (!adminToken) {
            console.error('Failed to get admin token');
            return;
          }

          for (const schoolId of schoolIds) {
            const response = await apiClient.delete<
              ApiResponse
            >(
              `${endpoints.school.schooldelete}${schoolId}`,
              {
                headers: {
                  Authorization: `Bearer ${adminToken}`,
                },
                includeAuth: false,
              }
            );
            expect([200, 404]).toContain(response.status);
            
            if (response.status === 200) {
              validateFieldValue(
                response.body,
                'status',
                'SUCCESS'
              );
            }
          }
        }
      );

      it(
        'should fail to delete school with invalid ID format @cleanup',
        async () => {

          logStep(
            'Testing delete school with invalid ID format'
          );

          const registerApiPath = path.resolve(
            __dirname,
            '../../test-data/registerApi.json'
          );

          const registerData = JSON.parse(
            fs.readFileSync(registerApiPath, 'utf-8')
          ) as RegisterApiTestData;

          const adminToken = await getAccessToken(
            registerData.loginUser.email,
            registerData.loginUser.password
          );

          const response = await apiClient.delete<
            ApiResponse
          >(
            `${endpoints.school.schooldelete}invalid-school-id`,
            {
              headers: {
                Authorization: `Bearer ${adminToken}`,
              },
              includeAuth: false,
            }
          );

          validateStatusCode(response.status, 400);
          validateFieldValue(
            response.body,
            'status',
            'FAILED'
          );
        }
      );

      it(
        'should fail to delete school without token @cleanup',
        async () => {

          logStep('Testing delete school without token');

          const schoolId = 'test-school-id';

          const response = await apiClient.delete<
            ApiResponse
          >(
            `${endpoints.school.schooldelete}${schoolId}`,
            {
              includeAuth: false,
            }
          );

          validateStatusCode(response.status, 401);
          validateFieldValue(
            response.body,
            'status',
            'FAILED'
          );
        }
      );

      it(
        'should fail to delete school with invalid token @cleanup',
        async () => {

          logStep(
            'Testing delete school with invalid token'
          );

          const schoolId = 'test-school-id';

          const response = await apiClient.delete<
            ApiResponse
          >(
            `${endpoints.school.schooldelete}${schoolId}`,
            {
              headers: {
                Authorization:
                  'Bearer invalid.token.value',
              },
              includeAuth: false,
            }
          );

          validateStatusCode(response.status, 401);
          validateFieldValue(
            response.body,
            'status',
            'FAILED'
          );
        }
      );

      it(
        'should handle idempotent delete of already deleted school @cleanup',
        async () => {

          if (!schoolIds.length) {
            return;
          }

          logStep('Testing idempotent delete of school');

          const registerApiPath = path.resolve(
            __dirname,
            '../../test-data/registerApi.json'
          );

          const registerData = JSON.parse(
            fs.readFileSync(registerApiPath, 'utf-8')
          ) as RegisterApiTestData;

          const adminToken = await getAccessToken(
            registerData.loginUser.email,
            registerData.loginUser.password
          );

          const schoolId = schoolIds[0];

          // Delete school
          await apiClient.delete<ApiResponse>(
            `${endpoints.school.schooldelete}${schoolId}`,
            {
              headers: {
                Authorization: `Bearer ${adminToken}`,
              },
              includeAuth: false,
            }
          );

          // Attempt to delete again
          const secondDeleteResponse =
            await apiClient.delete<ApiResponse>(
              `${endpoints.school.schooldelete}${schoolId}`,
              {
                headers: {
                  Authorization: `Bearer ${adminToken}`,
                },
                includeAuth: false,
              }
            );

          // Should fail with 404 (not found)
          expect([404, 400]).toContain(
            secondDeleteResponse.status
          );
          validateFieldValue(
            secondDeleteResponse.body,
            'status',
            'FAILED'
          );
        }
      );
    });

    it(
      'should fail delete educator with invalid token @cleanup',
      async () => {

        if (!educatorIds.length) {
          return;
        }

        logStep(
          'Delete educator with invalid token'
        );

        const response = await apiClient.delete<
          ApiResponse
        >(
          `${endpoints.educator.educatordelete}${educatorIds[0]}`,
          {
            headers: {
              Authorization:
                'Bearer invalid.token.value',
            },
            includeAuth: false,
          }
        );

        validateStatusCode(response.status, 401);
        validateFieldValue(
          response.body,
          'status',
          'FAILED'
        );
      }
    );

    /**
     * DELETE STUDENT WITH VALID TOKEN
     */
    it(
      'should delete student with valid educator token @cleanup',
      async () => {

        if (!studentIds.length) {
          return;
        }

        logStep(
          'Deleting students with valid token'
        );

        const registerApiPath = path.resolve(
          __dirname,
          '../../test-data/registerApi.json'
        );

        const registerData = JSON.parse(
          fs.readFileSync(registerApiPath, 'utf-8')
        ) as RegisterApiTestData;

        const educatorToken = await getAccessToken(
          registerData.educatorcreate.email,
          registerData.educatorcreate.password
        );

        for (const studentId of studentIds) {
          const response = await apiClient.delete<
            ApiResponse
          >(
            `${endpoints.student.studentdelete}${studentId}`,
            {
              headers: {
                Authorization:
                  `Bearer ${educatorToken}`,
              },
              includeAuth: false,
            }
          );

          expect([200, 404]).toContain(response.status);
        }
      }
    );

    /**
     * DELETE WITH MALFORMED TOKEN
     */
    it(
      'should fail delete with malformed bearer token @cleanup',
      async () => {

        if (!classIds.length) {
          return;
        }

        logStep(
          'Delete with malformed bearer token'
        );

        const malformedToken =
          'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.payload';

        const response = await apiClient.delete<
          ApiResponse
        >(
          `${endpoints.class.classdelete}${classIds[0]}`,
          {
            headers: {
              Authorization: malformedToken,
            },
            includeAuth: false,
          }
        );

        validateStatusCode(response.status, 401);
      }
    );

    /**
     * DELETE WITH EMPTY TOKEN
     */
    it(
      'should fail delete with empty bearer token @cleanup',
      async () => {

        if (!classIds.length) {
          return;
        }

        logStep(
          'Delete with empty bearer token'
        );

        const response = await apiClient.delete<
          ApiResponse
        >(
          `${endpoints.class.classdelete}${classIds[0]}`,
          {
            headers: {
              Authorization: 'Bearer ',
            },
            includeAuth: false,
          }
        );

        validateStatusCode(response.status, 401);
      }
    );

    /**
     * DELETE WITHOUT AUTHORIZATION HEADER
     */
    it(
      'should fail delete without authorization header @cleanup',
      async () => {

        if (!classIds.length) {
          return;
        }

        logStep(
          'Delete without authorization header'
        );

        const response = await apiClient.delete<
          ApiResponse
        >(
          `${endpoints.class.classdelete}${classIds[0]}`,
          {
            includeAuth: false,
          }
        );

        validateStatusCode(response.status, 401);
      }
    );

    /**
     * DELETE RESPONSE TIME
     */
    it(
      'should complete delete operations within acceptable time @cleanup',
      async () => {

        if (!classIds.length) {
          return;
        }

        logStep(
          'Verify delete operation response time'
        );

        const registerApiPath = path.resolve(
          __dirname,
          '../../test-data/registerApi.json'
        );

        const registerData = JSON.parse(
          fs.readFileSync(registerApiPath, 'utf-8')
        ) as RegisterApiTestData;

        const educatorToken = await getAccessToken(
          registerData.educatorcreate.email,
          registerData.educatorcreate.password
        );

        const startTime = Date.now();

        await apiClient.delete<
          ApiResponse
        >(
          `${endpoints.class.classdelete}${classIds[0]}`,
          {
            headers: {
              Authorization:
                `Bearer ${educatorToken}`,
            },
            includeAuth: false,
          }
        );

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        expect(responseTime).toBeLessThan(5000);
      }
    );

    /**
     * DELETE IDEMPOTENCY TEST
     */
    it(
      'should verify delete is idempotent for non-existent resources @cleanup',
      async () => {

        logStep(
          'Test delete idempotency for non-existent resource'
        );

        const registerApiPath = path.resolve(
          __dirname,
          '../../test-data/registerApi.json'
        );

        const registerData = JSON.parse(
          fs.readFileSync(registerApiPath, 'utf-8')
        ) as RegisterApiTestData;

        const educatorToken = await getAccessToken(
          registerData.educatorcreate.email,
          registerData.educatorcreate.password
        );

        const nonExistentId =
          '00000000-0000-0000-0000-000000000000';

        const response = await apiClient.delete<
          ApiResponse
        >(
          `${endpoints.class.classdelete}${nonExistentId}`,
          {
            headers: {
              Authorization:
                `Bearer ${educatorToken}`,
            },
            includeAuth: false,
          }
        );

        // Should return 404 or 400 for non-existent resource
        expect([400, 404]).toContain(response.status);
      }
    );

  }
);
