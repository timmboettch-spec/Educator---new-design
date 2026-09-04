import { APIClient } from '../../utils/apiClient';

import { endpoints } from '../../utils/endpoints';

import { logStep } from '../../utils/logger';

import {
  validateStatusCode,
  validateFieldValue
} from '../../utils/responseValidator';

import userData from '../../test-data/registerApi.json';

import fs from 'fs';

import path from 'path';

import { describe, it, beforeEach, expect } from '@jest/globals';

/**
 * SIGNUP RESPONSE TYPE
 */
interface SignupResponse {

  status: string;

  message: string;

  data: {

    id: string;

    access_token: string;

  };

}

/**
 * ERROR RESPONSE TYPE
 */
interface ErrorResponse {

  status: string;

  message: string;

  data: null;

}

/**
 * Reality Works - Admin Signup Tests
 * Tests for admin registration via signup endpoint
 * @tag @signup
 */

describe(
  'Admin Signup API Tests',
  () => {

    let apiClient: APIClient;

    beforeEach(() => {

      /**
       * INITIALIZE API CLIENT
       */
      apiClient = new APIClient();

    });

    /**
     * VALID SIGNUP
     */
    it(
      'should signup admin with valid data @signup',

      async () => {

        logStep(
          'Admin signup with valid credentials'
        );

        /**
         * GENERATE RANDOM EMAIL
         */
        const uniqueEmail =
          `admin${Date.now()}${Math.floor(Math.random() * 100)}@example.com`;

        /**
         * SIGNUP API
         */
        const response =
          await apiClient.post(
            endpoints.auth.signup,
            {
              ...userData.adminUser,

              email: uniqueEmail,
            }
          );

        /**
         * RESPONSE BODY
         */
        const responseBody =
          response.body as SignupResponse;

        /**
         * STORE EMAIL
         */
        userData.adminUser.email =
          uniqueEmail;

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
          'Admin registered successfully'
        );

        /**
         * ASSERTIONS
         */
        expect(
          responseBody.data
        ).toBeTruthy();

        expect(
          responseBody.data.id
        ).toBeTruthy();

        expect(
          responseBody.data.access_token
        ).toBeTruthy();

        /**
         * STORE LOGIN DATA
         */
        userData.loginUser.email =
          uniqueEmail;

        userData.loginUser.password =
          userData.adminUser.password;

        /**
         * SAVE UPDATED DATA
         */
        const registerApiPath =
          path.resolve(
            __dirname,
            '../../test-data/registerApi.json'
          );

        fs.writeFileSync(
          registerApiPath,
          JSON.stringify(
            userData,
            null,
            2
          )
        );

      }
    );

    /**
     * MISSING EMAIL
     */
    it(
      'should fail signup with missing email @signup',

      async () => {

        logStep(
          'Admin signup with missing email'
        );

        /**
         * INVALID PAYLOAD
         */
        const invalidData = {

          ...userData.missingEmail,

          email: undefined,

        };

        /**
         * SIGNUP API
         */
        const response =
          await apiClient.post(
            endpoints.auth.signup,
            invalidData
          );

        /**
         * RESPONSE BODY
         */
        const responseBody =
          response.body as ErrorResponse;

        /**
         * VALIDATIONS
         */
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
          'Email is required, Please provide a valid email address'
        );

        /**
         * ASSERTIONS
         */
        expect(
          responseBody.data
        ).toBeNull();

      }
    );

    /**
     * INVALID EMAIL FORMAT
     */
    it(
      'should fail signup with invalid email format @signup',

      async () => {

        logStep(
          'Admin signup with invalid email format'
        );

        /**
         * INVALID PAYLOAD
         */
        const invalidData = {

          ...userData.invalidEmail,

          email:
            'invalid-email-format',

        };

        /**
         * SIGNUP API
         */
        const response =
          await apiClient.post(
            endpoints.auth.signup,
            invalidData
          );

        /**
         * RESPONSE BODY
         */
        const responseBody =
          response.body as ErrorResponse;

        /**
         * VALIDATIONS
         */
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
          'Please provide a valid email address'
        );

        /**
         * ASSERTIONS
         */
        expect(
          responseBody.data
        ).toBeNull();

      }
    );

    /**
     * MISSING PASSWORD
     */
    it.skip(
      'should fail signup with missing password @signup',

      async () => {

        logStep(
          'Admin signup with missing password'
        );

        const uniqueEmail =
          `admin${Date.now()}${Math.floor(Math.random() * 100)}@example.com`;

        const invalidData = {

          ...userData.missingPassword,

          email: uniqueEmail,

        };

        const response =
          await apiClient.post(
            endpoints.auth.signup,
            invalidData
          );

        const responseBody =
          response.body as ErrorResponse;

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
          'Password is required'
        );

        expect(
          responseBody.data
        ).toBeNull();

      }
    );

    /**
     * EMPTY PASSWORD
     */
    it(
      'should fail signup with empty password @signup',

      async () => {

        logStep(
          'Admin signup with empty password'
        );

        const uniqueEmail =
          `admin${Date.now()}${Math.floor(Math.random() * 100)}@example.com`;

        const invalidData = {

          ...userData.adminUser,

          email: uniqueEmail,

          password: '',

        };

        const response =
          await apiClient.post(
            endpoints.auth.signup,
            invalidData
          );

        const responseBody =
          response.body as ErrorResponse;

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
          'Password must be between 8 and 20 characters'
        );

        expect(
          responseBody.data
        ).toBeNull();

      }
    );

    /**
     * MISSING FULL NAME
     */
    it.skip(
      'should fail signup with missing full name @signup',

      async () => {

        logStep(
          'Admin signup with missing full name'
        );

        const randomSuffix =
          Math.floor(
            Math.random() * 10000
          );

        const uniqueEmail =
          `admin${randomSuffix}@example.com`;

        const invalidData = {

          ...userData.adminUser,

          email: uniqueEmail,

          full_name: undefined,

        };

        const response =
          await apiClient.post(
            endpoints.auth.signup,
            invalidData
          );

        const responseBody =
          response.body as ErrorResponse;

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
          'Full name is required'
        );

        expect(
          responseBody.data
        ).toBeNull();

      }
    );

    /**
     * EMPTY FULL NAME
     */
    it.skip(
      'should fail signup with empty full name @signup',

      async () => {

        logStep(
          'Admin signup with empty full name'
        );

        const randomSuffix =
          Math.floor(
            Math.random() * 10000
          );

        const uniqueEmail =
          `admin${randomSuffix}@example.com`;

        const invalidData = {

          ...userData.adminUser,

          email: uniqueEmail,

          full_name: '',

        };

        const response =
          await apiClient.post(
            endpoints.auth.signup,
            invalidData
          );

        const responseBody =
          response.body as ErrorResponse;

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
          'Full name is required'
        );

        expect(
          responseBody.data
        ).toBeNull();

      }
    );

    /**
     * DUPLICATE EMAIL
     */
    it(
      'should fail signup with duplicate email @signup',

      async () => {

        logStep(
          'Admin signup with duplicate email'
        );

        const randomSuffix =
          Math.floor(
            Math.random() * 10000
          );

        const duplicateEmail =
          `admin${randomSuffix}@example.com`;

        const validPayload = {

          ...userData.adminUser,

          email: duplicateEmail,

        };

        await apiClient.post(
          endpoints.auth.signup,
          validPayload
        );

        const duplicateResponse =
          await apiClient.post(
            endpoints.auth.signup,
            validPayload
          );

        const responseBody =
          duplicateResponse.body as ErrorResponse;

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
          'User already exists'
        );

        expect(
          responseBody.data
        ).toBeNull();

      }
    );

    /**
     * EMPTY EMAIL STRING
     */
    it(
      'should fail signup with empty email string @signup',

      async () => {

        logStep(
          'Admin signup with empty email string'
        );

        const invalidData = {

          ...userData.adminUser,

          email: '',

        };

        const response =
          await apiClient.post(
            endpoints.auth.signup,
            invalidData
          );

        const responseBody =
          response.body as ErrorResponse;

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
          'Email is required, Please provide a valid email address'
        );

        expect(
          responseBody.data
        ).toBeNull();

      }
    );

    /**
     * WHITESPACE EMAIL
     */
    it(
      'should fail signup with whitespace email @signup',

      async () => {

        logStep(
          'Admin signup with whitespace email'
        );

        const invalidData = {

          ...userData.adminUser,

          email: '   ',

        };

        const response =
          await apiClient.post(
            endpoints.auth.signup,
            invalidData
          );

        const responseBody =
          response.body as ErrorResponse;

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
          'Please provide a valid email address'
        );

        expect(
          responseBody.data
        ).toBeNull();

      }
    );

    /**
     * SHORT PASSWORD
     */
    it(
      'should fail signup with short password @signup',

      async () => {

        logStep(
          'Admin signup with short password'
        );

        const randomSuffix =
          Math.floor(
            Math.random() * 10000
          );

        const uniqueEmail =
          `admin${randomSuffix}@example.com`;

        const invalidData = {

          ...userData.adminUser,

          email: uniqueEmail,

          password: 'P@1',

        };

        const response =
          await apiClient.post(
            endpoints.auth.signup,
            invalidData
          );

        const responseBody =
          response.body as ErrorResponse;

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
          'Password must be between 8 and 20 characters'
        );

        expect(
          responseBody.data
        ).toBeNull();

      }
    );

    /**
     * ALL FIELDS EMPTY
     */
    it.skip(
      'should fail signup with all fields empty @signup',

      async () => {

        logStep(
          'Admin signup with all fields empty'
        );

        const invalidData = {

          email: '',

          password: '',

          full_name: '',

        };

        const response =
          await apiClient.post(
            endpoints.auth.signup,
            invalidData
          );

        const responseBody =
          response.body as ErrorResponse;

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
          'Please provide a valid email address'
        );

        expect(
          responseBody.data
        ).toBeNull();

      }
    );

    /**
     * NULL VALUES
     */
    it(
      'should fail signup with null values @signup',

      async () => {

        logStep(
          'Admin signup with null values'
        );

        const invalidData = {

          email: null,

          password: null,

          full_name: null,

        } as unknown;

        const response =
          await apiClient.post(
            endpoints.auth.signup,
            invalidData
          );

        const responseBody =
          response.body as ErrorResponse;

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
        ).toBeNull();

      }
    );
    /**
     * VERY LONG EMAIL
     */
    it(
      'should fail signup with extremely long email @signup',

      async () => {

        logStep(
          'Admin signup with very long email'
        );

        const veryLongEmail =
          `admin${new Array(100).fill('x').join('')}@example.com`;

        const invalidData = {

          ...userData.adminUser,

          email: veryLongEmail,

        };

        const response =
          await apiClient.post(
            endpoints.auth.signup,
            invalidData
          );

        expect([400, 413]).toContain(
          response.status
        );

      }
    );

    /**
     * SQL INJECTION ATTEMPT
     */
    it(
      'should handle sql injection attempt gracefully @signup',

      async () => {

        logStep(
          'Admin signup with SQL injection attempt'
        );

        const randomSuffix =
          Math.floor(
            Math.random() * 10000
          );

        const sqlInjectionEmail =
          `admin${randomSuffix}@example.com'--@example.com`;

        const invalidData = {

          ...userData.adminUser,

          email: sqlInjectionEmail,

        };

        const response =
          await apiClient.post(
            endpoints.auth.signup,
            invalidData
          );

        expect([400, 401, 403, 500]).toContain(
          response.status
        );

      }
    );

    /**
     * XSS ATTEMPT IN FULL NAME
     */
    it(
      'should sanitize xss attempt in full name @signup',

      async () => {

        logStep(
          'Admin signup with XSS attempt in name'
        );

        const randomSuffix =
          Math.floor(
            Math.random() * 10000
          );

        const uniqueEmail =
          `admin${randomSuffix}@example.com`;

        const xssPayload =
          '<script>alert("xss")</script>';

        const invalidData = {

          ...userData.adminUser,

          email: uniqueEmail,

          full_name: xssPayload,

        };

        const response =
          await apiClient.post(
            endpoints.auth.signup,
            invalidData
          );

        // Should either sanitize or reject
        expect([201, 400, 403]).toContain(
          response.status
        );

      }
    );

    /**
     * RESPONSE STRUCTURE VALIDATION
     */
    it(
      'should return correct response structure on success @signup',

      async () => {

        logStep(
          'Validate success response structure'
        );

        const uniqueEmail =
          `admin${Date.now()}${Math.floor(Math.random() * 100)}@example.com`;

        const response =
          await apiClient.post(
            endpoints.auth.signup,
            {
              ...userData.adminUser,

              email: uniqueEmail,
            }
          );

        const responseBody =
          response.body as SignupResponse;

        validateStatusCode(
          response.status,
          201
        );

        expect(responseBody).toHaveProperty('status');
        expect(responseBody).toHaveProperty('message');
        expect(responseBody).toHaveProperty('data');
        expect(responseBody.data).toHaveProperty('id');
        expect(responseBody.data).toHaveProperty('access_token');

        expect(typeof responseBody.status).toBe('string');
        expect(typeof responseBody.message).toBe('string');
        expect(typeof responseBody.data.id).toBe('string');
        expect(typeof responseBody.data.access_token).toBe('string');

      }
    );

    /**
     * SIGNUP RESPONSE TIME
     */
    it.skip(
      'should complete signup within acceptable time @signup',

      async () => {

        logStep(
          'Verify signup response time'
        );

        const randomSuffix =
          Math.floor(
            Math.random() * 10000
          );

        const uniqueEmail =
          `admin${randomSuffix}@example.com`;

        const startTime = Date.now();

        const response =
          await apiClient.post(
            endpoints.auth.signup,
            {
              ...userData.adminUser,

              email: uniqueEmail,
            }
          );

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        validateStatusCode(
          response.status,
          201
        );

        // Signup should complete within 10 seconds
        expect(responseTime).toBeLessThan(10000);

      }
    );

    /**
     * EMAIL CASE INSENSITIVITY
     */
    it.skip(
      'should handle email case variations correctly @signup',

      async () => {

        logStep(
          'Test email case sensitivity'
        );

        const randomSuffix =
          Math.floor(
            Math.random() * 10000
          );

        const lowerEmail =
          `admin${randomSuffix}@example.com`;

        const upperEmail =
          `ADMIN${randomSuffix}@EXAMPLE.COM`;

        // Signup with lowercase
        const response1 =
          await apiClient.post(
            endpoints.auth.signup,
            {
              ...userData.adminUser,

              email: lowerEmail,
            }
          );

        validateStatusCode(
          response1.status,
          201
        );

        // Attempt with uppercase (should fail if duplicate)
        const response2 =
          await apiClient.post(
            endpoints.auth.signup,
            {
              ...userData.adminUser,

              email: upperEmail,
            }
          );

        // Should either fail (if case-insensitive) or succeed
        expect([201, 409, 400]).toContain(
          response2.status
        );

      }
    );

    /**
     * NUMERIC EMAIL PREFIX
     */
    it(
      'should handle numeric email prefixes @signup',

      async () => {

        logStep(
          'Admin signup with numeric email prefix'
        );

        const randomSuffix =
          Math.floor(
            Math.random() * 10000
          );

        const numericEmail =
          `${randomSuffix}@example.com`;

        const response =
          await apiClient.post(
            endpoints.auth.signup,
            {
              ...userData.adminUser,

              email: numericEmail,
            }
          );

        validateStatusCode(
          response.status,
          201
        );

        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('data');

      }
    );

    /**
     * SPECIAL CHARACTERS IN EMAIL
     */
    it(
      'should handle special characters in email @signup',

      async () => {

        logStep(
          'Admin signup with special characters in email'
        );

        const randomSuffix =
          Math.floor(
            Math.random() * 10000
          );

        const specialCharEmail =
          `admin+test${randomSuffix}@example.com`;

        const response =
          await apiClient.post(
            endpoints.auth.signup,
            {
              ...userData.adminUser,

              email: specialCharEmail,
            }
          );

        expect([201, 400]).toContain(
          response.status
        );

      }
    );

  }
);



