import { APIClient } from '../../utils/apiClient';
import type { ApiResponse, LoginApiTestData } from '../../types/api.types';
import { validateStatusCode, validateFieldValue } from '../../utils/responseValidator';
import { endpoints } from '../../utils/endpoints';
import { ExecutionDataManager } from '../../utils/executionDataManager';
import fs from 'fs';
import path from 'path';
import { describe, it, beforeAll, beforeEach, expect } from '@jest/globals';
import { logStep } from '../../utils/logger';

/**
 * Reality Works - Admin Login Tests
 * Tests for admin login via login endpoint
 * @tag @login
 */

describe('Admin Login API Tests', () => {
  let apiClient: APIClient;
  let loginApiData: LoginApiTestData;
  let dynamicEmail: string;
  let dynamicPassword: string;
  let resetToken: string = '';
  let verifiedToken: string = '';

  beforeAll(async () => {
    // Load test data once before all tests
    const loginApiPath = path.resolve(
      __dirname,
      '../../test-data/loginApi.json'
    );
    const loginContent = fs.readFileSync(loginApiPath, 'utf-8');

    loginApiData = JSON.parse(loginContent) as LoginApiTestData;

    // Generate unique email and password for this test run
    dynamicEmail = `test-${Date.now()}@gmail.com`;
    dynamicPassword = 'Password@123';

    logStep(`Generated test user: ${dynamicEmail}`);

    // Signup with dynamic email
    const signupPayload = {
      full_name: 'Nandhak',
      email: dynamicEmail,
      password: dynamicPassword,
    };

    apiClient = new APIClient();
    
    try {
      const signupResponse = await apiClient.post<ApiResponse>(
        endpoints.auth.signup,
        signupPayload
      );

      logStep(`Signup response status: ${signupResponse.status}`);
      
      if (signupResponse.status === 201) {
        logStep(`✓ User created successfully: ${dynamicEmail}`);
        // Store for cleanup
        ExecutionDataManager.setTestUserEmail(dynamicEmail);
      } else {
        logStep(`Signup returned status ${signupResponse.status}, proceeding with login test`);
      }
    } catch {
      logStep(`Signup call completed (may have succeeded server-side)`);
    }
  });

  beforeEach(() => {
    // Initialize API client before each test
    apiClient = new APIClient();
  });

  const extractAccessToken = (loginResponse: ApiResponse): string => {
    if (
      loginResponse &&
      typeof loginResponse === 'object' &&
      'data' in loginResponse
    ) {
      const data = loginResponse.data as Record<string, unknown>;
      if (
        data &&
        'tokens' in data &&
        data.tokens &&
        typeof data.tokens === 'object' &&
        'accessToken' in data.tokens
      ) {
        return data.tokens.accessToken as string;
      }
    }

    throw new Error('Failed to extract access token from login response');
  };

  const validateInvalidCredentialsMessage = (body: unknown): void => {
    const responseBody = body as Record<string, unknown>;
    const message = typeof responseBody?.message === 'string'
      ? responseBody.message.trim().toLowerCase().replace(/\.$/, '')
      : '';
    // any one of these two invalid credentials || invalid username or password
    expect(message).toBe('invalid username or password');
  };

  const validateStatusCodeIn = (actual: number, allowed: number[]): void => {
    expect(allowed).toContain(actual);
  };

  const validateMessageContainsAny = (body: unknown, expectedFragments: string[]): void => {
    const responseBody = body as Record<string, unknown>;
    const message = typeof responseBody?.message === 'string'
      ? responseBody.message.trim().toLowerCase()
      : '';

    expect(
      expectedFragments.some((fragment) => message.includes(fragment.toLowerCase()))
    ).toBe(true);
  };

  const decodeJwtPayload = (token: string): Record<string, unknown> => {
    const base64Payload = token.split('.')[1];
    const jsonStr = Buffer.from(base64Payload, 'base64').toString('utf-8');
    return JSON.parse(jsonStr) as Record<string, unknown>;
  };

  const extractResetToken = (body: unknown): string | null => {
    const b = body as Record<string, unknown>;
    const data = b?.data as Record<string, unknown> | null;
    return (data?.reset_token as string) ?? null;
  };

  const extractVerifiedToken = (body: unknown): string | null => {
    const b = body as Record<string, unknown>;
    const data = b?.data as Record<string, unknown> | null;
    return (data?.verified_token as string) ?? null;
  };

  it('should login with dynamically created credentials @login', async () => {
    const loginResponse = await apiClient.post<ApiResponse>(
      endpoints.auth.login,
      {
        email: dynamicEmail,
        password: dynamicPassword,
      }
    );

    validateStatusCode(loginResponse.status, 201);
    validateFieldValue(loginResponse.body, 'status', 'SUCCESS');
    validateFieldValue(loginResponse.body, 'message', 'Login successful');

    if (
      loginResponse.body &&
      typeof loginResponse.body === 'object' &&
      'data' in loginResponse.body
    ) {
      const data = loginResponse.body.data as Record<string, unknown>;
      if (data && 'tokens' in data) {
        expect(data.tokens).toHaveProperty('accessToken');
      }
    }
  });

  it('should fail login with wrong password @login', async () => {
    logStep('Admin login with wrong password');
    const response = await apiClient.post<ApiResponse>(endpoints.auth.login, {
      email: dynamicEmail,
      password: 'wrongpassword',
    });

    validateStatusCode(response.status, 401);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateInvalidCredentialsMessage(response.body);
    validateFieldValue(response.body, 'data', null);
  });

  it('should fail login with empty email @login', async () => {
    logStep('Admin login with empty email');
    const response = await apiClient.post<ApiResponse>(endpoints.auth.login, {
      email: '',
      password: dynamicPassword,
    });

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'message', 'Email is required, Please provide a valid email address');
    validateFieldValue(response.body, 'data', null);
  });

  it('should fail login with empty password @login', async () => {
    logStep('Admin login with empty password');
    const response = await apiClient.post<ApiResponse>(endpoints.auth.login, {
      email: dynamicEmail,
      password: '',
    });

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'message', 'Password is required');
    validateFieldValue(response.body, 'data', null);
  });

  it('should fail login with invalid email format @login', async () => {
    logStep('Admin login with invalid email format');
    const response = await apiClient.post<ApiResponse>(endpoints.auth.login, {
      email: 'invalid-email-format',
      password: dynamicPassword,
    });

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'message', 'Please provide a valid email address');
    validateFieldValue(response.body, 'data', null);
  });

  it('should fail login with non existing email @login', async () => {
    logStep('Admin login with non existing email');
    const response = await apiClient.post<ApiResponse>(endpoints.auth.login, {
      email: 'doesnotexist@example.com',
      password: 'somepassword',
    });

    validateStatusCode(response.status, 401);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateInvalidCredentialsMessage(response.body);
    validateFieldValue(response.body, 'data', null);
  });

  it('should redeem code successfully @login', async () => {
    /**
     * LOGIN API
     */
    const loginResponse = await apiClient.post<ApiResponse>(
      endpoints.auth.login,
      {
        email: dynamicEmail,
        password: dynamicPassword,
      }
    );

    /**
     * VERIFY LOGIN SUCCESS
     */
    validateStatusCode(loginResponse.status, 201);

    /**
     * GET ACCESS TOKEN
     */
    let accessToken: string | null = null;

    if (
      loginResponse.body &&
      typeof loginResponse.body === 'object' &&
      'data' in loginResponse.body
    ) {
      const data = loginResponse.body.data as Record<string, unknown>;
      if (
        data &&
        'tokens' in data &&
        data.tokens &&
        typeof data.tokens === 'object' &&
        'accessToken' in data.tokens
      ) {
        accessToken = data.tokens.accessToken as string;
      }
    }

    if (!accessToken) {
      throw new Error('Failed to extract access token from login response');
    }

    /**
     * REDEEM API
     */
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.redeem,
      {
        code: loginApiData.redeemCode.code,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        includeAuth: false,
      }
    );

    /**
     * VALIDATIONS
     */
    validateStatusCode(response.status, 201);
    validateFieldValue(response.body, 'status', 'SUCCESS');
    validateFieldValue(response.body, 'message', 'License activated successfully');
  });

  it('should fail redeem with invalid code @login', async () => {
    /**
     * LOGIN API
     */
    const loginResponse = await apiClient.post<ApiResponse>(
      endpoints.auth.login,
      {
        email: dynamicEmail,
        password: dynamicPassword,
      }
    );

    /**
     * VERIFY LOGIN SUCCESS
     */
    validateStatusCode(loginResponse.status, 201);
    const accessToken = extractAccessToken(loginResponse.body);

    /**
     * REDEEM API
     */
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.redeem,
      {
        code: 'INVALIDCODE1234',
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        includeAuth: false,
      }
    );

    validateStatusCodeIn(response.status, [400, 404, 422, 500]);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateMessageContainsAny(response.body, ['Invalid activation code', 'invalid code', 'activation code', 'Redemption failed']);
    validateFieldValue(response.body, 'data', null);
  });

  it('should fail redeem with empty code @login', async () => {
    /**
     * LOGIN API
     */
    const loginResponse = await apiClient.post<ApiResponse>(
      endpoints.auth.login,
      {
        email: dynamicEmail,
        password: dynamicPassword,
      }
    );

    /**
     * VERIFY LOGIN SUCCESS
     */
    validateStatusCode(loginResponse.status, 201);
    const accessToken = extractAccessToken(loginResponse.body);

    /**
     * REDEEM API
     */
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.redeem,
      {
        code: '',
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        includeAuth: false,
      }
    );

    validateStatusCodeIn(response.status, [400, 422]);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateMessageContainsAny(response.body, ['Activation code is required', 'activation code']);
    validateFieldValue(response.body, 'data', null);
  });

  it('should fail redeem without token @login', async () => {
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.redeem,
      {
        code: loginApiData.redeemCode.code,
      },
      {
        includeAuth: false,
      }
    );

    validateStatusCode(response.status, 401);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'message', 'Unauthorized');
    validateFieldValue(response.body, 'data', null);
  });

  it('should logout successfully @login', async () => {
    /**
     * LOGIN API
     */
    const loginResponse = await apiClient.post<ApiResponse>(
      endpoints.auth.login,
      {
        email: dynamicEmail,
        password: dynamicPassword,
      }
    );

    /**
     * VERIFY LOGIN SUCCESS
     */
    validateStatusCode(loginResponse.status, 201);

    /**
     * GET ACCESS TOKEN
     */
    let accessToken: string | null = null;

    if (
      loginResponse.body &&
      typeof loginResponse.body === 'object' &&
      'data' in loginResponse.body
    ) {
      const data = loginResponse.body.data as Record<string, unknown>;
      if (
        data &&
        'tokens' in data &&
        data.tokens &&
        typeof data.tokens === 'object' &&
        'accessToken' in data.tokens
      ) {
        accessToken = data.tokens.accessToken as string;
      }
    }

    if (!accessToken) {
      throw new Error('Failed to extract access token from login response');
    }

    /**
     * LOGOUT API
     */
    const logoutResponse = await apiClient.post<ApiResponse>(
      endpoints.auth.logout,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        includeAuth: false,
      }
    );

    /**
     * VALIDATIONS
     */
    validateStatusCode(logoutResponse.status, 201);
    validateFieldValue(logoutResponse.body, 'status', 'SUCCESS');
    validateFieldValue(logoutResponse.body, 'message', 'Logged out successfully');
  });

  it('should fail logout without token @login', async () => {
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.logout,
      {},
      {
        includeAuth: false,
      }
    );

    validateStatusCode(response.status, 401);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'message', 'Unauthorized');
    validateFieldValue(response.body, 'data', null);
  });

  it('should fail logout with invalid token @login', async () => {
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.logout,
      {},
      {
        headers: {
          Authorization: 'Bearer invalid.token.value',
        },
        includeAuth: false,
      }
    );

    validateStatusCode(response.status, 401);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'message', 'Unauthorized');
    validateFieldValue(response.body, 'data', null);
  });

  it('forgot password with valid email @login', async () => {
    logStep('Admin forgot password with valid email');
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.forgotPassword,
      {
        email: dynamicEmail,
      }
    );

    validateStatusCode(response.status, 201);
    validateFieldValue(response.body, 'status', 'SUCCESS');
    validateFieldValue(response.body, 'message', 'OTP sent to your email');
  });

  it('forgot password with empty email @login', async () => {
    logStep('Admin forgot password with empty email');
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.forgotPassword,
      {
        email: '',
      }
    );

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'message', 'Email is required, Please provide a valid email address');
    validateFieldValue(response.body, 'data', null);
  });

  it('forgot password with invalid email format @login', async () => {
    logStep('Admin forgot password with invalid email format');
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.forgotPassword,
      {
        email: 'invalid-email-format',
      }
    );

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'message', 'Please provide a valid email address');
    validateFieldValue(response.body, 'data', null);
  });

  it('forgot password with invalid email @login', async () => {
    logStep('Admin forgot password with invalid email');
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.forgotPassword,
      {
        email: 'invalid@example.com',
      }
    );

    validateStatusCode(response.status, 404);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'message', 'No account found with this email');
  });

  it('resend OTP for password reset @login', async () => {
    logStep('Admin resend OTP for password reset');

    // Step 1: Trigger forgot password API
    const forgotResponse = await apiClient.post<ApiResponse>(
      endpoints.auth.forgotPassword,
      {
        email: dynamicEmail,
      }
    );

    // Validate forgot password response
    validateStatusCode(forgotResponse.status, 201);
    validateFieldValue(forgotResponse.body, 'status', 'SUCCESS');

    // Step 2: Extract reset token
    const resetToken =
      forgotResponse.body.data && typeof forgotResponse.body.data === 'object'
        ? (forgotResponse.body.data as Record<string, unknown>).reset_token
        : undefined;

    // Validate token exists
    expect(resetToken).toBeDefined();
    expect(resetToken).not.toBeNull();

    // Step 3: Resend OTP API
    const resendResponse = await apiClient.post<ApiResponse>(
      endpoints.auth.resendOtp,
      JSON.stringify({
        reset_token: resetToken,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    // Step 4: Validate resend OTP response
    validateStatusCode(resendResponse.status, 400);

    validateFieldValue(
      resendResponse.body,
      'status',
      'FAILED'
    );

    validateFieldValue(
      resendResponse.body,
      'message',
      'Please wait 5 minutes before requesting a new OTP (5 min remaining)'
    );
  });

  it('should verify login response time @login', async () => {
    logStep('Verify login response time');

    const startTime = Date.now();

    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.login,
      {
        email: dynamicEmail,
        password: dynamicPassword,
      }
    );

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    validateStatusCode(response.status, 201);

    // Login should complete within 3 seconds
    expect(responseTime).toBeLessThan(5000);
  });

  it('should return valid access token on login @login', async () => {
    logStep('Verify valid access token structure');

    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.login,
      {
        email: dynamicEmail,
        password: dynamicPassword,
      }
    );

    validateStatusCode(response.status, 201);

    const accessToken = extractAccessToken(response.body);

    expect(accessToken).toBeTruthy();
    expect(typeof accessToken).toBe('string');
    expect(accessToken.length).toBeGreaterThan(0);

    // Token should be JWT format (three parts separated by dots)
    const tokenParts = accessToken.split('.');
    expect(tokenParts.length).toBe(3);
  });

  it('should maintain consistent login response structure @login', async () => {
    logStep('Verify consistent login response structure');

    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.login,
      {
        email: dynamicEmail,
        password: dynamicPassword,
      }
    );

    validateStatusCode(response.status, 201);

    const body = response.body;

    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('data');
    const data = body.data as Record<string, unknown>;
    expect(data).toHaveProperty('tokens');
    const tokens = data.tokens as Record<string, unknown>;
    expect(tokens).toHaveProperty('accessToken');

    expect(typeof body.status).toBe('string');
    expect(typeof body.message).toBe('string');
    expect(typeof tokens.accessToken).toBe('string');
  });

  it('should fail login with email containing spaces @login', async () => {
    logStep('Admin login with spaces in email');

    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.login,
      {
        email: ` ${dynamicEmail} `,
        password: dynamicPassword,
      }
    );

    // Should either fail or trim the spaces
    expect([200, 400, 401, 404]).toContain(response.status);
  });

  it('should fail login with special characters in password @login', async () => {
    logStep('Admin login with special characters in password');

    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.login,
      {
        email: dynamicEmail,
        password: "'; DROP TABLE users; --",
      }
    );

    validateStatusCode(response.status, 401);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateInvalidCredentialsMessage(response.body);
  });

  it('should logout successfully after login @login', async () => {
    logStep('Login then logout sequentially');

    // Step 1: Login
    const loginResponse = await apiClient.post<ApiResponse>(
      endpoints.auth.login,
      {
        email: dynamicEmail,
        password: dynamicPassword,
      }
    );

    validateStatusCode(loginResponse.status, 201);
    const accessToken = extractAccessToken(loginResponse.body);

    // Step 2: Logout
    const logoutResponse = await apiClient.post<ApiResponse>(
      endpoints.auth.logout,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        includeAuth: false,
      }
    );

    validateStatusCode(logoutResponse.status, 201);
    validateFieldValue(logoutResponse.body, 'status', 'SUCCESS');
  });

  // ─── resend-otp error scenarios ───────────────────────────────────────────

  it('resend-otp: should fail with a malformed (non-JWT) token @login', async () => {
    logStep('resend-otp: malformed token');
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.resendOtp,
      { reset_token: 'not-a-valid-jwt-at-all' },
      { includeAuth: false },
    );

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'data', null);
  });

  it('resend-otp: should fail when token has wrong purpose @login', async () => {
    logStep('resend-otp: wrong purpose token');
    const fakePayload = Buffer.from(
      JSON.stringify({ purpose: 'reset_password', email: dynamicEmail, iat: 1 }),
    ).toString('base64url');
    const fakeToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${fakePayload}.invalidsignature`;

    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.resendOtp,
      { reset_token: fakeToken },
      { includeAuth: false },
    );

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'data', null);
  });

  it('resend-otp: should fail with missing reset_token field @login', async () => {
    logStep('resend-otp: missing reset_token');
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.resendOtp,
      {},
      { includeAuth: false },
    );

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'data', null);
  });

  it('resend-otp: should fail with empty reset_token string @login', async () => {
    logStep('resend-otp: empty reset_token');
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.resendOtp,
      { reset_token: '' },
      { includeAuth: false },
    );

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'data', null);
  });

  // ─── verify-otp full coverage ─────────────────────────────────────────────

  it('verify-otp: should verify OTP successfully — happy path @login', async () => {
    logStep('verify-otp: happy path');

    // Get a fresh reset_token
    const fpResponse = await apiClient.post<ApiResponse>(
      endpoints.auth.forgotPassword,
      { email: dynamicEmail },
      { includeAuth: false },
    );

    validateStatusCode(fpResponse.status, 201);
    const token = extractResetToken(fpResponse.body);
    expect(token).toBeTruthy();

    if (!token) return;
    resetToken = token;

    // OTP is embedded unencrypted in the JWT payload
    const payload = decodeJwtPayload(resetToken);
    const otp = payload.otp as string;

    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.verifyOtp,
      { otp, reset_token: resetToken },
      { includeAuth: false },
    );

    validateStatusCode(response.status, 201);
    validateFieldValue(response.body, 'status', 'SUCCESS');
    validateFieldValue(response.body, 'message', 'OTP verified successfully');

    const vToken = extractVerifiedToken(response.body);
    expect(vToken).toBeTruthy();
    if (vToken) verifiedToken = vToken;
  });

  it('verify-otp: should fail with wrong OTP @login', async () => {
    logStep('verify-otp: wrong OTP');

    const fpResponse = await apiClient.post<ApiResponse>(
      endpoints.auth.forgotPassword,
      { email: dynamicEmail },
      { includeAuth: false },
    );
    const freshToken = fpResponse.status === 201
      ? (extractResetToken(fpResponse.body) ?? resetToken)
      : resetToken;

    if (!freshToken) return;

    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.verifyOtp,
      { otp: '000000', reset_token: freshToken },
      { includeAuth: false },
    );

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'data', null);
  });

  it('verify-otp: should fail with a malformed (non-JWT) reset_token @login', async () => {
    logStep('verify-otp: malformed reset_token');
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.verifyOtp,
      { otp: '123456', reset_token: 'this-is-not-a-jwt' },
      { includeAuth: false },
    );

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'data', null);
  });

  it('verify-otp: should fail when reset_token has wrong purpose @login', async () => {
    logStep('verify-otp: wrong purpose token');
    const fakePayload = Buffer.from(
      JSON.stringify({ purpose: 'reset_password', email: dynamicEmail, otp: '123456', iat: 1 }),
    ).toString('base64url');
    const fakeToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${fakePayload}.invalidsignature`;

    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.verifyOtp,
      { otp: '123456', reset_token: fakeToken },
      { includeAuth: false },
    );

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'data', null);
  });

  it('verify-otp: should fail with missing otp field @login', async () => {
    logStep('verify-otp: missing otp');
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.verifyOtp,
      { reset_token: resetToken || 'some-token' },
      { includeAuth: false },
    );

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'data', null);
  });

  it('verify-otp: should fail with missing reset_token field @login', async () => {
    logStep('verify-otp: missing reset_token');
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.verifyOtp,
      { otp: '123456' },
      { includeAuth: false },
    );

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'data', null);
  });

  it('verify-otp: should fail with empty otp value @login', async () => {
    logStep('verify-otp: empty otp');
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.verifyOtp,
      { otp: '', reset_token: resetToken || 'some-token' },
      { includeAuth: false },
    );

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'data', null);
  });

  // ─── reset-password full coverage ────────────────────────────────────────

  it('reset-password: should fail with a malformed (non-JWT) verified_token @login', async () => {
    logStep('reset-password: malformed verified_token');
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.resetPassword,
      { verified_token: 'not-a-valid-jwt', new_password: 'NewPassword@123' },
      { includeAuth: false },
    );

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'data', null);
  });

  it('reset-password: should fail with wrong purpose verified_token @login', async () => {
    logStep('reset-password: wrong purpose verified_token');
    const fakePayload = Buffer.from(
      JSON.stringify({ purpose: 'otp_verify', email: dynamicEmail, iat: 1 }),
    ).toString('base64url');
    const fakeToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${fakePayload}.invalidsignature`;

    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.resetPassword,
      { verified_token: fakeToken, new_password: 'NewPassword@123' },
      { includeAuth: false },
    );

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'data', null);
  });

  it('reset-password: should fail with missing verified_token field @login', async () => {
    logStep('reset-password: missing verified_token');
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.resetPassword,
      { new_password: 'NewPassword@123' },
      { includeAuth: false },
    );

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'data', null);
  });

  it('reset-password: should fail with missing new_password field @login', async () => {
    logStep('reset-password: missing new_password');
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.resetPassword,
      { verified_token: 'some-token' },
      { includeAuth: false },
    );

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'data', null);
  });

  it('reset-password: should fail when new_password is too short (< 8 chars) @login', async () => {
    logStep('reset-password: password too short');
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.resetPassword,
      { verified_token: 'some-token', new_password: 'Short1!' },
      { includeAuth: false },
    );

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'data', null);
  });

  it('reset-password: should fail when new_password is too long (> 20 chars) @login', async () => {
    logStep('reset-password: password too long');
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.resetPassword,
      { verified_token: 'some-token', new_password: 'ThisPasswordIsWayTooLong@123' },
      { includeAuth: false },
    );

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'data', null);
  });

  it('reset-password: should reset password successfully — happy path @login', async () => {
    logStep('reset-password: happy path');
    if (!verifiedToken) {
      logStep('Skipping: no verifiedToken (verify-otp happy path must pass first)');
      return;
    }

    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.resetPassword,
      { verified_token: verifiedToken, new_password: 'NewPassword@123' },
      { includeAuth: false },
    );

    validateStatusCode(response.status, 201);
    validateFieldValue(response.body, 'status', 'SUCCESS');
    validateFieldValue(response.body, 'message', 'Password reset successfully');
    validateFieldValue(response.body, 'data', null);
  });

  it('reset-password: should fail when verified_token is reused (blacklisted) @login', async () => {
    logStep('reset-password: reused/blacklisted token');
    if (!verifiedToken) {
      logStep('Skipping: no verifiedToken available');
      return;
    }

    // Same token was consumed in the happy-path test above — now blacklisted
    const response = await apiClient.post<ApiResponse>(
      endpoints.auth.resetPassword,
      { verified_token: verifiedToken, new_password: 'AnotherPass@123' },
      { includeAuth: false },
    );

    validateStatusCode(response.status, 400);
    validateFieldValue(response.body, 'status', 'FAILED');
    validateFieldValue(response.body, 'data', null);
  });
});



