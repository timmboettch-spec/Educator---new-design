import request, { Test } from 'supertest';

import config from './env';

import { logError } from './logger';

import { tokenManager } from './tokenManager';

import type {
  RequestOptions,
  HttpResponse
} from '../types/api.types';

import * as fs from 'fs';
import * as path from 'path';

// ── Dynamic port resolution for pre-deployment suite ─────────────────────────
const PORT_FILE = path.resolve(__dirname, '../.server-port.json');

/**
 * Resolves the baseURL to use for the current test run:
 * - Pre-deployment: reads http://127.0.0.1:{port}/api from .server-port.json
 * - Smoke / live env: returns the URL from env.ts (BASE_BACKEND_URL)
 */
function resolveTarget(): string {
  if (fs.existsSync(PORT_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(PORT_FILE, 'utf-8')) as { baseURL?: string };
      if (data.baseURL) {
        return data.baseURL;
      }
    } catch {
      // fall through to env config
    }
  }
  return config.baseURL;
}

/**
 * API Client using Supertest
 * Provides HTTP methods for API testing with built-in logging and retry logic
 */

/**
 * Legacy type alias for backwards compatibility
 * Use HttpResponse<T> from api.types.ts in new code
 */
export type APIResponse<T = unknown> =
  HttpResponse<T>;

/**
 * API Client class using Supertest
 */
export class APIClient {

  private baseURL: string;

  private defaultHeaders:
    Record<string, string>;

  private maxRetries: number;

  constructor(
    baseURL: string =
      resolveTarget()
  ) {

    this.baseURL = baseURL;

    this.defaultHeaders = {
      'Content-Type':
        'application/json',
    };

    this.maxRetries =
      config.maxRetries;

  }

  /**
   * Build request headers
   */
  private buildHeaders(
    options: RequestOptions = {}
  ): Record<string, string> {

    const headers:
      Record<string, string> = {

      ...this.defaultHeaders,

      ...(options.headers ?? {}),

    };

    if (options.includeAuth) {

      const authHeader =
        tokenManager
          .getAuthorizationHeader();

      Object.assign(headers, authHeader);

    }

    // Include CSRF token for all requests (including GET)
    // Backend CSRF guard requires CSRF tokens for all methods
    const csrfHeader = tokenManager.getCsrfTokenHeader();
    Object.assign(headers, csrfHeader);

    return headers;

  }

  /**
   * Extract endpoint
   */
  private getEndpoint(
    endpoint: string
  ): string {

    return endpoint.startsWith(
      'http'
    )
      ? endpoint
      : endpoint;

  }

  /**
   * Create request instance
   */
  private createRequest(
    method: string,
    endpoint: string
  ): Test {

    const agent =
      request(this.baseURL);

    switch (
      method.toUpperCase()
    ) {

      case 'GET':

        return agent.get(endpoint);

      case 'POST':

        return agent.post(endpoint);

      case 'PUT':

        return agent.put(endpoint);

      case 'PATCH':

        return agent.patch(endpoint);

      case 'DELETE':

        return agent.delete(endpoint);

      case 'HEAD':

        return agent.head(endpoint);

      default:

        throw new Error(
          `Unsupported HTTP method: ${method}`
        );

    }

  }

  /**
   * Extract response headers
   */
  private extractResponseHeaders(
    response: {
      headers?: unknown;
    }
  ): Record<string, string> {

    if (
      response.headers &&
      typeof response.headers ===
        'object'
    ) {

      return response.headers as
        Record<string, string>;

    }

    return {};

  }

  /**
   * Extract response body
   */
  private extractResponseBody<T>(
    response: {
      body?: unknown;
    }
  ): T {

    return response.body as T;

  }

  /**
   * Auto-extract CSRF token from response body
   */
  private autoExtractCsrfToken<T>(
    body: T
  ): void {
    if (
      body &&
      typeof body === 'object'
    ) {
      const obj = body as Record<string, unknown>;
      if (
        'data' in obj &&
        obj.data &&
        typeof obj.data === 'object'
      ) {
        const data = obj.data as Record<string, unknown>;
        if (
          'tokens' in data &&
          data.tokens &&
          typeof data.tokens === 'object'
        ) {
          const tokens = data.tokens as Record<string, unknown>;
          if (
            'csrfToken' in tokens &&
            typeof tokens.csrfToken === 'string' &&
            tokens.csrfToken.length > 0
          ) {
            tokenManager.setCsrfToken(tokens.csrfToken);
          }
        }
      }
    }
  }

  /**
   * Execute request with retry
   */
  private async executeWithRetry<
    T
  >(
    method: string,
    endpoint: string,
    options: {
      headers?: Record<
        string,
        string
      >;
      data?: unknown;
      params?: Record<
        string,
        unknown
      >;
    },
    attempt: number = 1
  ): Promise<HttpResponse<T>> {

    try {

      let req: Test =
        this.createRequest(
          method,
          endpoint
        );

      /**
       * ADD HEADERS
       */
      if (options.headers) {

        req =
          req.set(
            options.headers
          );

      }

      /**
       * ADD BODY
       */
      if (options.data) {

        let bodyData:
          | string
          | object
          | undefined;

        if (
          typeof options.data ===
          'string'
        ) {

          bodyData =
            JSON.parse(
              options.data
            ) as object;

        } else if (
          typeof options.data ===
            'object' &&
          options.data !== null
        ) {

          bodyData =
            options.data;

        }

        req =
          req.send(bodyData);

      }

      /**
       * ADD QUERY PARAMS
       */
      if (options.params) {

        req =
          req.query(
            options.params
          );

      }

      /**
       * EXECUTE REQUEST
       */
      const response =
        await req;

      /**
       * RESPONSE STATUS
       */
      const status =
        typeof response.status ===
        'number'
          ? response.status
          : 500;

      const body =
        this.extractResponseBody<T>(
          response
        );

      // Auto-extract CSRF token from response if present
      this.autoExtractCsrfToken(body);

      return {

        status,

        statusText:
          String(status),

        headers:
          this.extractResponseHeaders(
            response
          ),

        body,

        ok:
          status >= 200 &&
          status < 300,

        url:
          `${this.baseURL}${endpoint}`,

      };

    } catch (
      error: unknown
    ) {

      if (
        attempt <
        this.maxRetries
      ) {

        logError(
          `Request failed, retrying... (${attempt}/${this.maxRetries})`
        );

        await this.delay(
          config.retryDelay
        );

        return this.executeWithRetry<T>(
          method,
          endpoint,
          options,
          attempt + 1
        );

      }

      logError(
        `Request failed after ${this.maxRetries} attempts`,
        error
      );

      throw error;

    }

  }

  /**
   * Delay utility
   */
  private delay(
    ms: number
  ): Promise<void> {

    return new Promise(
      resolve =>
        setTimeout(
          resolve,
          ms
        )
    );

  }

  /**
   * GET request
   */
  async get<T = unknown>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<HttpResponse<T>> {

    const headers =
      this.buildHeaders(
        options
      );

    return this.executeWithRetry<T>(
      'GET',
      this.getEndpoint(
        endpoint
      ),
      {
        headers,

        params:
          options.params,
      }
    );

  }

  /**
   * POST request
   */
  async post<T = unknown>(
    endpoint: string,
    data?: unknown,
    options: RequestOptions = {}
  ): Promise<HttpResponse<T>> {

    const headers =
      this.buildHeaders(
        options
      );

    return this.executeWithRetry<T>(
      'POST',
      this.getEndpoint(
        endpoint
      ),
      {
        headers,

        data:
          data ??
          options.data,
      }
    );

  }

  /**
   * PUT request
   */
  async put<T = unknown>(
    endpoint: string,
    data?: unknown,
    options: RequestOptions = {}
  ): Promise<HttpResponse<T>> {

    const headers =
      this.buildHeaders(
        options
      );

    return this.executeWithRetry<T>(
      'PUT',
      this.getEndpoint(
        endpoint
      ),
      {
        headers,

        data:
          data ??
          options.data,
      }
    );

  }

  /**
   * PATCH request
   */
  async patch<T = unknown>(
    endpoint: string,
    data?: unknown,
    options: RequestOptions = {}
  ): Promise<HttpResponse<T>> {

    const headers =
      this.buildHeaders(
        options
      );

    return this.executeWithRetry<T>(
      'PATCH',
      this.getEndpoint(
        endpoint
      ),
      {
        headers,

        data:
          data ??
          options.data,
      }
    );

  }

  /**
   * DELETE request
   */
  async delete<T = unknown>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<HttpResponse<T>> {

    const headers =
      this.buildHeaders(
        options
      );

    return this.executeWithRetry<T>(
      'DELETE',
      this.getEndpoint(
        endpoint
      ),
      {
        headers,
      }
    );

  }

  /**
   * HEAD request
   */
  async head<T = unknown>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<HttpResponse<T>> {

    const headers =
      this.buildHeaders(
        options
      );

    return this.executeWithRetry<T>(
      'HEAD',
      this.getEndpoint(
        endpoint
      ),
      {
        headers,
      }
    );

  }

}

export default APIClient;