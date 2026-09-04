// school module test file

import { APIClient } from '../../utils/apiClient';

import { endpoints } from '../../utils/endpoints';

import { logStep } from '../../utils/logger';

import {
  validateStatusCode,
  validateFieldValue,
} from '../../utils/responseValidator';

import { describe, it, beforeAll, beforeEach, expect } from '@jest/globals';

import fs from 'fs';

import path from 'path';

import rawSchoolApiData
from '../../test-data/schoolApi.json';

import type {
  RegisterApiTestData,
  LoginResponseData,
} from '../../types/api.types';

import { ExecutionDataManager } from '../../utils/executionDataManager';

/**
 * SCHOOL API DATA TYPE
 */
interface SchoolApiData {

  createSchoolValidData: {
    school_name: string;
    user_id?: string;
  };

  createSchoolInvalidData: {
    school_name?: string;
    user_id?: string;
  };

  inactiveschool: {
    status: string;
  };

}

/**
 * SCHOOL RESPONSE TYPE
 */
interface SchoolResponse {

  status: string;

  message: string;

  data: {
    id?: string;
    status?: string;
  };

}

/**
 * SCHOOL LIST RESPONSE
 */
interface SchoolListResponse {

  status: string;

  message: string;

  data: unknown[];

}

const schoolApiData =
  rawSchoolApiData as SchoolApiData;

/**
 * Reality Works - School Module API Tests
 * @tag @school
 */

describe(
  'School Module API Tests',
  () => {

    let apiClient: APIClient;

    let latestUserData:
      RegisterApiTestData;

    let createdSchoolId: string;


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
      }

    });

    beforeEach(() => {

      /**
       * INITIALIZE API CLIENT
       */
      apiClient = new APIClient();

    });

    /**
     * CREATE SCHOOL
     */
    it(
      'should create a new school @school',

      async () => {

        logStep(
          'Create a new school with valid data'
        );

        /**
         * LOGIN API
         */
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
         * ACCESS TOKEN
         */
        const accessToken =
          loginBody.data.tokens.accessToken;

        /**
         * USER ID
         */
        const userId =
          loginBody.data.user.id;

        expect(accessToken)
          .toBeTruthy();

        expect(userId)
          .toBeTruthy();

        /**
         * SCHOOL PAYLOAD
         */
        const schoolData = {
  ...schoolApiData.createSchoolValidData,

  school_name: `${schoolApiData.createSchoolValidData.school_name}-${Date.now()}`,

  user_id: userId,
};

        /**
         * CREATE SCHOOL API
         */
        const response =
          await apiClient.post(
            endpoints.auth.school,
            schoolData,
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
          response.body as SchoolResponse;

        /**
         * VALIDATIONS
         */
        validateStatusCode(
          response.status,
          201
        );

        validateFieldValue(
          responseBody,
          'status',
          'SUCCESS'
        );

        validateFieldValue(
          responseBody,
          'message',
          'School created successfully'
        );

        /**
         * STORE SCHOOL ID
         */
        createdSchoolId =
          responseBody.data.id ?? '';

        /**
         * CAPTURE ID FOR CLEANUP
         */
        if (createdSchoolId) {
          ExecutionDataManager.saveEntityId(
            'school',
            createdSchoolId
          );
        }

        /**
         * ASSERTIONS
         */
        expect(
          responseBody.data
        ).toBeTruthy();

        expect(
          responseBody.data.id
        ).toBeTruthy();

      }
    );

    /**
     * INVALID SCHOOL CREATE
     */
    it(
      'should fail to create a school with invalid data @school',

      async () => {

        logStep(
          'Create school with invalid data'
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

        const loginBody =
          loginResponse.body;

        const accessToken =
          loginBody.data.tokens.accessToken;

        const userId =
          loginBody.data.user.id;

        /**
         * INVALID PAYLOAD
         */
        const invalidSchoolData = {

          ...schoolApiData
            .createSchoolInvalidData,

          user_id: userId,

        };

        /**
         * CREATE INVALID SCHOOL
         */
        const response =
          await apiClient.post(
            endpoints.auth.school,
            invalidSchoolData,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as SchoolResponse;

        validateStatusCode(
          response.status,
          400
        );

        validateFieldValue(
          responseBody,
          'status',
          'FAILED'
        );

        expect(
          responseBody.data
        ).toBeFalsy();

      }
    );

    /**
     * CREATE SCHOOL WITHOUT TOKEN
     */
    it(
      'should fail to create school without token @school',

      async () => {

        logStep(
          'Create school without token'
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

        const loginBody =
          loginResponse.body;

        const userId =
          loginBody.data.user.id;

        const schoolData = {

          ...schoolApiData
            .createSchoolValidData,

          user_id: userId,

        };

        const response =
          await apiClient.post(
            endpoints.auth.school,
            schoolData,
            {
              includeAuth: false,
            }
          );

        const responseBody =
          response.body as SchoolResponse;

        validateStatusCode(
          response.status,
          401
        );

        validateFieldValue(
          responseBody,
          'status',
          'FAILED'
        );

        validateFieldValue(
          responseBody,
          'message',
          'Unauthorized'
        );

      }
    );

    /**
     * CREATE SCHOOL WITH INVALID TOKEN
     */
    it(
      'should fail to create school with invalid token @school',

      async () => {

        logStep(
          'Create school with invalid token'
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

        const loginBody =
          loginResponse.body;

        const userId =
          loginBody.data.user.id;

        const schoolData = {

          ...schoolApiData
            .createSchoolValidData,

          user_id: userId,

        };

        const response =
          await apiClient.post(
            endpoints.auth.school,
            schoolData,
            {
              headers: {
                Authorization:
                  `Bearer invalidtoken`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as SchoolResponse;

        validateStatusCode(
          response.status,
          401
        );

        validateFieldValue(
          responseBody,
          'status',
          'FAILED'
        );

        validateFieldValue(
          responseBody,
          'message',
          'Unauthorized'
        );

      }
    );

    /**
     * CREATE SCHOOL WITH EMPTY SCHOOL NAME
     */
    it(
      'should fail to create school with empty school name @school',

      async () => {

        logStep(
          'Create school with empty school name'
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

        const loginBody =
          loginResponse.body;

        const accessToken =
          loginBody.data.tokens.accessToken;

        const userId =
          loginBody.data.user.id;

        const schoolData = {

          ...schoolApiData
            .createSchoolValidData,

          school_name: '',
          user_id: userId,

        };

        const response =
          await apiClient.post(
            endpoints.auth.school,
            schoolData,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as SchoolResponse;

        validateStatusCode(
          response.status,
          400
        );

        validateFieldValue(
          responseBody,
          'status',
          'FAILED'
        );

      }
    );

    /**
     * CREATE SCHOOL WITH INVALID USER ID
     */
    it(
      'should fail to create school with invalid user id @school',

      async () => {

        logStep(
          'Create school with invalid user id'
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

        const loginBody =
          loginResponse.body;

        const accessToken =
          loginBody.data.tokens.accessToken;

        const schoolData = {

          ...schoolApiData
            .createSchoolValidData,

          user_id: 'invalid-user-id',

        };

        const response =
          await apiClient.post(
            endpoints.auth.school,
            schoolData,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as SchoolResponse;

        validateStatusCode(
          response.status,
          400
        );

        validateFieldValue(
          responseBody,
          'status',
          'FAILED'
        );

      }
    );

    /**
     * CREATE DUPLICATE SCHOOL
     */
    it(
  'should fail to create duplicate school @school',

  async () => {

    logStep(
      'Create duplicate school'
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

    const loginBody =
      loginResponse.body;

    const accessToken =
      loginBody.data.tokens.accessToken;

    const userId =
      loginBody.data.user.id;

    /**
     * CREATE UNIQUE SCHOOL NAME
     */
    const duplicateSchoolName =
      `Duplicate-School-${Date.now()}`;

    const schoolData = {

      ...schoolApiData.createSchoolValidData,

      school_name:
        duplicateSchoolName,

      user_id:
        userId,

    };

    /**
     * FIRST CREATE
     */
    const firstResponse =
      await apiClient.post(
        endpoints.auth.school,
        schoolData,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },

          includeAuth: false,
        }
      );

    validateStatusCode(
      firstResponse.status,
      201
    );

    /**
     * SECOND CREATE WITH SAME NAME
     */
    const duplicateResponse =
      await apiClient.post(
        endpoints.auth.school,
        schoolData,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },

          includeAuth: false,
        }
      );

    const responseBody =
      duplicateResponse.body as SchoolResponse;

    validateStatusCode(
      duplicateResponse.status,
      400
    );

    validateFieldValue(
      responseBody,
      'status',
      'FAILED'
    );

    validateFieldValue(
      responseBody,
      'message',
      'School already exists'
    );

    expect(
      responseBody.data
    ).toBeNull();

  }
);

    /**
     * GET SCHOOLS
     */
    it(
      'should retrieve schools for the authenticated user @school',

      async () => {

        logStep(
          'Retrieve schools'
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

        const loginBody =
          loginResponse.body;

        const accessToken =
          loginBody.data.tokens.accessToken;

        /**
         * GET SCHOOLS API
         */
        const response =
          await apiClient.get(
            endpoints.auth.schoolget,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as SchoolListResponse;

        validateStatusCode(
          response.status,
          200
        );

        validateFieldValue(
          responseBody,
          'status',
          'SUCCESS'
        );

        expect(
          Array.isArray(
            responseBody.data
          )
        ).toBe(true);

      }
    );

    /**
     * GET SCHOOLS WITHOUT TOKEN
     */
    it(
      'should fail to retrieve schools without token @school',

      async () => {

        logStep(
          'Retrieve schools without token'
        );

        const response =
          await apiClient.get(
            endpoints.auth.schoolget,
            {
              includeAuth: false,
            }
          );

        const responseBody =
          response.body as SchoolResponse;

        validateStatusCode(
          response.status,
          401
        );

        validateFieldValue(
          responseBody,
          'status',
          'FAILED'
        );

        validateFieldValue(
          responseBody,
          'message',
          'Unauthorized'
        );

      }
    );

    /**
     * GET SCHOOLS WITH INVALID TOKEN
     */
    it(
      'should fail to retrieve schools with invalid token @school',

      async () => {

        logStep(
          'Retrieve schools with invalid token'
        );

        const response =
          await apiClient.get(
            endpoints.auth.schoolget,
            {
              headers: {
                Authorization:
                  `Bearer invalidtoken`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as SchoolResponse;

        validateStatusCode(
          response.status,
          401
        );

        validateFieldValue(
          responseBody,
          'status',
          'FAILED'
        );

        validateFieldValue(
          responseBody,
          'message',
          'Unauthorized'
        );

      }
    );

    /**
     * GET SCHOOL BY ID
     */
    it(
      'should retrieve a specific school by ID for the authenticated user @school',

      async () => {

        logStep(
          'Retrieve school by ID'
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

        const loginBody =
          loginResponse.body;

        const accessToken =
          loginBody.data.tokens.accessToken;

        /**
         * GET SCHOOL BY ID
         */
        const response =
          await apiClient.get(
            `${endpoints.auth.schoolgetbyid}${createdSchoolId}`,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as SchoolResponse;

        validateStatusCode(
          response.status,
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
          'School(s) fetched successfully'
        );

      }
    );

    /**
     * GET SCHOOL WITH INVALID ID
     */
    it(
      'should fail to retrieve school with invalid school id @school',

      async () => {

        logStep(
          'Retrieve school with invalid school id'
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

        const loginBody =
          loginResponse.body;

        const accessToken =
          loginBody.data.tokens.accessToken;

        const response =
          await apiClient.get(
            `${endpoints.auth.schoolgetbyid}invalid-school-id`,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as SchoolResponse;

        validateStatusCode(
          response.status,
          400
        );

        validateFieldValue(
          responseBody,
          'status',
          'FAILED'
        );
        validateFieldValue(
          responseBody,
          'message',
          'Invalid School ID format'
        );

      }
    );

    /**
     * GET SCHOOL BY ID WITHOUT TOKEN
     */
    it(
      'should fail to retrieve school by id without token @school',

      async () => {

        logStep(
          'Retrieve school by id without token'
        );

        const response =
          await apiClient.get(
            `${endpoints.auth.schoolgetbyid}${createdSchoolId}`,
            {
              includeAuth: false,
            }
          );

        const responseBody =
          response.body as SchoolResponse;

        validateStatusCode(
          response.status,
          401
        );

        validateFieldValue(
          responseBody,
          'status',
          'FAILED'
        );

        validateFieldValue(
          responseBody,
          'message',
          'Unauthorized'
        );

      }
    );

    /**
     * GET SCHOOL BY ID WITH INVALID TOKEN
     */
    it(
      'should fail to retrieve school by id with invalid token @school',

      async () => {

        logStep(
          'Retrieve school by id with invalid token'
        );

        const response =
          await apiClient.get(
            `${endpoints.auth.schoolgetbyid}${createdSchoolId}`,
            {
              headers: {
                Authorization:
                  `Bearer invalidtoken`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as SchoolResponse;

        validateStatusCode(
          response.status,
          401
        );

        validateFieldValue(
          responseBody,
          'status',
          'FAILED'
        );

        validateFieldValue(
          responseBody,
          'message',
          'Unauthorized'
        );

      }
    );

    /**
     * UPDATE SCHOOL WITH INVALID ID
     */
    it(
      'should fail to update school with invalid school id @school',

      async () => {

        logStep(
          'Update school with invalid school id'
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

        const loginBody =
          loginResponse.body;

        const accessToken =
          loginBody.data.tokens.accessToken;

        const updatePayload = {

          school_name:
            schoolApiData
              .createSchoolValidData
              .school_name,

          status:
            schoolApiData
              .inactiveschool
              .status,

        };

        const response =
          await apiClient.put(
            `${endpoints.auth.schoolgetbyid}invalid-school-id`,
            updatePayload,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as SchoolResponse;

        validateStatusCode(
          response.status,
          400
        );

        validateFieldValue(
          responseBody,
          'status',
          'FAILED'
        );

        validateFieldValue(
          responseBody,
          'message',
          'Invalid School ID format'
        );

      }
    );

    /**
     * UPDATE SCHOOL WITHOUT TOKEN
     */
    it(
      'should fail to update school without token @school',

      async () => {

        logStep(
          'Update school without token'
        );

        const updatePayload = {

          school_name:
            schoolApiData
              .createSchoolValidData
              .school_name,

        };

        const response =
          await apiClient.put(
            `${endpoints.auth.schoolgetbyid}${createdSchoolId}`,
            updatePayload,
            {
              includeAuth: false,
            }
          );

        const responseBody =
          response.body as SchoolResponse;

        validateStatusCode(
          response.status,
          401
        );

        validateFieldValue(
          responseBody,
          'status',
          'FAILED'
        );

        validateFieldValue(
          responseBody,
          'message',
          'Unauthorized'
        );

      }
    );

    /**
     * UPDATE SCHOOL WITH INVALID TOKEN
     */
    it(
      'should fail to update school with invalid token @school',

      async () => {

        logStep(
          'Update school with invalid token'
        );

        const updatePayload = {

          school_name:
            schoolApiData
              .createSchoolValidData
              .school_name,

        };

        const response =
          await apiClient.put(
            `${endpoints.auth.schoolgetbyid}${createdSchoolId}`,
            updatePayload,
            {
              headers: {
                Authorization:
                  `Bearer invalidtoken`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as SchoolResponse;

        validateStatusCode(
          response.status,
          401
        );

        validateFieldValue(
          responseBody,
          'status',
          'FAILED'
        );

        validateFieldValue(
          responseBody,
          'message',
          'Unauthorized'
        );

      }
    );

    /**
     * UPDATE SCHOOL WITH EMPTY PAYLOAD
     */
    it(
      'should fail to update school with empty payload @school',

      async () => {

        logStep(
          'Update school with empty payload'
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

        const loginBody =
          loginResponse.body;

        const accessToken =
          loginBody.data.tokens.accessToken;

        const updatePayload = {};

        const response =
          await apiClient.put(
            `${endpoints.auth.schoolgetbyid}${createdSchoolId}`,
            updatePayload,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as SchoolResponse;

        validateStatusCode(
          response.status,
          400
        );

        validateFieldValue(
          responseBody,
          'status',
          'FAILED'
        );

        validateFieldValue(
          responseBody,
          'message',
          'School name is too long (max 100 characters), School name is too short (min 3 characters), School name is required, Emojis are not allowed in school name, school_name must be a string'
        );

      }
    );

    /**
     * UPDATE SCHOOL WITH INVALID STATUS VALUE
     */
    it(
      'should fail to update school with invalid status value @school',

      async () => {

        logStep(
          'Update school with invalid status value'
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

        const loginBody =
          loginResponse.body;

        const accessToken =
          loginBody.data.tokens.accessToken;

        const updatePayload = {

          status: 'INVALID_STATUS',

        };

        const response =
          await apiClient.put(
            `${endpoints.auth.schoolgetbyid}${createdSchoolId}`,
            updatePayload,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as SchoolResponse;

        validateStatusCode(
          response.status,
          400
        );

        validateFieldValue(
          responseBody,
          'status',
          'FAILED'
        );

      }
    );

    /**
     * UPDATE SCHOOL
     */
    it(
      'Update the school details with valid data @school',

      async () => {

        logStep(
          'Update school details'
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

        const loginBody =
          loginResponse.body;

        const accessToken =
          loginBody.data.tokens.accessToken;

        /**
         * UPDATE PAYLOAD
         */
        const updateSchoolPayload = {

          school_name:
            schoolApiData
              .createSchoolValidData
              .school_name,

          status:
            schoolApiData
              .inactiveschool
              .status,

        };

        /**
         * UPDATE API
         */
        const response =
          await apiClient.put(
            `${endpoints.auth.schoolgetbyid}${createdSchoolId}`,
            updateSchoolPayload,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as SchoolResponse;

        validateStatusCode(
          response.status,
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
          'School updated successfully'
        );

      }
    );

    /**
     * RETRIEVE SCHOOL LIST
     */
    it(
      'should retrieve school list with valid token @school',

      async () => {

        logStep(
          'Retrieve school list'
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

        const accessToken =
          loginResponse.body.data.tokens.accessToken;

        const listResponse =
          await apiClient.get(
            endpoints.school.get,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
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
     * GET SCHOOL BY ID
     */
    it(
      'should get school details by valid id @school',

      async () => {

        logStep(
          'Get school details by ID'
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

        const accessToken =
          loginResponse.body.data.tokens.accessToken;

        const getResponse =
          await apiClient.get(
            `${endpoints.auth.schoolgetbyid}${createdSchoolId}`,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          getResponse.status,
          200
        );

        validateFieldValue(
          getResponse.body,
          'status',
          'SUCCESS'
        );

      }
    );

    /**
     * SCHOOL CREATION RESPONSE TIME
     */
    it(
      'should create school within acceptable time @school',

      async () => {

        logStep(
          'Verify school creation response time'
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

        const accessToken =
          loginResponse.body.data.tokens.accessToken;

        const startTime = Date.now();

        await apiClient.post(
          endpoints.school.create,
          {
            school_name: `Performance School ${Date.now()}`,
          },
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

        expect(responseTime).toBeLessThan(5000);

      }
    );

    /**
     * SCHOOL RESPONSE STRUCTURE VALIDATION
     */
    it(
      'should return correct response structure for school @school',

      async () => {

        logStep(
          'Verify school response structure'
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

        const accessToken =
          loginResponse.body.data.tokens.accessToken;

        const getResponse =
          await apiClient.get(
            `${endpoints.auth.schoolgetbyid}${createdSchoolId}`,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const body = getResponse.body as Record<string, unknown>;

        expect(body).toHaveProperty('status');
        expect(body).toHaveProperty('message');
        expect(body).toHaveProperty('data');
        const data = body.data as Record<string, unknown>;
        expect(data).toHaveProperty('id');
        expect(data).toHaveProperty('school_name');

      }
    );

    /**
     * FAIL GET SCHOOL WITH INVALID ID
     */
    it(
      'should fail to get school with invalid id @school',

      async () => {

        logStep(
          'Get school with invalid ID'
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

        const accessToken =
          loginResponse.body.data.tokens.accessToken;

        const invalidSchoolId =
          '00000000-0000-0000-0000-000000000000';

        const getResponse =
          await apiClient.get(
            `${endpoints.auth.schoolgetbyid}${invalidSchoolId}`,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        expect([400, 404]).toContain(
          getResponse.status
        );

      }
    );

    /**
     * GET SCHOOLS BY ADMIN ID — HAPPY PATH
     */
    it(
      'should retrieve schools for own admin id @school',

      async () => {

        logStep(
          'GET /schools/admin/:adminId — valid token, own admin id'
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

        const accessToken =
          loginResponse.body.data.tokens.accessToken;

        const adminId =
          loginResponse.body.data.user.id;

        expect(accessToken).toBeTruthy();
        expect(adminId).toBeTruthy();

        const response =
          await apiClient.get(
            `/schools/admin/${adminId}`,
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
          200
        );

        validateFieldValue(
          response.body,
          'status',
          'SUCCESS'
        );

        const body =
          response.body as Record<string, unknown>;

        expect(body).toHaveProperty('data');

      }
    );

    /**
     * GET SCHOOLS BY ADMIN ID — NO TOKEN
     */
    it(
      'should fail to retrieve schools by admin id without token @school',

      async () => {

        logStep(
          'GET /schools/admin/:adminId — no token'
        );

        const response =
          await apiClient.get(
            `/schools/admin/00000000-0000-0000-0000-000000000000`,
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

      }
    );

    /**
     * GET SCHOOLS BY ADMIN ID — DIFFERENT ADMIN (FORBIDDEN)
     */
    it(
      'should fail to retrieve schools for a different admin id @school',

      async () => {

        logStep(
          'GET /schools/admin/:adminId — forbidden (non-owner)'
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

        const accessToken =
          loginResponse.body.data.tokens.accessToken;

        const differentAdminId =
          '00000000-0000-0000-0000-000000000001';

        const response =
          await apiClient.get(
            `/schools/admin/${differentAdminId}`,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        expect([400, 403, 404]).toContain(response.status);

        validateFieldValue(
          response.body,
          'status',
          'FAILED'
        );

      }
    );

  }
);

//DELETE /schools/:id 

describe(
  'DELETE /schools/:id — gap coverage',
  () => {

    let apiClient: APIClient;
    let latestUserData: RegisterApiTestData;

    beforeAll(() => {
      const registerApiPath = path.resolve(__dirname, '../../test-data/registerApi.json');
      latestUserData = JSON.parse(fs.readFileSync(registerApiPath, 'utf-8')) as RegisterApiTestData;
    });

    beforeEach(() => {
      apiClient = new APIClient();
    });

    it(
      'should return 404 when deleting a non-existent school id @school',
      async () => {
        logStep('DELETE /schools/:id — non-existent id');

        const loginResponse = await apiClient.post<LoginResponseData>(
          endpoints.auth.login,
          {
            email: latestUserData.loginUser.email,
            password: latestUserData.loginUser.password,
          }
        );

        validateStatusCode(loginResponse.status, 201);
        const accessToken = loginResponse.body.data.tokens.accessToken;

        const nonExistentId = '00000000-0000-0000-0000-000000000099';

        const response = await apiClient.delete(
          `${endpoints.auth.schoolgetbyid}${nonExistentId}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            includeAuth: false,
          }
        );

        expect([404, 400]).toContain(response.status);
        validateFieldValue(response.body, 'status', 'FAILED');
      }
    );

    it(
      'should return 400 when deleting with invalid school id format @school',
      async () => {
        logStep('DELETE /schools/:id — invalid id format');

        const loginResponse = await apiClient.post<LoginResponseData>(
          endpoints.auth.login,
          {
            email: latestUserData.loginUser.email,
            password: latestUserData.loginUser.password,
          }
        );

        validateStatusCode(loginResponse.status, 201);
        const accessToken = loginResponse.body.data.tokens.accessToken;

        const response = await apiClient.delete(
          `${endpoints.auth.schoolgetbyid}invalid-school-id`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            includeAuth: false,
          }
        );

        expect([400, 404]).toContain(response.status);
        validateFieldValue(response.body, 'status', 'FAILED');
      }
    );

    it(
      'should return 401 when deleting school with invalid token @school',
      async () => {
        logStep('DELETE /schools/:id — invalid token');

        const response = await apiClient.delete(
          `${endpoints.auth.schoolgetbyid}00000000-0000-0000-0000-000000000099`,
          {
            headers: { Authorization: 'Bearer invalidtoken' },
            includeAuth: false,
          }
        );

        validateStatusCode(response.status, 401);
        validateFieldValue(response.body, 'status', 'FAILED');
        validateFieldValue(response.body, 'message', 'Unauthorized');
      }
    );

  }
);


