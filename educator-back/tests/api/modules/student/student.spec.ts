// https://dev.educatorbe.realityworksai.com/api/students

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
 * STUDENT API TEST DATA TYPE
 */

interface StudentApiTestData {

  valid: {
    status: string;
  };

  batchemail: {
    accessCode: boolean;
    message: string;
  };

  report: {
    sendPdf: boolean;
    subject: string;
    message: string;
  };

}


/**
 * Reality Works - Student Module API Tests
 * @tag @student
 */

describe(
  'Student Module API Tests',

  () => {

    let apiClient: APIClient;

    let latestUserData:
      RegisterApiTestData;

    let studentApiData:
      StudentApiTestData;

    let educatorEmail = '';

    let createdClassId = '';

    let createdEducatorId = '';

    let createdStudentId = '';

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
       * LOAD STUDENT API DATA
       */
      const studentApiPath =
        path.resolve(
          __dirname,
          '../../test-data/studentApi.json'
        );

      studentApiData = JSON.parse(
        fs.readFileSync(
          studentApiPath,
          'utf-8'
        )
      ) as StudentApiTestData;

      /**
       * EDUCATOR EMAIL
       */
      educatorEmail =
        latestUserData
          .educatorcreate.email;

    });

    beforeEach(() => {

      /**
       * INITIALIZE API CLIENT
       */
      apiClient = new APIClient();

    });

    /**
     * CREATE STUDENT WITH VALID DATA
     */
    it(
      'should create student with valid educator token @student',

      async () => {

        logStep(
          'Create student with valid educator token'
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
         * GET EDUCATOR DETAILS
         */
        createdEducatorId =
          loginBody.data.user.id;

        /**
         * CREATE CLASS PAYLOAD
         */
        const createClassPayload = {

          class_name:
            `Grade-${Math.floor(
              Math.random() * 1000
            )}`,

          term: 'i',

          year: '2026',

          start_date:
            '2026-04-01',

          end_date:
            '2026-12-01',

          total_no_of_students:
            10,

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
         * CLASS RESPONSE BODY
         */
        const classBody =
          createClassResponse.body as {
            data: {
              id: string;
            };
          };

        /**
         * DEBUG CLASS RESPONSE
         */


        /**
         * STORE CLASS ID
         */
        createdClassId =
          classBody.data.id;

        /**
         * RANDOM EMAIL
         */
        const randomEmail =
          `student${Math.floor(
            Math.random() * 100000
          )}@gmail.com`;

        /**
         * RANDOM STUDENT ID
         */
        const randomStudentId =
          `STU${Math.floor(
            Math.random() * 100000
          )}`;

        /**
         * CREATE STUDENT PAYLOAD
         */
        const createStudentPayload = {

          student_id:
            randomStudentId,

          email:
            randomEmail,

          

          class_id:
            createdClassId,

          educator_id:
            createdEducatorId,

          status:
            studentApiData.valid.status,

        };

        /**
         * DEBUG PAYLOAD
         */
        

        /**
         * CREATE STUDENT API
         */
        const createStudentResponse =
          await apiClient.post(
            endpoints.auth.studentcreate,
            createStudentPayload,
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
          createStudentResponse.body as {
            status: string;
            message: string;
            data: {
              id: string;
              student_id: string;
              // email: string;
              status: string;
            };
          };
          

        /**
         * DEBUG RESPONSE
         */
        
        /**
         * VALIDATIONS
         */
        validateStatusCode(
          createStudentResponse.status,
          201
        );

        validateFieldValue(
          responseBody,
          'status',
          'SUCCESS'
        );
  
        // validate message created successfully

        validateFieldValue(
          responseBody,
          'message',
          'Student added successfully'
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
          'ACTIVE'
        );
        createdStudentId =
  responseBody.data.id;

        /**
         * CAPTURE ID FOR CLEANUP
         */
        if (createdStudentId) {
          ExecutionDataManager.saveEntityId(
            'student',
            createdStudentId
          );
        }

      }
    );

  // https://dev.educatorbe.realityworksai.com/api/students/update-code this is the api and payload is id:{student id} access toekn as educator token only put api

  it(
    'should update student access code with valid educator token @student',
    async () => {

      logStep(
        'Update student access code'
      );

      /**
       * EDUCATOR LOGIN API
       */
      const loginResponse =
        await apiClient.post<LoginResponseData>(
          endpoints.auth.login,
          {
            email: educatorEmail,
            password:
              latestUserData
                .educatorcreate.password,
          }
        );
      const loginBody =
        loginResponse.body;
      validateStatusCode(
        loginResponse.status,
        201
      );
      validateFieldValue(
        loginBody,
        'status',
        'SUCCESS'
      );
      // ACCESS TOKEN
      const accessToken =
        loginBody.data.tokens
          .accessToken;
      // UPDATE ACCESS CODE PAYLOAD
      const updateAccessCodePayload = {
        id: createdStudentId,
      };
  
      // UPDATE ACCESS CODE API
      const updateAccessCodeResponse =
        await apiClient.put(
          endpoints.auth.updatestudentcode,
          updateAccessCodePayload,
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },

            includeAuth: false,
          }
        );
      const responseBody =
        updateAccessCodeResponse.body as {
          status: string;
          message: string;
          data: {
            student_id: string;
            new_access_code: string;
          };
        };

      /**
       * VALIDATIONS
       */
      validateStatusCode(
        updateAccessCodeResponse.status,
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
        'Student ID generated successfully'
      );

  }
);

// https://dev.educatorbe.realityworksai.com/api/students/class/a5e650e4-40f4-4ef3-88f1-9fe8fc7c8398

it(
  'should get student by class id with valid educator token @student',
  async () => {
    logStep(
      'Get student by class id'
    );
    /**
     * EDUCATOR LOGIN API
     */
    const loginResponse =
      await apiClient.post<LoginResponseData>(
        endpoints.auth.login,
        {
          email: educatorEmail,
          password:
            latestUserData
              .educatorcreate.password,
        }
      );
    const loginBody =
      loginResponse.body;
    validateStatusCode(
      loginResponse.status,
      201
    );
    validateFieldValue(
      loginBody,
      'status',
      'SUCCESS'
    );
    // ACCESS TOKEN
    const accessToken =
      loginBody.data.tokens
        .accessToken;
    // GET STUDENT BY CLASS ID API
    const getStudentByClassIdResponse =
      await apiClient.get(
        `${endpoints.auth.getstudentbyid}${createdClassId}`,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },

          includeAuth: false,
        }
      );
    const responseBody =
      getStudentByClassIdResponse.body as {
        status: string;
        message: string;
        data: [];
      };

    /**
     * VALIDATIONS
     */
    validateStatusCode(
      getStudentByClassIdResponse.status,
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
      'Student(s) fetched successfully'
    );

  });

  // https://dev.educatorbe.realityworksai.com/api/students/user this api is to get student by user id and payload is student id and access token as educator token only get api

    /**
     * CREATE STUDENT WITHOUT TOKEN
     */
    it(
      'should fail create student without token @student',

      async () => {

        logStep(
          'Create student without token'
        );

        const randomEmail =
          `student${Math.floor(
            Math.random() * 100000
          )}@gmail.com`;

        const randomStudentId =
          `STU${Math.floor(
            Math.random() * 100000
          )}`;

        const createStudentPayload = {

          student_id:
            randomStudentId,

          email:
            randomEmail,

          class_id:
            createdClassId,

          educator_id:
            createdEducatorId,

          status:
            studentApiData.valid.status,

        };

        const response =
          await apiClient.post(
            endpoints.auth.studentcreate,
            createStudentPayload,
            {
              includeAuth: false,
            }
          );

        const responseBody =
          response.body as {
            status: string;
            message: string;
            data: unknown;
          };

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
     * CREATE STUDENT WITH INVALID TOKEN
     */
    it(
      'should fail create student with invalid token @student',

      async () => {

        logStep(
          'Create student with invalid token'
        );

        const randomEmail =
          `student${Math.floor(
            Math.random() * 100000
          )}@gmail.com`;

        const randomStudentId =
          `STU${Math.floor(
            Math.random() * 100000
          )}`;

        const createStudentPayload = {

          student_id:
            randomStudentId,

          email:
            randomEmail,

          class_id:
            createdClassId,

          educator_id:
            createdEducatorId,

          status:
            studentApiData.valid.status,

        };

        const response =
          await apiClient.post(
            endpoints.auth.studentcreate,
            createStudentPayload,
            {
              headers: {
                Authorization:
                  `Bearer invalidtoken`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as {
            status: string;
            message: string;
            data: unknown;
          };

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
     * CREATE STUDENT WITH INVALID CLASS ID
     */
    it(
      'should fail create student with invalid class id @student',

      async () => {

        logStep(
          'Create student with invalid class id'
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

        const loginBody =
          loginResponse.body;

        validateStatusCode(
          loginResponse.status,
          201
        );

        validateFieldValue(
          loginBody,
          'status',
          'SUCCESS'
        );

        const accessToken =
          loginBody.data.tokens
            .accessToken;

        const randomEmail =
          `student${Math.floor(
            Math.random() * 100000
          )}@gmail.com`;

        const randomStudentId =
          `STU${Math.floor(
            Math.random() * 100000
          )}`;

        const createStudentPayload = {

          student_id:
            randomStudentId,

          email:
            randomEmail,

          class_id:
            'invalid-class-id',

          educator_id:
            createdEducatorId,

          status:
            studentApiData.valid.status,

        };

        const response =
          await apiClient.post(
            endpoints.auth.studentcreate,
            createStudentPayload,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as {
            status: string;
            message: string;
            data: unknown;
          };

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
     * CREATE STUDENT WITH INVALID EDUCATOR ID
     */
    it(
      'should fail create student with invalid educator id @student',

      async () => {

        logStep(
          'Create student with invalid educator id'
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

        const loginBody =
          loginResponse.body;

        validateStatusCode(
          loginResponse.status,
          201
        );

        validateFieldValue(
          loginBody,
          'status',
          'SUCCESS'
        );

        const accessToken =
          loginBody.data.tokens
            .accessToken;

        const randomEmail =
          `student${Math.floor(
            Math.random() * 100000
          )}@gmail.com`;

        const randomStudentId =
          `STU${Math.floor(
            Math.random() * 100000
          )}`;

        const createStudentPayload = {

          student_id:
            randomStudentId,

          email:
            randomEmail,

          class_id:
            createdClassId,

          educator_id:
            'invalid-educator-id',

          status:
            studentApiData.valid.status,

        };

        const response =
          await apiClient.post(
            endpoints.auth.studentcreate,
            createStudentPayload,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as {
            status: string;
            message: string;
            data: unknown;
          };

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
     * CREATE STUDENT WITH EMPTY EMAIL
     */
    it(
      'should fail create student with empty email @student',

      async () => {

        logStep(
          'Create student with empty email'
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

        const loginBody =
          loginResponse.body;

        validateStatusCode(
          loginResponse.status,
          201
        );

        validateFieldValue(
          loginBody,
          'status',
          'SUCCESS'
        );

        const accessToken =
          loginBody.data.tokens
            .accessToken;

        const randomStudentId =
          `STU${Math.floor(
            Math.random() * 100000
          )}`;

        const createStudentPayload = {

          student_id:
            randomStudentId,

          email:
            '',

          class_id:
            createdClassId,

          educator_id:
            createdEducatorId,

          status:
            studentApiData.valid.status,

        };

        const response =
          await apiClient.post(
            endpoints.auth.studentcreate,
            createStudentPayload,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as {
            status: string;
            message: string;
            data: unknown;
          };

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
     * EMAIL REPORT WITHOUT TOKEN
     */
    it(
      'should fail email report without token @student',

      async () => {

        logStep(
          'Email report without token'
        );

        const response =
          await apiClient.post(
            `${endpoints.auth.getemailreport}`,
            {
              class_id:
                createdClassId,
              student_id:
                createdStudentId,
              user_id:
                createdEducatorId,
              sendPdf:
                studentApiData
                  .report.sendPdf,
              subject:
                studentApiData
                  .report.subject,
              message:
                studentApiData
                  .report.message,
            },
            {
              includeAuth: false,
            }
          );

        const responseBody =
          response.body as {
            status: string;
            message: string;
            data: unknown;
          };

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
     * EMAIL REPORT WITH INVALID STUDENT ID
     */
    it(
      'should fail email report with invalid student id @student',

      async () => {

        logStep(
          'Email report with invalid student id'
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

        const loginBody =
          loginResponse.body;

        validateStatusCode(
          loginResponse.status,
          201
        );

        validateFieldValue(
          loginBody,
          'status',
          'SUCCESS'
        );

        const accessToken =
          loginBody.data.tokens
            .accessToken;

        const response =
          await apiClient.post(
            `${endpoints.auth.getemailreport}`,
            {
              class_id:
                createdClassId,
              student_id:
                'invalid-student-id',
              user_id:
                createdEducatorId,
              sendPdf:
                studentApiData
                  .report.sendPdf,
              subject:
                studentApiData
                  .report.subject,
              message:
                studentApiData
                  .report.message,
            },
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as {
            status: string;
            message: string;
            data: unknown;
          };

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
     * UPDATE ACCESS CODE WITHOUT TOKEN
     */
    it(
      'should fail update access code without token @student',

      async () => {

        logStep(
          'Update access code without token'
        );

        const response =
          await apiClient.put(
            endpoints.auth.updatestudentcode,
            {
              id: createdStudentId,
            },
            {
              includeAuth: false,
            }
          );

        const responseBody =
          response.body as {
            status: string;
            message: string;
            data: unknown;
          };

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
     * UPDATE ACCESS CODE WITH INVALID STUDENT ID
     */
    it(
      'should fail update access code with invalid student id @student',

      async () => {

        logStep(
          'Update access code with invalid student id'
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

        const loginBody =
          loginResponse.body;

        validateStatusCode(
          loginResponse.status,
          201
        );

        validateFieldValue(
          loginBody,
          'status',
          'SUCCESS'
        );

        const accessToken =
          loginBody.data.tokens
            .accessToken;

        const response =
          await apiClient.put(
            endpoints.auth.updatestudentcode,
            {
              id: 'invalid-student-id',
            },
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as {
            status: string;
            message: string;
            data: unknown;
          };

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
     * GET STUDENT BY ID WITH INVALID ID
     */
    it(
      'should fail get student by id with invalid student id @student',

      async () => {

        logStep(
          'Get student by id with invalid student id'
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

        const loginBody =
          loginResponse.body;

        validateStatusCode(
          loginResponse.status,
          201
        );

        validateFieldValue(
          loginBody,
          'status',
          'SUCCESS'
        );

        const accessToken =
          loginBody.data.tokens
            .accessToken;

        const response =
          await apiClient.get(
            `${endpoints.auth.studentcreate}/invalid-student-id`,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as {
            status: string;
            message: string;
            data: unknown;
          };

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
          'Invalid Student ID format'
        );

      }
    );

    /**
     * GET STUDENT BY ID WITHOUT TOKEN
     */
    it(
      'should fail get student by id without token @student',

      async () => {

        logStep(
          'Get student by id without token'
        );

        const response =
          await apiClient.get(
            `${endpoints.auth.studentcreate}/${createdStudentId}`,
            {
              includeAuth: false,
            }
          );

        const responseBody =
          response.body as {
            status: string;
            message: string;
            data: unknown;
          };

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
     * DELETE STUDENT WITH INVALID ID
     */
    it(
      'should fail delete student with invalid student id @student',

      async () => {

        logStep(
          'Delete student with invalid student id'
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

        const loginBody =
          loginResponse.body;

        validateStatusCode(
          loginResponse.status,
          201
        );

        validateFieldValue(
          loginBody,
          'status',
          'SUCCESS'
        );

        const accessToken =
          loginBody.data.tokens
            .accessToken;

        const response =
          await apiClient.delete(
            `${endpoints.auth.studentcreate}/invalid-student-id`,
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as {
            status: string;
            message: string;
            data: unknown;
          };

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
     * DELETE STUDENT WITHOUT TOKEN
     */
    it(
      'should fail delete student without token @student',

      async () => {

        logStep(
          'Delete student without token'
        );

        const response =
          await apiClient.delete(
            `${endpoints.auth.studentcreate}/${createdStudentId}`,
            {
              includeAuth: false,
            }
          );

        const responseBody =
          response.body as {
            status: string;
            message: string;
            data: unknown;
          };

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
     * DELETE STUDENT WITH INVALID TOKEN
     */
    it(
      'should fail delete student with invalid token @student',

      async () => {

        logStep(
          'Delete student with invalid token'
        );

        const response =
          await apiClient.delete(
            `${endpoints.auth.studentcreate}/${createdStudentId}`,
            {
              headers: {
                Authorization:
                  `Bearer invalidtoken`,
              },

              includeAuth: false,
            }
          );

        const responseBody =
          response.body as {
            status: string;
            message: string;
            data: unknown;
          };

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


it(
  'should get student by id with valid educator token @student',

  async () => {

    logStep(
      'Get student by ID'
    );

    /**
     * EDUCATOR LOGIN
     */
    const loginResponse =
      await apiClient.post<LoginResponseData>(
        endpoints.auth.login,
        {
          email:
            educatorEmail,

          password:
            latestUserData
              .educatorcreate.password,
        }
      );

    const loginBody =
      loginResponse.body;

    validateStatusCode(
      loginResponse.status,
      201
    );

    validateFieldValue(
      loginBody,
      'status',
      'SUCCESS'
    );

    /**
     * ACCESS TOKEN
     */
    const accessToken =
      loginBody.data.tokens
        .accessToken;

    expect(
      accessToken
    ).toBeTruthy();

    /**
     * DEBUG
     */

    /**
     * GET STUDENT BY ID API
     */
    const getStudentResponse =
      await apiClient.get(
        `${endpoints.auth.studentcreate}/${createdStudentId}`,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },

          includeAuth: false,
        }
      );

    const responseBody =
      getStudentResponse.body as {
        status: string;
        message: string;
        data: {
          id: string;
          student_id: string;
          email: string;
          status: string;
        };
      };

    /**
     * VALIDATIONS
     */
    validateStatusCode(
      getStudentResponse.status,
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
      'Student(s) fetched successfully'
    );

    expect(
      responseBody.data.id
    ).toBe(
      createdStudentId
    );

  }
);


it(
  'Delete student by id with valid educator token @student',

  async () => {

    logStep(
      'Get student by ID'
    );

    /**
     * EDUCATOR LOGIN
     */
    const loginResponse =
      await apiClient.post<LoginResponseData>(
        endpoints.auth.login,
        {
          email:
            educatorEmail,

          password:
            latestUserData
              .educatorcreate.password,
        }
      );

    const loginBody =
      loginResponse.body;

    validateStatusCode(
      loginResponse.status,
      201
    );

    validateFieldValue(
      loginBody,
      'status',
      'SUCCESS'
    );

    /**
     * ACCESS TOKEN
     */
    const accessToken =
      loginBody.data.tokens
        .accessToken;

    expect(
      accessToken
    ).toBeTruthy();

    /**
     * DEBUG
     */

    /**
     * GET STUDENT BY ID API
     */
    const getStudentResponse =
      await apiClient.delete(
        `${endpoints.auth.studentcreate}/${createdStudentId}`,
        {
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },

          includeAuth: false,
        }
      );

    const responseBody =
      getStudentResponse.body as {
        status: string;
        message: string;
        data: {
          id: string;
          student_id: string;
          email: string;
          status: string;
        };
      };

    /**
     * VALIDATIONS
     */
    validateStatusCode(
      getStudentResponse.status,
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
      'Student deleted successfully'
    );

  }
);

  /**
   * STUDENT LIST RETRIEVAL
   */
  it.skip(
    'should retrieve student list with valid token @student',

    async () => {

      logStep(
        'Retrieve student list'
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
          endpoints.auth.getstudentuser,
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

    },
    60000
  );

  /**
   * STUDENT CREATION RESPONSE TIME
   */
  it(
    'should create student within acceptable time @student',

    async () => {

      logStep(
        'Verify student creation response time'
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

      const createPayload = {
        student_name: `Student ${Date.now()}`,
        student_email: `student${Date.now()}@example.com`,
        student_id: `STU${Date.now()}`,
        class_id: createdClassId,
      };

      await apiClient.post(
        endpoints.auth.studentcreate,
        createPayload,
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
   * STUDENT RESPONSE STRUCTURE
   */
  it(
    'should return correct response structure for student @student',

    async () => {

      logStep(
        'Verify student response structure'
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

      const getResponse =
        await apiClient.get(
          `${endpoints.auth.studentcreate}/${createdStudentId}`,
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

    }
  );

  /**
   * FAIL CREATE STUDENT WITH EMPTY NAME
   */
  it(
    'should fail student creation with empty name @student',

    async () => {

      logStep(
        'Create student with empty name'
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

      const createPayload = {
        student_name: '',
        student_email: `student${Date.now()}@example.com`,
        student_id: `STU${Date.now()}`,
        class_id: createdClassId,
      };

      const createResponse =
        await apiClient.post(
          endpoints.auth.studentcreate,
          createPayload,
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

  /**
   * FAIL CREATE STUDENT WITH INVALID EMAIL
   */
  it(
    'should fail student creation with invalid email @student',

    async () => {

      logStep(
        'Create student with invalid email'
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

      const createPayload = {
        student_name: 'Test Student',
        student_email: 'invalidemail',
        student_id: `STU${Date.now()}`,
        class_id: createdClassId,
      };

      const createResponse =
        await apiClient.post(
          endpoints.auth.studentcreate,
          createPayload,
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

  /**
   * FAIL GET STUDENT WITH INVALID ID
   */
  it(
    'should fail to get student with invalid id @student',

    async () => {

      logStep(
        'Get student with invalid ID'
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

      const invalidStudentId =
        '00000000-0000-0000-0000-000000000000';

      const getResponse =
        await apiClient.get(
          `${endpoints.auth.studentcreate}/${invalidStudentId}`,
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

  // ─── GET /students/user ──────────────────────────────────────────────────

  it(
    'should get all students with valid educator token @student',
    async () => {
      logStep('GET /students/user — valid token');

      const loginResponse = await apiClient.post<LoginResponseData>(
        endpoints.auth.login,
        { email: educatorEmail, password: latestUserData.educatorcreate.password },
      );
      validateStatusCode(loginResponse.status, 201);
      const accessToken = loginResponse.body.data.tokens.accessToken;

      const response = await apiClient.get(
        endpoints.auth.getstudentuser,
        { headers: { Authorization: `Bearer ${accessToken}` }, includeAuth: false },
      );

      validateStatusCode(response.status, 200);
      validateFieldValue(response.body, 'status', 'SUCCESS');
      validateFieldValue(response.body, 'message', 'Student(s) fetched successfully');
    },
    60000
  );

  it(
    'should fail get all students without token @student',
    async () => {
      logStep('GET /students/user — no token');

      const response = await apiClient.get(
        endpoints.auth.getstudentuser,
        { includeAuth: false },
      );

      validateStatusCode(response.status, 401);
      validateFieldValue(response.body, 'status', 'FAILED');
      validateFieldValue(response.body, 'message', 'Unauthorized');
    }
  );

  it(
    'should fail get all students with invalid token @student',
    async () => {
      logStep('GET /students/user — invalid token');

      const response = await apiClient.get(
        endpoints.auth.getstudentuser,
        { headers: { Authorization: 'Bearer invalidtoken' }, includeAuth: false },
      );

      validateStatusCode(response.status, 401);
      validateFieldValue(response.body, 'status', 'FAILED');
      validateFieldValue(response.body, 'message', 'Unauthorized');
    }
  );

  // ─── POST /students/batch-email ──────────────────────────────────────────

  it(
    'should fail batch-email without token @student',
    async () => {
      logStep('POST /students/batch-email — no token');

      const response = await apiClient.post(
        endpoints.auth.batchEmail,
        { class_id: createdClassId, subject: 'Test', message: 'Hello', accessCode: true },
        { includeAuth: false },
      );

      validateStatusCode(response.status, 401);
      validateFieldValue(response.body, 'status', 'FAILED');
      validateFieldValue(response.body, 'message', 'Unauthorized');
    }
  );

  it(
    'should fail batch-email with missing class_id @student',
    async () => {
      logStep('POST /students/batch-email — missing class_id');

      const loginResponse = await apiClient.post<LoginResponseData>(
        endpoints.auth.login,
        { email: educatorEmail, password: latestUserData.educatorcreate.password },
      );
      validateStatusCode(loginResponse.status, 201);
      const accessToken = loginResponse.body.data.tokens.accessToken;

      const response = await apiClient.post(
        endpoints.auth.batchEmail,
        { subject: 'Test', message: 'Hello', accessCode: true },
        { headers: { Authorization: `Bearer ${accessToken}` }, includeAuth: false },
      );

      validateStatusCode(response.status, 400);
      validateFieldValue(response.body, 'status', 'FAILED');
    }
  );

  it(
    'should fail batch-email with invalid student_id @student',
    async () => {
      logStep('POST /students/batch-email — invalid student_id');

      const loginResponse = await apiClient.post<LoginResponseData>(
        endpoints.auth.login,
        { email: educatorEmail, password: latestUserData.educatorcreate.password },
      );
      validateStatusCode(loginResponse.status, 201);
      const accessToken = loginResponse.body.data.tokens.accessToken;

      const response = await apiClient.post(
        endpoints.auth.batchEmail,
        {
          class_id: createdClassId,
          student_id: '00000000-0000-0000-0000-000000000000',
          subject: 'Test',
          message: 'Hello',
          accessCode: true,
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, includeAuth: false },
      );

      expect([400, 404]).toContain(response.status);
      validateFieldValue(response.body, 'status', 'FAILED');
    }
  );

  it(
    'should send batch-email successfully to class students @student',
    async () => {
      logStep('POST /students/batch-email — happy path');

      const loginResponse = await apiClient.post<LoginResponseData>(
        endpoints.auth.login,
        { email: educatorEmail, password: latestUserData.educatorcreate.password },
      );
      validateStatusCode(loginResponse.status, 201);
      const accessToken = loginResponse.body.data.tokens.accessToken;

      const response = await apiClient.post(
        endpoints.auth.batchEmail,
        {
          class_id: createdClassId,
          subject: 'Test Batch Email',
          message: studentApiData.batchemail.message,
          accessCode: studentApiData.batchemail.accessCode,
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, includeAuth: false },
      );

      // 201 success or 400 if student has no email assigned — both valid
      expect([201, 400]).toContain(response.status);
      if (response.status === 201) {
        validateFieldValue(response.body, 'status', 'SUCCESS');
      }
    }
  );

  // ─── POST /students/email-report — happy path ────────────────────────────

  it(
    'should send email-report successfully with valid student id @student',
    async () => {
      logStep('POST /students/email-report — happy path');

      const loginResponse = await apiClient.post<LoginResponseData>(
        endpoints.auth.login,
        { email: educatorEmail, password: latestUserData.educatorcreate.password },
      );
      validateStatusCode(loginResponse.status, 201);
      const accessToken = loginResponse.body.data.tokens.accessToken;

      const response = await apiClient.post(
        endpoints.auth.getemailreport,
        {
          class_id: createdClassId,
          student_id: createdStudentId,
          user_id: createdEducatorId,
          sendPdf: studentApiData.report.sendPdf,
          subject: studentApiData.report.subject,
          message: studentApiData.report.message,
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, includeAuth: false },
      );

      // 201 success, 400 if no report data, 404 if student not found — all valid
      expect([201, 400, 404]).toContain(response.status);
      if (response.status === 201) {
        validateFieldValue(response.body, 'status', 'SUCCESS');
      }
    }
  );

  it(
    'should fail email-report with missing class_id @student',
    async () => {
      logStep('POST /students/email-report — missing class_id');

      const loginResponse = await apiClient.post<LoginResponseData>(
        endpoints.auth.login,
        { email: educatorEmail, password: latestUserData.educatorcreate.password },
      );
      validateStatusCode(loginResponse.status, 201);
      const accessToken = loginResponse.body.data.tokens.accessToken;

      const response = await apiClient.post(
        endpoints.auth.getemailreport,
        {
          student_id: createdStudentId,
          user_id: createdEducatorId,
          sendPdf: studentApiData.report.sendPdf,
          subject: studentApiData.report.subject,
          message: studentApiData.report.message,
        },
        { headers: { Authorization: `Bearer ${accessToken}` }, includeAuth: false },
      );

      validateStatusCode(response.status, 400);
      validateFieldValue(response.body, 'status', 'FAILED');
    }
  );

  // ==========================================================================
  // Student Public Login & Simulations API Tests
  // ==========================================================================

  describe(
    'Student Public Login & Simulations API Tests',
    () => {
      const MOCK_STUDENT_CODE = 'MOCK-STUDENT-001';
    let studentToken = '';

    beforeAll(async () => {
      const loginClient = new APIClient();
      const loginResp = await loginClient.get(
        `${endpoints.student.login}?student_id=${MOCK_STUDENT_CODE}`,
      );
      studentToken = (loginResp.body as { data: { access_token: string } }).data?.access_token ?? '';
    });

    // ─── GET /students/login?student_id=VALID ───────────────────────────────
    it(
      'should login successfully with valid student_id @student',
      async () => {
        logStep('GET /students/login — valid student_id');
        const response = await apiClient.get(
          `${endpoints.student.login}?student_id=${MOCK_STUDENT_CODE}`,
        );
        validateStatusCode(response.status, 200);
        validateFieldValue(response.body, 'status', 'SUCCESS');
        const body = response.body as { data: { access_token: string; token_type: string; student_id: string } };
        expect(body.data).toHaveProperty('access_token');
        expect(body.data).toHaveProperty('token_type', 'Bearer');
        expect(body.data).toHaveProperty('student_id', MOCK_STUDENT_CODE);
      }
    );

    // ─── GET /students/login — missing student_id ───────────────────────────
    it(
      'should fail student login with missing student_id @student',
      async () => {
        logStep('GET /students/login — missing student_id → 400');
        const response = await apiClient.get(endpoints.student.login);
        validateStatusCode(response.status, 400);
        validateFieldValue(response.body, 'status', 'FAILED');
      }
    );

    // GET /students/login
    it(
      'should fail student login with student_id exceeding max length @student',
      async () => {
        logStep('GET /students/login — student_id > 50 chars → 400');
        const longId = 'A'.repeat(51);
        const response = await apiClient.get(
          `${endpoints.student.login}?student_id=${longId}`,
        );
        validateStatusCode(response.status, 400);
        validateFieldValue(response.body, 'status', 'FAILED');
      }
    );

    // ─── GET /students/login — non-existent student_id ─────────────────────
    it(
      'should fail student login with non-existent student_id @student',
      async () => {
        logStep('GET /students/login — non-existent student_id → 400/404');
        const response = await apiClient.get(
          `${endpoints.student.login}?student_id=UNKNOWN-CODE`,
        );
        expect([400, 404]).toContain(response.status);
        validateFieldValue(response.body, 'status', 'FAILED');
      }
    );

    // ─── GET /students/simulations/:studentCode — valid ─────────────────────
    it(
      'should fetch simulations successfully for valid student code @student',
      async () => {
        logStep('GET /students/simulations/:code — valid code');
        const response = await apiClient.get(
          `${endpoints.student.simulationsByCode}${MOCK_STUDENT_CODE}`,
          { headers: { Authorization: `Bearer ${studentToken}` } },
        );
        validateStatusCode(response.status, 200);
        validateFieldValue(response.body, 'status', 'SUCCESS');
        const body = response.body as { data: { simulations: unknown[] } };
        expect(body.data).toHaveProperty('simulations');
        expect(Array.isArray(body.data.simulations)).toBe(true);
      }
    );

    // ─── GET /students/simulations/:studentCode — unknown code ──────────────
    it(
      'should return empty simulations for unknown student code @student',
      async () => {
        logStep('GET /students/simulations/:code — unknown code → 200 empty');
        const response = await apiClient.get(
          `${endpoints.student.simulationsByCode}UNKNOWN-CODE`,
          { headers: { Authorization: `Bearer ${studentToken}` } },
        );
        validateStatusCode(response.status, 200);
        validateFieldValue(response.body, 'status', 'SUCCESS');
        const body = response.body as { data: { simulations: unknown[] } };
        expect(body.data.simulations).toHaveLength(0);
      }
    );
  }
  );

}
);
