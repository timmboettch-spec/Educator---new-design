import { expect } from '@jest/globals';

import { logAssertion } from './logger';

import type { ValidationResult } from '../types/api.types';

/**
 * Response Validator Utility
 * Provides reusable validation
 * functions for API responses
 */

/**
 * Convert unknown value safely
 */
function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Validate HTTP status code
 */
export const validateStatusCode = (
  actualStatus: number,
  expectedStatus: number,
): ValidationResult => {
  const passed = actualStatus === expectedStatus;

  const result: ValidationResult = {
    passed,

    message: `Status code should be ${expectedStatus}`,

    expected: expectedStatus,

    actual: actualStatus,
  };

  logAssertion(result.message, passed);

  /**
   * IMPORTANT
   * Fail test if validation fails
   */
  expect(actualStatus).toBe(expectedStatus);

  return result;
};

/**
 * Validate response headers
 */
export const validateHeaders = (
  headers: Record<string, string>,

  expectedHeaders: Record<string, string>,
): ValidationResult => {
  const missing: string[] = [];

  for (const [key, value] of Object.entries(expectedHeaders)) {
    const headerValue = headers[key.toLowerCase()];

    if (!headerValue || !headerValue.includes(value)) {
      missing.push(`${key}: ${value}`);
    }
  }

  const passed = missing.length === 0;

  const result: ValidationResult = {
    passed,

    message: `Response headers should contain: ${Object.keys(expectedHeaders).join(', ')}`,

    expected: expectedHeaders,

    actual: missing.length > 0 ? missing : headers,
  };

  logAssertion(result.message, passed);

  expect(passed).toBe(true);

  return result;
};

/**
 * Validate response body
 * is not empty
 */
export const validateBodyNotEmpty = (body: unknown): ValidationResult => {
  const isObject = body !== null && typeof body === 'object';

  const isEmpty = !isObject || Object.keys(body).length === 0;

  const passed = !isEmpty;

  const result: ValidationResult = {
    passed,

    message: 'Response body should not be empty',

    actual: body,
  };

  logAssertion(result.message, passed);

  expect(passed).toBe(true);

  return result;
};

/**
 * Get nested property
 * using dot notation
 */
function getNestedProperty(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') {
    return undefined;
  }

  return path.split('.').reduce(
    (current: unknown, prop: string): unknown => {
      if (current !== null && typeof current === 'object') {
        return (current as Record<string, unknown>)[prop];
      }

      return undefined;
    },

    obj,
  );
}

/**
 * Validate field exists
 * and value matches
 */
export const validateFieldValue = (
  body: unknown,
  fieldPath: string,
  expectedValue?: unknown,
): ValidationResult => {
  const value = getNestedProperty(body, fieldPath);

  const passed =
    expectedValue === undefined ? value !== undefined && value !== null : value === expectedValue;

  const result: ValidationResult = {
    passed,

    message:
      expectedValue !== undefined
        ? `Field '${fieldPath}' should be ${safeStringify(expectedValue)}`
        : `Field '${fieldPath}' should exist`,

    expected: expectedValue ?? 'exists',

    actual: value,
  };

  logAssertion(result.message, passed);

  expect(value).toBe(expectedValue);

  return result;
};

/**
 * Validate data type
 */
export const validateDataType = (value: unknown, expectedType: string): ValidationResult => {
  let actualType: string;

  if (Array.isArray(value)) {
    actualType = 'array';
  } else {
    actualType = typeof value;
  }

  const passed = actualType === expectedType;

  const result: ValidationResult = {
    passed,

    message: `Field type should be ${expectedType}`,

    expected: expectedType,

    actual: actualType,
  };

  logAssertion(result.message, passed);

  expect(actualType).toBe(expectedType);

  return result;
};

/**
 * Validate array response
 */
export const validateArrayResponse = (body: unknown, minLength: number = 0): ValidationResult => {
  let array: unknown[] = [];

  if (
    body !== null &&
    typeof body === 'object' &&
    'data' in body &&
    Array.isArray((body as Record<string, unknown>).data)
  ) {
    array = (body as Record<string, unknown>).data as unknown[];
  } else if (Array.isArray(body)) {
    array = body;
  }

  const isArray = Array.isArray(array);

  const passed = isArray && array.length >= minLength;

  const result: ValidationResult = {
    passed,

    message: `Response should be array with minimum ${minLength} items`,

    expected: `array[${minLength}+]`,

    actual: isArray ? `array[${array.length}]` : typeof array,
  };

  logAssertion(result.message, passed);

  expect(isArray).toBe(true);

  expect(array.length).toBeGreaterThanOrEqual(minLength);

  return result;
};

/**
 * Export validators
 */
export default {
  validateStatusCode,

  validateHeaders,

  validateBodyNotEmpty,

  validateFieldValue,

  validateDataType,

  validateArrayResponse,
};
