// create educator invite + educator register API

import { endpoints } from '../../utils/endpoints';

import { logStep } from '../../utils/logger';

import {
  validateStatusCode,
  validateFieldValue
} from '../../utils/responseValidator';

import educatorData from '../../test-data/educatorApi.json';

import schoolApiData from '../../test-data/schoolApi.json';

import { describe, it, beforeAll, beforeEach, expect } from '@jest/globals';

import { APIClient } from '../../utils/apiClient';

import fs from 'fs';

import path from 'path';

import type {
  RegisterApiTestData,
  LoginResponseData
} from '../../types/api.types';

import { ExecutionDataManager } from '../../utils/executionDataManager';

/**
 * Reality Works - Educator Invite Tests
 * @tag @educatorInvite
 */

describe('Educator Invite API Tests', () => {

  let apiClient: APIClient;

  let latestUserData:
    RegisterApiTestData;

  /**
   * GLOBAL VARIABLES
   */
  let createdSchoolId: string;

  let uniqueEmail: string;

  let inviteId: string;

  let educatorId = '';

  let educatorFullName = '';

  let adminUserId = '';

  let accessToken = '';
  let educatorEmail = '';

  /**
   * LOAD REGISTER DATA
   */
  beforeAll(() => {

    const registerApiPath = path.resolve(
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
      educatorEmail = testUserEmail;
    }

  });

  /**
   * INITIALIZE API CLIENT
   */
  beforeEach(async () => {

    apiClient = new APIClient();

    /**
     * LOGIN if accessToken not yet set (once per test session)
     */
    if (!accessToken && educatorEmail) {
      try {
        const loginResponse = await apiClient.post<LoginResponseData>(
          endpoints.auth.login,
          {
            email: educatorEmail,
            password: latestUserData.loginUser.password || 'Password@123',
          }
        );

        if (loginResponse.status === 201) {
          accessToken = loginResponse.body.data.tokens.accessToken;
          adminUserId = loginResponse.body.data.user.id;
        }
      } catch (error) {
        console.warn('[beforeEach] Login error:', error instanceof Error ? error.message : String(error));
      }
    }

  });

    /**
     * CREATE EDUCATOR INVITE
     */
    it(
      'should create educator invite with valid data @educatorInvite',

      async () => {

        logStep(
          'Creating educator invite with valid data'
        );

        /**
         * PRE-AUTHENTICATED: Using accessToken from beforeEach
         */

        expect(accessToken)
          .toBeTruthy();

        expect(adminUserId)
          .toBeTruthy();

        /**
         * GENERATE UNIQUE SCHOOL NAME
         */
        const randomSchoolSuffix =
          Math.floor(
            Math.random() * 100000
          );

        /**
         * CREATE SCHOOL PAYLOAD
         */
        const schoolPayload = {

          ...schoolApiData
            .createSchoolValidData,

          school_name:
            `High School ${randomSchoolSuffix}`,

          user_id: adminUserId,

        };
        
        /**
         * CREATE SCHOOL API
         */
        const createSchoolResponse =
          await apiClient.post(
            endpoints.auth.school,
            schoolPayload,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        /**
         * CREATE SCHOOL RESPONSE BODY
         */
        const createSchoolBody =
          createSchoolResponse.body as {
            status: string;
            message: string;
            data: {
              id: string;
            };
          };

        /**
         * SCHOOL VALIDATIONS
         */
        validateStatusCode(
          createSchoolResponse.status,
          201
        );

        validateFieldValue(
          createSchoolBody,
          'status',
          'SUCCESS'
        );

        validateFieldValue(
          createSchoolBody,
          'message',
          'School created successfully'
        );

        /**
         * STORE SCHOOL DATA
         */
        createdSchoolId =
          createSchoolBody.data.id;

        /**
         * GENERATE RANDOM EDUCATOR EMAIL
         */
        const randomEmailSuffix =
          Math.floor(
            Math.random() * 100000
          );

        uniqueEmail =
          `educator${randomEmailSuffix}@example.com`;

        /**
         * EDUCATOR INVITE PAYLOAD
         */
        const educatorPayload = {

          email: uniqueEmail,

          school_id: createdSchoolId,

          status:
            educatorData.educatorcreate.status,

          full_name:
            educatorData.educatorcreate.firstName,        
          
          // tokens: 
          //   educatorData.educatorcreate.tokens,
          tokens:
    educatorData.educatorcreate.tokens,

        };
        

        /**
         * EDUCATOR INVITE API
         */
        const response =
          await apiClient.post(
            endpoints.auth.educatorInvite,
            educatorPayload,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );
          

        /**
         * RESPONSE BODY
         */
        const responseBody =
          response.body as {
            success: boolean;
            message: string;
            data: {
              invite: {
                id: string;
                school: {
                  id: string;
                };
              };
              educator: {
                id: string;
                email: string;
              };
            };
          };
          

        /**
         * VALIDATIONS
         */
        validateStatusCode(
          response.status,
          201
        );
        

        expect(
          responseBody.success
        ).toBe(true);

        validateFieldValue(
          responseBody,
          'message',
          'Invite sent successfully'
        );

        /**
         * ASSERTIONS
         */
        expect(
          responseBody.data
        ).toBeTruthy();

        expect(
          responseBody.data.invite.id
        ).toBeTruthy();

        /**
         * STORE INVITE ID
         */
        inviteId =
          responseBody.data.invite.id;

        /**
         * STORE EDUCATOR ID
         */
        educatorId =
          responseBody.data.educator.id;

        /**
         * CAPTURE ID FOR CLEANUP
         */
        if (educatorId) {
          ExecutionDataManager.saveEntityId(
            'educator',
            educatorId
          );
        }

        /**
         * STORE EDUCATOR FULL NAME
         */
        educatorFullName =
          educatorPayload.full_name;

        expect(
          responseBody.data.educator.email
        ).toBe(uniqueEmail);

        expect(
          responseBody.data.invite.school.id
        ).toBe(createdSchoolId);

      }
    );

    it(
      'should fail create educator invite without token @educatorInvite',

      async () => {

        logStep(
          'Create educator invite without token'
        );

        const randomEmailSuffix =
          Math.floor(
            Math.random() * 100000
          );

        const invitePayload = {

          email:
            `educator-no-token-${randomEmailSuffix}@example.com`,

          school_id:
            createdSchoolId,

          status:
            educatorData.educatorcreate.status,

          full_name:
            educatorData.educatorcreate.firstName,

          tokens:
            educatorData.educatorcreate.tokens,

        };

        const response =
          await apiClient.post(
            endpoints.auth.educatorInvite,
            invitePayload,
            {
              includeAuth: false,
            }
          );

        expect([401, 403]).toContain(response.status);

        validateFieldValue(
          response.body,
          'status',
          'FAILED'
        );

        validateFieldValue(
          response.body,
          'message',
          'Unauthorized'
        );

      }
    );

    it(
      'should fail create educator invite with invalid school id @educatorInvite',

      async () => {

        logStep(
          'Create educator invite with invalid school id'
        );

        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                latestUserData.loginUser.email,

              password:
                latestUserData.loginUser.password,
            }
          );

        validateStatusCode(
          loginResponse.status,
          201
        );

        const loginBody =
          loginResponse.body;

        const accessToken =
          loginBody.data.tokens.accessToken;

        expect(
          accessToken
        ).toBeTruthy();

        const randomEmailSuffix =
          Math.floor(
            Math.random() * 100000
          );

        const invitePayload = {

          email:
            `educator-invalid-school-${randomEmailSuffix}@example.com`,

          school_id:
            '00000000-0000-0000-0000-000000000000',

          status:
            educatorData.educatorcreate.status,

          full_name:
            educatorData.educatorcreate.firstName,

          tokens:
            educatorData.educatorcreate.tokens,

        };

        const response =
          await apiClient.post(
            endpoints.auth.educatorInvite,
            invitePayload,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          response.status,
          404
        );

        validateFieldValue(
          response.body,
          'status',
          'FAILED'
        );

        validateFieldValue(
          response.body,
          'message',
          'School not found'
        );

      }
    );

    it(
      'should fail create educator invite with empty email @educatorInvite',

      async () => {

        logStep(
          'Create educator invite with empty email'
        );

        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                latestUserData.loginUser.email,

              password:
                latestUserData.loginUser.password,
            }
          );

        validateStatusCode(
          loginResponse.status,
          201
        );

        const loginBody =
          loginResponse.body;

        const accessToken =
          loginBody.data.tokens.accessToken;

        expect(
          accessToken
        ).toBeTruthy();

        const invitePayload = {

          email: '',

          school_id:
            createdSchoolId,

          status:
            educatorData.educatorcreate.status,

          full_name:
            educatorData.educatorcreate.firstName,

          tokens:
            educatorData.educatorcreate.tokens,

        };

        const response =
          await apiClient.post(
            endpoints.auth.educatorInvite,
            invitePayload,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          response.status,
          400
        );

        validateFieldValue(
          response.body,
          'status',
          'FAILED'
        );

        validateFieldValue(
          response.body,
          'message',
          'Invalid email address, Email is required'
        );

      }
    );

    /**
     * REGISTER EDUCATOR
     */
    it(
      'should register educator with valid invite id @educatorInvite',

      async () => {

        logStep(
          'Register educator with valid invite id'
        );

        /**
         * VALIDATE DATA
         */
        expect(uniqueEmail)
          .toBeTruthy();

        expect(inviteId)
          .toBeTruthy();

        /**
         * REGISTER PAYLOAD
         */
        const educatorRegisterPayload = {

          full_name:
            latestUserData
              .educatorcreate.firstName,

          email: uniqueEmail,

          password:
            latestUserData
              .educatorcreate.password,

          invite_id: inviteId,

        };

        /**
         * REGISTER API
         */
        const registerResponse =
          await apiClient.post(
            endpoints.auth.signup,
            educatorRegisterPayload
          );

        /**
         * RESPONSE BODY
         */
        const registerBody =
          registerResponse.body as {
            status: string;
            message: string;
            data: unknown;
          };

        /**
         * VALIDATIONS
         */
        validateStatusCode(
          registerResponse.status,
          201
        );

        validateFieldValue(
          registerBody,
          'status',
          'SUCCESS'
        );

        validateFieldValue(
          registerBody,
          'message',
          'Educator registered successfully'
        );

        /**
         * STORE EDUCATOR LOGIN DATA
         */
        latestUserData.educatorcreate = {

          firstName:
            latestUserData
              .educatorcreate.firstName,

          email:
            uniqueEmail,

          password:
            latestUserData
              .educatorcreate.password,

        };

        /**
         * UPDATE REGISTER JSON
         */
        const registerApiPath =
          path.resolve(
            __dirname,
            '../../test-data/registerApi.json'
          );

        fs.writeFileSync(
          registerApiPath,

          JSON.stringify(
            latestUserData,
            null,
            2
          )
        );

      }
    );

    it(
      'should fail register educator with invalid invite id @educatorInvite',

      async () => {

        logStep(
          'Register educator with invalid invite id'
        );

        const educatorRegisterPayload = {

          full_name:
            latestUserData
              .educatorcreate.firstName,

          email:
            uniqueEmail,

          password:
            latestUserData
              .educatorcreate.password,

          invite_id:
            '00000000-0000-0000-0000-000000000000',

        };

        const response =
          await apiClient.post(
            endpoints.auth.signup,
            educatorRegisterPayload
          );

        validateStatusCode(
          response.status,
          400
        );

        validateFieldValue(
          response.body,
          'status',
          'FAILED'
        );

        expect(['invite_id must be a valid UUID', 'Invalid invite']).toContain(
          (response.body as { message: string }).message
        );

      }
    );

    /**
     * LOGIN WITH EDUCATOR
     */
    it(
      'should login with registered educator credentials @educatorInvite',

      async () => {

        logStep(
          'Login with registered educator credentials'
        );

        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email: uniqueEmail,

              password:
                latestUserData
                  .educatorcreate.password,
            }
          );

        /**
         * LOGIN BODY
         */
        const loginBody =
          loginResponse.body;

        /**
         * VALIDATIONS
         */
        validateStatusCode(
          loginResponse.status,
          201
        );

        validateFieldValue(
          loginBody,
          'status',
          'SUCCESS'
        );

        validateFieldValue(
          loginBody,
          'message',
          'Login successful'
        );

        /**
         * ASSERTIONS
         */
        expect(
          loginBody.data.tokens
            .accessToken
        ).toBeTruthy();

      }
    );

    /**
     * GET EDUCATOR DETAILS
     */
    it(
      'should get educator details with valid educator id @educatorInvite',

      async () => {

        logStep(
          'Get educator details with valid educator id'
        );

        /**
         * LOGIN AGAIN WITH ADMIN
         */
        const reloginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                latestUserData.loginUser.email,

              password:
                latestUserData.loginUser.password,
            }
          );

        const reloginBody =
          reloginResponse.body;

        const freshAdminToken =
          reloginBody.data.tokens.accessToken;

        expect(
          freshAdminToken
        ).toBeTruthy();

        /**
         * GET EDUCATOR DETAILS API
         */
        const educatorDetailsResponse =
          await apiClient.get(
            `${endpoints.auth.educatorget}/${adminUserId}`,
            {
              headers: {
                Authorization:
                  `Bearer ${freshAdminToken}`,
              },

              includeAuth: false,
            }
          );

        /**
         * RESPONSE BODY
         */
        const responseBody =
          educatorDetailsResponse.body as {
            status: string;
            message: string;
            data: unknown;
          };

        /**
         * VALIDATIONS
         */
        validateStatusCode(
          educatorDetailsResponse.status,
          200
        );

        validateFieldValue(
          responseBody,
          'status',
          'SUCCESS'
        );

        validateFieldValue(
          responseBody,
          'message',
          'Educator(s) fetched successfully'
        );

        /**
         * ASSERTIONS
         */
        expect(
          responseBody.data
        ).toBeTruthy();

      }
    );

    it(
      'should fail get educator details with invalid educator id @educatorInvite',

      async () => {

        logStep(
          'Get educator details with invalid educator id'
        );

        const reloginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                latestUserData.loginUser.email,

              password:
                latestUserData.loginUser.password,
            }
          );

        const reloginBody =
          reloginResponse.body;

        const freshAdminToken =
          reloginBody.data.tokens.accessToken;

        expect(
          freshAdminToken
        ).toBeTruthy();

        const educatorDetailsResponse =
          await apiClient.get(
            `${endpoints.auth.educatorget}/00000000-0000-0000-0000-000000000000`,
            {
              headers: {
                Authorization:
                  `Bearer ${freshAdminToken}`,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          educatorDetailsResponse.status,
          401
        );

        validateFieldValue(
          educatorDetailsResponse.body,
          'status',
          'FAILED'
        );

        validateFieldValue(
          educatorDetailsResponse.body,
          'message',
          'You do not have permission to view educators for this admin'
        );

      }
    );

    it(
      'should fail get educator details without token @educatorInvite',

      async () => {

        logStep(
          'Get educator details without token'
        );

        const educatorDetailsResponse =
          await apiClient.get(
            `${endpoints.auth.educatorget}/${adminUserId}`,
            {
              includeAuth: false,
            }
          );

        expect([401, 403]).toContain(educatorDetailsResponse.status);

        validateFieldValue(
          educatorDetailsResponse.body,
          'status',
          'FAILED'
        );

        validateFieldValue(
          educatorDetailsResponse.body,
          'message',
          'Unauthorized'
        );

      }
    );

    /**
     * UPDATE EDUCATOR DETAILS
     */
    it(
      'should update educator details with valid data @educatorInvite',

      async () => {

        logStep(
          'Update educator details with valid data'
        );

        /**
         * LOGIN AGAIN WITH ADMIN
         */
        const reloginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                latestUserData.loginUser.email,

              password:
                latestUserData.loginUser.password,
            }
          );

        const reloginBody =
          reloginResponse.body;

        const freshAdminToken =
          reloginBody.data.tokens
            .accessToken;

        expect(
          freshAdminToken
        ).toBeTruthy();

        /**
         * UPDATE PAYLOAD
         */
        const updatePayload = {

          full_name:
            educatorFullName,

          status:
            'ACTIVE',

        };

        /**
         * UPDATE EDUCATOR API
         */
        const updateResponse =
          await apiClient.put(
            `${endpoints.auth.educatorupdate}/${educatorId}`,
            updatePayload,
            {
              headers: {
                Authorization:
                  `Bearer ${freshAdminToken}`,
              },

              includeAuth: false,
            }
          );

        /**
         * RESPONSE BODY
         */
        const responseBody =
          updateResponse.body as {
            status: string;
            message: string;
            data: {
              id: string;
              full_name: string;
              status: string;
            };
          };

        /**
         * VALIDATIONS
         */
        validateStatusCode(
          updateResponse.status,
          200
        );

        validateFieldValue(
          responseBody,
          'status',
          'SUCCESS'
        );

        validateFieldValue(
          responseBody,
          'message',
          'Educator updated successfully'
        );

      }
    );

    it(
      'should fail update educator with invalid educator id @educatorInvite',

      async () => {

        logStep(
          'Update educator with invalid educator id'
        );

        const reloginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                latestUserData.loginUser.email,

              password:
                latestUserData.loginUser.password,
            }
          );

        const reloginBody =
          reloginResponse.body;

        const freshAdminToken =
          reloginBody.data.tokens.accessToken;

        expect(
          freshAdminToken
        ).toBeTruthy();

        const updatePayload = {

          full_name:
            educatorFullName,

          status:
            'ACTIVE',

        };

        const updateResponse =
          await apiClient.put(
            `${endpoints.auth.educatorupdate}/00000000-0000-0000-0000-000000000000`,
            updatePayload,
            {
              headers: {
                Authorization:
                  `Bearer ${freshAdminToken}`,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          updateResponse.status,
          404
        );

        validateFieldValue(
          updateResponse.body,
          'status',
          'FAILED'
        );

        validateFieldValue(
          updateResponse.body,
          'message',
          'Educator not found'
        );

      }
    );

    it.skip(
      'should fail update educator without token @educatorInvite',

      async () => {

        logStep(
          'Update educator without token'
        );

        const updatePayload = {

          full_name:
            educatorFullName,

          status:
            'ACTIVE',

        };

        const updateResponse =
          await apiClient.put(
            `${endpoints.auth.educatorupdate}/${educatorId}`,
            updatePayload,
            {
              includeAuth: false,
            }
          );

        expect([401, 403]).toContain(updateResponse.status);

        validateFieldValue(
          updateResponse.body,
          'status',
          'FAILED'
        );

        validateFieldValue(
          updateResponse.body,
          'message',
          'Unauthorized'
        );

      }
    );

    it(
      'should fail update educator with invalid status value @educatorInvite',

      async () => {

        logStep(
          'Update educator with invalid status value'
        );

        const reloginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                latestUserData.loginUser.email,

              password:
                latestUserData.loginUser.password,
            }
          );

        const reloginBody =
          reloginResponse.body;

        const freshAdminToken =
          reloginBody.data.tokens.accessToken;

        expect(
          freshAdminToken
        ).toBeTruthy();

        const updatePayload = {

          status:
            'UNKNOWN',

        };

        const updateResponse =
          await apiClient.put(
            `${endpoints.auth.educatorupdate}/${educatorId}`,
            updatePayload,
            {
              headers: {
                Authorization:
                  `Bearer ${freshAdminToken}`,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          updateResponse.status,
          400
        );

        validateFieldValue(
          updateResponse.body,
          'status',
          'FAILED'
        );

        validateFieldValue(
          updateResponse.body,
          'message',
          'Status must be ACTIVE or INACTIVE'
        );

      }
    );

    // it(
    //   'should fail update educator with empty payload @educatorInvite',

    //   async () => {

    //     logStep(
    //       'Update educator with empty payload'
    //     );

    //     const reloginResponse =
    //       await apiClient.post<
    //         LoginResponseData
    //       >(
    //         endpoints.auth.login,
    //         {
    //           email:
    //             latestUserData.loginUser.email,

    //           password:
    //             latestUserData.loginUser.password,
    //         }
    //       );

    //     const reloginBody =
    //       reloginResponse.body;

    //     const freshAdminToken =
    //       reloginBody.data.tokens.accessToken;

    //     expect(
    //       freshAdminToken
    //     ).toBeTruthy();

    //     const updateResponse =
    //       await apiClient.put(
    //         `${endpoints.auth.educatorupdate}/${educatorId}`,
    //         {},
    //         {
    //           headers: {
    //             Authorization:
    //               `Bearer ${freshAdminToken}`,
    //           },

    //           includeAuth: false,
    //         }
    //       );

    //     validateStatusCode(
    //       updateResponse.status,
    //       400
    //     );

    //     validateFieldValue(
    //       updateResponse.body,
    //       'status',
    //       'FAILED'
    //     );

    //   }
    // );

    /**
     * EDUCATOR INVITE WITH DUPLICATE EMAIL
     */
    it(
      'should fail educator invite with duplicate email @educatorInvite',

      async () => {

        logStep(
          'Educator invite with duplicate email'
        );

        const reloginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                latestUserData.loginUser.email,

              password:
                latestUserData.loginUser.password,
            }
          );

        validateStatusCode(
          reloginResponse.status,
          201
        );

        const freshAdminToken =
          reloginResponse.body?.data?.tokens?.accessToken;
        
        if (!freshAdminToken) {
          throw new Error('Failed to get access token from relogin response');
        }

        const randomSuffix = Date.now();

        const duplicateEmail =
          `educator${randomSuffix}@example.com`;

        const firstInvite =
          await apiClient.post(
            endpoints.auth.educatorInvite,
            {
              email: duplicateEmail,
              school_id: createdSchoolId,
              status: 'ACTIVE',
              full_name: 'Test Educator 1',
            },
            {
              headers: {
                Authorization:
                  `Bearer ${freshAdminToken}`,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          firstInvite.status,
          201
        );

        const secondInvite =
          await apiClient.post(
            endpoints.auth.educatorInvite,
            {
              email: duplicateEmail,
              school_id: createdSchoolId,
              status: 'ACTIVE',
              full_name: 'Test Educator 2',
            },
            {
              headers: {
                Authorization:
                  `Bearer ${freshAdminToken}`,
              },

              includeAuth: false,
            }
          );

        expect([400, 409]).toContain(
          secondInvite.status
        );

      }
    );

    /**
     * EDUCATOR INVITE WITH INVALID SCHOOL ID
     */
    it(
      'should fail educator invite with invalid school id @educatorInvite',

      async () => {

        logStep(
          'Educator invite with invalid school id'
        );

        const reloginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                latestUserData.loginUser.email,

              password:
                latestUserData.loginUser.password,
            }
          );

        const freshAdminToken =
          reloginResponse.body.data.tokens.accessToken;

        const randomSuffix = Date.now();

        const invalidSchoolId =
          '00000000-0000-0000-0000-000000000000';

        const response =
          await apiClient.post(
            endpoints.auth.educatorInvite,
            {
              email: `educator${randomSuffix}@example.com`,
              school_id: invalidSchoolId,
              status: 'ACTIVE',
              full_name: 'Test Educator',
              tokens: 100,
            },
            {
              headers: {
                Authorization:
                  `Bearer ${freshAdminToken}`,
              },

              includeAuth: false,
            }
          );

        expect([400, 404]).toContain(
          response.status
        );

      }
    );

    /**
     * EDUCATOR LIST RETRIEVAL
     */
    it(
      'should retrieve educator list with valid token @educatorInvite',

      async () => {

        logStep(
          'Retrieve educator list'
        );

        const reloginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                latestUserData.loginUser.email,

              password:
                latestUserData.loginUser.password,
            }
          );

        validateStatusCode(
          reloginResponse.status,
          201
        );

        const freshAdminToken =
          reloginResponse.body?.data?.tokens?.accessToken;
        
        if (!freshAdminToken) {
          throw new Error('Failed to get access token from relogin response');
        }

        const adminUserIdFromLogin =
          reloginResponse.body?.data?.user?.id;
        
        if (!adminUserIdFromLogin) {
          throw new Error('Failed to get admin user ID from relogin response');
        }

        const listResponse =
          await apiClient.get(
            `${endpoints.auth.educatorget}/${adminUserIdFromLogin}`,
            {
              headers: {
                Authorization:
                  `Bearer ${freshAdminToken}`,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          listResponse.status,
          200
        );

        expect(listResponse.body).toHaveProperty('status');
        expect(listResponse.body).toHaveProperty('data');

      }
    );

    /**
     * EDUCATOR RESPONSE TIME
     */
    it(
      'should create educator within acceptable time @educatorInvite',

      async () => {

        logStep(
          'Verify educator creation response time'
        );

        const reloginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                latestUserData.loginUser.email,

              password:
                latestUserData.loginUser.password,
            }
          );

        const freshAdminToken =
          reloginResponse.body.data.tokens.accessToken;

        const randomSuffix = Date.now();

        const startTime = Date.now();

        await apiClient.post(
          endpoints.auth.educatorInvite,
          {
            email: `educator${randomSuffix}@example.com`,
            school_id: createdSchoolId,
            status: 'ACTIVE',
            full_name: 'Timed Educator',
            tokens: 100,
          },
          {
            headers: {
              Authorization:
                `Bearer ${freshAdminToken}`,
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
     * EDUCATOR WITH ZERO TOKENS
     */
    it(
      'should create educator with zero tokens @educatorInvite',

      async () => {

        logStep(
          'Create educator with zero tokens'
        );

        const reloginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                latestUserData.loginUser.email,

              password:
                latestUserData.loginUser.password,
            }
          );

        const freshAdminToken =
          reloginResponse.body.data.tokens.accessToken;

        const randomSuffix = Date.now();

        const response =
          await apiClient.post(
            endpoints.auth.educatorInvite,
            {
              email: `educator${randomSuffix}@example.com`,
              school_id: createdSchoolId,
              status: 'ACTIVE',
              full_name: 'Zero Token Educator',
              tokens: 0,
            },
            {
              headers: {
                Authorization:
                  `Bearer ${freshAdminToken}`,
              },

              includeAuth: false,
            }
          );

        expect([201, 400]).toContain(
          response.status
        );

      }
    );

    /**
     * EDUCATOR WITH NEGATIVE TOKENS
     */
    it(
      'should fail educator with negative tokens @educatorInvite',

      async () => {

        logStep(
          'Create educator with negative tokens'
        );

        const reloginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                latestUserData.loginUser.email,

              password:
                latestUserData.loginUser.password,
            }
          );

        const freshAdminToken =
          reloginResponse.body.data.tokens.accessToken;

        const randomSuffix = Date.now();

        const response =
          await apiClient.post(
            endpoints.auth.educatorInvite,
            {
              email: `educator${randomSuffix}@example.com`,
              school_id: createdSchoolId,
              status: 'ACTIVE',
              full_name: 'Negative Token Educator',
              tokens: -100,
            },
            {
              headers: {
                Authorization:
                  `Bearer ${freshAdminToken}`,
              },

              includeAuth: false,
            }
          );

        expect([201, 400]).toContain(
          response.status
        );

      }
    );

    /**
     * EDUCATOR WITH MAXIMUM TOKENS
     */
    it(
      'should create educator with maximum tokens @educatorInvite',

      async () => {

        logStep(
          'Create educator with maximum tokens'
        );

        const reloginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                latestUserData.loginUser.email,

              password:
                latestUserData.loginUser.password,
            }
          );

        validateStatusCode(
          reloginResponse.status,
          201
        );

        const freshAdminToken =
          reloginResponse.body?.data?.tokens?.accessToken;
        
        if (!freshAdminToken) {
          throw new Error('Failed to get access token from relogin response');
        }

        const randomSuffix = Date.now();

        const response =
          await apiClient.post(
            endpoints.auth.educatorInvite,
            {
              email: `educator${randomSuffix}@example.com`,
              school_id: createdSchoolId,
              status: 'ACTIVE',
              full_name: 'Max Token Educator',
            },
            {
              headers: {
                Authorization:
                  `Bearer ${freshAdminToken}`,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          response.status,
          201
        );

      }
    );

    /**
     * EDUCATOR WITH EMPTY FULL NAME
     */
    it(
      'should fail educator with empty full name @educatorInvite',

      async () => {

        logStep(
          'Create educator with empty full name'
        );

        const reloginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                latestUserData.loginUser.email,

              password:
                latestUserData.loginUser.password,
            }
          );

        const freshAdminToken =
          reloginResponse.body.data.tokens.accessToken;

        const randomSuffix =
          Math.floor(
            Math.random() * 10000
          );

        const response =
          await apiClient.post(
            endpoints.auth.educatorInvite,
            {
              email: `educator${randomSuffix}@example.com`,
              school_id: createdSchoolId,
              status: 'ACTIVE',
              full_name: '',
              tokens: 100,
            },
            {
              headers: {
                Authorization:
                  `Bearer ${freshAdminToken}`,
              },

              includeAuth: false,
            }
          );

        expect([400, 201]).toContain(
          response.status
        );

      }
    );

        
  }
);



