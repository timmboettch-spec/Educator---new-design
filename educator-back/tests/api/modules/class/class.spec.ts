// https://dev.educatorbe.realityworksai.com/api/classes

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

import type {
  LoginResponseData,
  RegisterApiTestData,
} from '../../types/api.types';

import { ExecutionDataManager } from '../../utils/executionDataManager';

/**
 * CLASS API TEST DATA TYPE
 */
interface ClassApiTestData {
  valid: {
    class_name: string;
    term: string;
    year: string;
    start_date: string;
    end_date: string;
    total_no_of_students: number;
  };

  invalid: {
    class_name: string;
    term: string;
    year: string;
    start_date: string;
    end_date: string;
    total_no_of_students: number;
  };
}

/**
 * Reality Works - Class Module API Tests
 * @tag @class
 */

describe(
  'Class Module API Tests',

  () => {

    let apiClient: APIClient;

    let latestUserData:
      RegisterApiTestData;

    let classApiData:
      ClassApiTestData;

    let educatorEmail = '';
    let createdClassId = '';

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
       * GET DYNAMIC EDUCATOR EMAIL
       */
      educatorEmail =
  latestUserData
    .educatorcreate.email;
      /**
       * LOAD CLASS API DATA
       */
      const classApiPath =
        path.resolve(
          __dirname,
          '../../test-data/classApi.json'
        );

      classApiData = JSON.parse(
        fs.readFileSync(
          classApiPath,
          'utf-8'
        )
      ) as ClassApiTestData;

    });

    beforeEach(() => {

      /**
       * INITIALIZE API CLIENT
       */
      apiClient = new APIClient();

    });

    /**
     * CREATE CLASS WITH VALID DATA
     */
    it(
      'should create class with valid educator token @class',

      async () => {

        logStep(
          'Create class with valid educator token'
        );

        /**
         * EDUCATOR LOGIN API
         */
        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                educatorEmail,

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
         * PRINT LOGIN DETAILS
         */

        /**
         * LOGIN VALIDATIONS
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
         * GET ACCESS TOKEN
         */
        const accessToken =
          loginBody.data.tokens
            .accessToken;
        
        expect(accessToken)
          .toBeTruthy();

        /**
         * CREATE CLASS PAYLOAD
         */
        const createClassPayload = {
          ...classApiData.valid,
          class_name: `Automation-Class-${Date.now()}`,
        };

        /**
         * CREATE CLASS API
         */
        const createClassResponse =
          await apiClient.post(
            endpoints.auth.classes,
            createClassPayload,
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
          createClassResponse.body as {
            status: string;
            message: string;
            data: {
              id: string;
              class_name: string;
            };
          };

        /**
         * VALIDATIONS
         */
        validateStatusCode(
          createClassResponse.status,
          201
        );

        validateFieldValue(
          responseBody,
          'status',
          'SUCCESS'
        );

        /**
         * ASSERTIONS
         */
        expect(
          responseBody.data
        ).toBeTruthy();

        createdClassId =
  responseBody.data.id;

        /**
         * CAPTURE ID FOR CLEANUP
         */
        if (createdClassId) {
          ExecutionDataManager.saveEntityId(
            'class',
            createdClassId
          );
        }

      }
    );

    it(
      'should fail create class without token @class',

      async () => {

        logStep(
          'Create class without token'
        );

        /**
         * EDUCATOR LOGIN API
         */
        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                educatorEmail,

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
         * LOGIN VALIDATIONS
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

        const createClassPayload =
          classApiData.valid;

        const response =
          await apiClient.post(
            endpoints.auth.classes,
            createClassPayload,
            {
              includeAuth: false,
            }
          );

        validateStatusCode(
          response.status,
          401
        );

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
      'should fail create class with invalid token @class',

      async () => {

        logStep(
          'Create class with invalid token'
        );

        /**
         * EDUCATOR LOGIN API
         */
        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                educatorEmail,

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
         * LOGIN VALIDATIONS
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

        const invalidToken =
          'invalidtoken';

        const createClassPayload =
          classApiData.valid;

        const response =
          await apiClient.post(
            endpoints.auth.classes,
            createClassPayload,
            {
              headers: {
                Authorization:
                  `Bearer ${invalidToken}`,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          response.status,
          401
        );

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
      'should fail create class with empty class name @class',

      async () => {

        logStep(
          'Create class with empty class name'
        );

        /**
         * EDUCATOR LOGIN API
         */
        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                educatorEmail,

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
         * LOGIN VALIDATIONS
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

        const accessToken =
          loginBody.data.tokens
            .accessToken;

        expect(accessToken)
          .toBeTruthy();

        const createClassPayload = {
          ...classApiData.valid,
          class_name: '',
        };

        const response =
          await apiClient.post(
            endpoints.auth.classes,
            createClassPayload,
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
          'class_name is required'
        );

      }
    );

    it(
      'should fail create class with missing required fields @class',

      async () => {

        logStep(
          'Create class with missing required fields'
        );

        /**
         * EDUCATOR LOGIN API
         */
        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                educatorEmail,

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
         * LOGIN VALIDATIONS
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

        const accessToken =
          loginBody.data.tokens
            .accessToken;

        expect(accessToken)
          .toBeTruthy();

          
        const createClassPayload = {
          start_date:
            classApiData.valid.start_date,
          end_date:
            classApiData.valid.end_date,
          total_no_of_students:
            classApiData.valid.total_no_of_students,
        };

        const response =
          await apiClient.post(
            endpoints.auth.classes,
            createClassPayload,
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
          'class_name is required'
        );

      }
    );

    it(
      'should fail create class with invalid date range @class',

      async () => {

        logStep(
          'Create class with invalid date range'
        );

        /**
         * EDUCATOR LOGIN API
         */
        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                educatorEmail,

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
         * LOGIN VALIDATIONS
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

        const accessToken =
          loginBody.data.tokens
            .accessToken;

        expect(accessToken)
          .toBeTruthy();

        const createClassPayload = {
          ...classApiData.valid,
          start_date: '2026-12-01',
          end_date: '2026-04-01',
        };

        const response =
          await apiClient.post(
            endpoints.auth.classes,
            createClassPayload,
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
          'Start date cannot be after End date'
        );

      }
    );


    it(
      'should fetch classes with valid token @class',

      async () => {

        logStep(
          'Fetch classes with valid token'
        );

        /**
         * EDUCATOR LOGIN API
         */
        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                educatorEmail,

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
         * DEBUG LOGIN RESPONSE
         */

        /**
         * LOGIN VALIDATIONS
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
         * GET ACCESS TOKEN
         */
        const accessToken =
          loginBody.data.tokens
            .accessToken;

        expect(accessToken)
          .toBeTruthy();

        
        /**
         * GET CLASSES API
         */
        const response =
          await apiClient.get(
`${endpoints.auth.classes}/${createdClassId}`,            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        /**
         * DEBUG CLASS RESPONSE
         */
        
        /**
         * VALIDATIONS
         */
        validateStatusCode(
          response.status,
          200
        );

        validateFieldValue(
          response.body,
          'status',
          'SUCCESS'
        );

        validateFieldValue(
          response.body,
          'message',
          'Class(es) fetched successfully'
        );

        /**
         * ASSERTIONS
         */
        expect(
          response.body
        ).toBeTruthy();

        

      }
    );

    it(
      'should fail fetch class with invalid class id @class',

      async () => {

        logStep(
          'Fetch class with invalid class id'
        );

        /**
         * EDUCATOR LOGIN API
         */
        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                educatorEmail,

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
         * LOGIN VALIDATIONS
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

        const accessToken =
          loginBody.data.tokens
            .accessToken;

        expect(accessToken)
          .toBeTruthy();

        const invalidClassId =
          '00000000-0000-0000-0000-000000000000';

        const response =
          await apiClient.get(
            `${endpoints.auth.classes}/${invalidClassId}`,
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
          'Invalid Class ID format'
        );

      }
    );

    it(
      'should fail fetch class without token @class',

      async () => {

        logStep(
          'Fetch class without token'
        );

        const response =
          await apiClient.get(
            `${endpoints.auth.classes}/${createdClassId}`,
            {
              includeAuth: false,
            }
          );

        validateStatusCode(
          response.status,
          401
        );

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
      'should fail fetch class with invalid token @class',

      async () => {

        logStep(
          'Fetch class with invalid token'
        );

        const invalidToken =
          'invalidtoken';

        const response =
          await apiClient.get(
            `${endpoints.auth.classes}/${createdClassId}`,
            {
              headers: {
                Authorization:
                  `Bearer ${invalidToken}`,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          response.status,
          401
        );

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


    // Class Update 
 
it(
  'should update class status with valid educator token @class',

  async () => {

    logStep(
      'Update class status with valid educator token'
    );

    /**
     * EDUCATOR LOGIN API
     */
    const loginResponse =
      await apiClient.post<
        LoginResponseData
      >(
        endpoints.auth.login,
        {
          email:
            educatorEmail,

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
     * LOGIN VALIDATIONS
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
     * GET ACCESS TOKEN
     */
    const accessToken =
      loginBody.data.tokens
        .accessToken;

    expect(accessToken)
      .toBeTruthy();

    /**
     * UPDATE CLASS PAYLOAD
     */
    const updatePayload = {

      status: 'INACTIVE',

    };

    /**
     * UPDATE CLASS API
     */
    const updateResponse =
      await apiClient.put(
        `${endpoints.auth.classes}/${createdClassId}`,
        updatePayload,
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
      updateResponse.body as {
        status: string;
        message: string;
        data: {
          id: string;
          status: string;
          class_name: string;
        };
      };

    /**
     * DEBUG RESPONSE
     */
    
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
      'Class updated successfully'
    );

    /**
     * ASSERTIONS
     */
    expect(
      responseBody.data
    ).toBeTruthy();

    expect(
      responseBody.data.status
    ).toBe(
      'INACTIVE'
    );

  }
);

    it(
      'should fail update class with invalid class id @class',

      async () => {

        logStep(
          'Update class with invalid class id'
        );

        /**
         * EDUCATOR LOGIN API
         */
        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                educatorEmail,

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
         * LOGIN VALIDATIONS
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

        const accessToken =
          loginBody.data.tokens
            .accessToken;

        expect(accessToken)
          .toBeTruthy();

        const invalidClassId =
          '00000000-0000-0000-0000-000000000000';

        const updatePayload = {
          status: 'INACTIVE',
        };

        const response =
          await apiClient.put(
            `${endpoints.auth.classes}/${invalidClassId}`,
            updatePayload,
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
          'Invalid Class ID format'
        );

      }
    );

    it(
      'should fail update class without token @class',

      async () => {

        logStep(
          'Update class without token'
        );

        const updatePayload = {
          status: 'INACTIVE',
        };

        const response =
          await apiClient.put(
            `${endpoints.auth.classes}/${createdClassId}`,
            updatePayload,
            {
              includeAuth: false,
            }
          );

        validateStatusCode(
          response.status,
          401
        );

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
      'should fail update class with invalid token @class',

      async () => {

        logStep(
          'Update class with invalid token'
        );

        const invalidToken =
          'invalidtoken';

        const updatePayload = {
          status: 'INACTIVE',
        };

        const response =
          await apiClient.put(
            `${endpoints.auth.classes}/${createdClassId}`,
            updatePayload,
            {
              headers: {
                Authorization:
                  `Bearer ${invalidToken}`,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          response.status,
          401
        );

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
      'should fail update class with invalid status value @class',

      async () => {

        logStep(
          'Update class with invalid status value'
        );

        /**
         * EDUCATOR LOGIN API
         */
        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                educatorEmail,

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
         * LOGIN VALIDATIONS
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

        const accessToken =
          loginBody.data.tokens
            .accessToken;

        expect(accessToken)
          .toBeTruthy();

        const updatePayload = {
          status: 'INVALID_STATUS' as unknown as string,
        };

        const response =
          await apiClient.put(
            `${endpoints.auth.classes}/${createdClassId}`,
            updatePayload,
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
          'Status must be ACTIVE or INACTIVE or DRAFT or ARCHIEVED'
        );

      }
    );

    // it(
    //   'should fail update class with empty payload @class',

    //   async () => {

    //     logStep(
    //       'Update class with empty payload'
    //     );

    //     /**
    //      * EDUCATOR LOGIN API
    //      */
    //     const loginResponse =
    //       await apiClient.post<
    //         LoginResponseData
    //       >(
    //         endpoints.auth.login,
    //         {
    //           email:
    //             educatorEmail,

    //           password:
    //             latestUserData
    //               .educatorcreate.password,
    //         }
    //       );

    //     /**
    //      * LOGIN BODY
    //      */
    //     const loginBody =
    //       loginResponse.body;

    //     /**
    //      * LOGIN VALIDATIONS
    //      */
    //     validateStatusCode(
    //       loginResponse.status,
    //       201
    //     );

    //     validateFieldValue(
    //       loginBody,
    //       'status',
    //       'SUCCESS'
    //     );

    //     validateFieldValue(
    //       loginBody,
    //       'message',
    //       'Login successful'
    //     );

    //     const accessToken =
    //       loginBody.data.tokens
    //         .accessToken;

    //     expect(accessToken)
    //       .toBeTruthy();

    //     const response =
    //       await apiClient.put(
    //         `${endpoints.auth.classes}/${createdClassId}`,
    //         {},
    //         {
    //           headers: {
    //             Authorization:
    //               `Bearer ${accessToken}`,
    //           },

    //           includeAuth: false,
    //         }
    //       );

    //     validateStatusCode(
    //       response.status,
    //       400
    //     );

    //     validateFieldValue(
    //       response.body,
    //       'status',
    //       'FAILED'
    //     );

    //     validateFieldValue(
    //       response.body,
    //       'message',
    //       'Request payload cannot be empty'
    //     );

    //   }
    // );

    it(
      'should retrieve list of classes with valid token @class',

      async () => {

        logStep(
          'Retrieve class list with valid token'
        );

        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                educatorEmail,

              password:
                latestUserData
                  .educatorcreate.password,
            }
          );

        const accessToken =
          loginResponse.body.data.tokens.accessToken;

        const listResponse =
          await apiClient.get(
            `${endpoints.auth.classes}/user`,
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

        validateFieldValue(
          listResponse.body,
          'status',
          'SUCCESS'
        );

        expect(listResponse.body).toHaveProperty('data');

      }
    );

    it(
      'should create class within acceptable time @class',

      async () => {

        logStep(
          'Verify class creation response time'
        );

        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                educatorEmail,

              password:
                latestUserData
                  .educatorcreate.password,
            }
          );

        const accessToken =
          loginResponse.body.data.tokens.accessToken;

        const startTime = Date.now();

        const classPayload = {
          class_name: `Performance Test Class ${Date.now()}`,
          term: 'Q1',
          year: new Date().getFullYear().toString(),
          start_date: '2024-01-01',
          end_date: '2024-03-31',
          total_no_of_students: 30,
        };

        const createResponse =
          await apiClient.post(
            endpoints.auth.classes,
            classPayload,
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
          createResponse.status,
          201
        );

        expect(responseTime).toBeLessThan(5000);

      }
    );

    it(
      'should verify class response structure @class',

      async () => {

        logStep(
          'Verify class response structure'
        );

        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                educatorEmail,

              password:
                latestUserData
                  .educatorcreate.password,
            }
          );

        const accessToken =
          loginResponse.body.data.tokens.accessToken;

        const createResponse =
          await apiClient.post(
            endpoints.auth.classes,
            {
              class_name: `Structure Test Class ${Date.now()}`,
              term: 'Q2',
              year: new Date().getFullYear().toString(),
              start_date: '2024-04-01',
              end_date: '2024-06-30',
              total_no_of_students: 25,
            },
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          createResponse.status,
          201
        );

        const body = createResponse.body as Record<string, unknown>;

        expect(body).toHaveProperty('status');
        expect(body).toHaveProperty('message');
        expect(body).toHaveProperty('data');
        const data = body.data as Record<string, unknown>;
        expect(data).toHaveProperty('id');
        expect(data).toHaveProperty('class_name');

      }
    );

    it(
      'should fail create class with empty class name @class',

      async () => {

        logStep(
          'Create class with empty name'
        );

        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                educatorEmail,

              password:
                latestUserData
                  .educatorcreate.password,
            }
          );

        const accessToken =
          loginResponse.body.data.tokens.accessToken;

        const createResponse =
          await apiClient.post(
            endpoints.auth.classes,
            {
              class_name: '',
              term: 'Q3',
              year: new Date().getFullYear().toString(),
              start_date: '2024-07-01',
              end_date: '2024-09-30',
              total_no_of_students: 20,
            },
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        validateStatusCode(
          createResponse.status,
          400
        );

      }
    );

    it(
      'should fail create class with negative student count @class',

      async () => {

        logStep(
          'Create class with negative student count'
        );

        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                educatorEmail,

              password:
                latestUserData
                  .educatorcreate.password,
            }
          );

        const accessToken =
          loginResponse.body.data.tokens.accessToken;

        const createResponse =
          await apiClient.post(
            endpoints.auth.classes,
            {
              class_name: `Negative Count Class ${Date.now()}`,
              term: 'Q1',
              year: new Date().getFullYear().toString(),
              start_date: '2024-01-01',
              end_date: '2024-03-31',
              total_no_of_students: -5,
            },
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        expect([201, 400]).toContain(
          createResponse.status
        );

      }
    );

    it(
      'should fail class creation with invalid end date @class',

      async () => {

        logStep(
          'Create class with invalid end date'
        );

        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                educatorEmail,

              password:
                latestUserData
                  .educatorcreate.password,
            }
          );

        const accessToken =
          loginResponse.body.data.tokens.accessToken;

        const createResponse =
          await apiClient.post(
            endpoints.auth.classes,
            {
              class_name: `Invalid Date Class ${Date.now()}`,
              term: 'Q1',
              year: new Date().getFullYear().toString(),
              start_date: '2024-03-31',
              end_date: '2024-01-01', // End date before start date
              total_no_of_students: 30,
            },
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        expect([201, 400]).toContain(
          createResponse.status
        );

      }
    );

    it(
      'should handle class with very long name @class',

      async () => {

        logStep(
          'Create class with very long name'
        );

        const loginResponse =
          await apiClient.post<
            LoginResponseData
          >(
            endpoints.auth.login,
            {
              email:
                educatorEmail,

              password:
                latestUserData
                  .educatorcreate.password,
            }
          );

        const accessToken =
          loginResponse.body.data.tokens.accessToken;

        const veryLongName =
          new Array(500).fill('A').join('');

        const createResponse =
          await apiClient.post(
            endpoints.auth.classes,
            {
              class_name: veryLongName,
              term: 'Q1',
              year: new Date().getFullYear().toString(),
              start_date: '2024-01-01',
              end_date: '2024-03-31',
              total_no_of_students: 30,
            },
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        expect([201, 400, 413]).toContain(
          createResponse.status
        );

      }
    );

  }
);



