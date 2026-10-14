/**
 * API Types and Interfaces
 * Enterprise-grade TypeScript definitions for Reality Works API testing
 * Replaces all unsafe `any` types with proper interfaces
 */

// ============================================================================
// Authentication Types
// ============================================================================

/**
 * Token pair returned from authentication endpoints
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

/**
 * User credentials for login/signup
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface BaseApiResponse<T> {
  status: string;

  message: string;

  data: T;
}
/**
 * User registration data
 */
export interface SignupData extends LoginCredentials {
  full_name: string;
}

/**
 * User data from test fixtures
 */
export interface TestUser {
  full_name: string;
  email: string;
  password: string;
}

/**
 * Login user data from test fixtures
 */
export interface LoginUserData {
  email: string;
  password: string;
}

/**
 * Redeem code data
 */
export interface RedeemCodeData {
  code: string;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Generic API response wrapper — the unified `{ message, data, meta, error }` envelope every
 * route produces.
 */
export interface ApiResponse<T = unknown> {
  message: string;
  data: T | null;
  meta?: unknown;
  error?: string | ApiError[] | null;
  timestamp?: string;
}

/**
 * API error details
 */
export interface ApiError {
  field?: string;
  message: string;
  code?: string;
}

/**
 * Login API response data
 */
export interface LoginResponseData {
  status: string;

  message: string;

  data: {
    tokens: {
      accessToken: string;

      refreshToken?: string;
    };

    user: {
      id: string;

      email: string;
    };
  };
}
/**
 * User information in response
 */
export interface UserInfo {
  id: string;
  email: string;
  full_name: string;
  type: 'admin' | 'educator' | 'student';
}

/**
 * License/Redeem response data
 */
export interface RedeemResponseData {
  licenseId?: string;
  message?: string;
}

// ============================================================================
// School Types
// ============================================================================

/**
 * School data structure
 */
export interface SchoolData {
  id: string;
  school_name: string;
  school_code?: string;
  principal_name?: string;
  address?: string;
  email?: string;
  phone?: string;
  state?: string;
  district?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * School creation request
 */
export interface CreateSchoolDto {
  school_name: string;
  school_code?: string;
  principal_name?: string;
  address?: string;
  email?: string;
  phone?: string;
  state?: string;
  district?: string;
}

// ============================================================================
// Educator Types
// ============================================================================

/**
 * Educator data structure
 */
export interface EducatorData {
  id: string;
  firstName: string;
  lastName?: string;
  email: string;
  school_id: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at?: string;
  updated_at?: string;
}

/**
 * Educator creation request
 */
export interface CreateEducatorDto {
  firstName: string;
  lastName?: string;
  email: string;
  school_id: string;
}

/**
 * Educator invite data
 */
export interface EducatorInviteDto {
  email: string;
  school_id: string;
  role?: string;
}

// ============================================================================
// Class Types
// ============================================================================

/**
 * Class data structure
 */
export interface ClassData {
  id: string;
  class_name: string;
  class_code?: string;
  grade: string;
  section?: string;
  educator_id: string;
  school_id: string;
  status: 'ACTIVE' | 'INACTIVE';
  total_students: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Class creation request
 */
export interface CreateClassDto {
  class_name: string;
  class_code?: string;
  grade: string;
  section?: string;
  school_id: string;
}

// ============================================================================
// Dashboard Types
// ============================================================================

/**
 * Dashboard overview data
 */
export interface DashboardOverview {
  total_schools?: number;
  total_educators?: number;
  total_classes?: number;
  total_students?: number;
  active_simulations?: number;
  recent_activities?: ActivityLog[];
}

/**
 * Activity log entry
 */
export interface ActivityLog {
  id: string;
  action: string;
  timestamp: string;
  user_id: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// HTTP Client Types
// ============================================================================

/**
 * Request options for API client
 */
export interface RequestOptions {
  headers?: Record<string, string>;
  data?: unknown;
  params?: Record<string, unknown>;
  includeAuth?: boolean;
}

/**
 * HTTP response from API client
 */
export interface HttpResponse<T = unknown> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: T;
  ok: boolean;
  url: string;
}

/**
 * Token storage key type
 */
export type TokenKey = string;

/**
 * Authorization header type
 */
export interface AuthorizationHeader {
  Authorization?: string;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation result from validators
 */
export interface ValidationResult {
  passed: boolean;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

// ============================================================================
// Test Data Types
// ============================================================================

/**
 * Complete register API test data
 */
export interface RegisterApiTestData {
  loginUser: {
    email: string;

    password: string;
  };

  educatorLogin: {
    email: string;

    password: string;
  };

  educatorcreate: {
    firstName: string;

    password: string;

    email: string;
  };
}

/**
 * Complete login API test data
 */
export interface LoginApiTestData {
  redeemCode: RedeemCodeData;
  [key: string]: unknown;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Generic collection response
 */
export interface CollectionResponse<T> {
  items: T[];
  total: number;
  page?: number;
  limit?: number;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  page: number;
  limit: number;
  sort?: string;
  order?: 'ASC' | 'DESC';
}

/**
 * Search filter parameters
 */
export interface FilterParams {
  search?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  [key: string]: unknown;
}

/**
 * File upload type
 */
export interface FileUpload {
  filename: string;
  mimetype: string;
  size: number;
  data: Buffer;
}

/**
 * Assertion message callback
 */
export type AssertionCallback = (message: string, passed: boolean) => void;

/**
 * Error type for API errors — the unified error envelope `HttpExceptionFilter` produces.
 */
export interface ApiErrorResponse {
  message: string;
  data: null;
  meta: null;
  error: string | Record<string, string>;
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * Configuration interface
 */
export interface TestConfig {
  baseURL: string;
  maxRetries: number;
  retryDelay: number;
  logLevel: string;
}

// ============================================================================
// Logger Types
// ============================================================================

/**
 * Log levels
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Logger interface
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
  debug(message: string): void;
}
