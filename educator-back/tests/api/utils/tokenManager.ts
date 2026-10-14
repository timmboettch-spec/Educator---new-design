/**
 * Token Manager Utility
 * Manages authentication tokens throughout test execution
 * Handles token storage, retrieval, and cleanup
 */

class TokenManager {
  private tokens: Map<string, string> = new Map();

  private defaultTokenKey = 'defaultToken';

  /**
   * Store a token
   * @param token - Token value
   * @param key - Optional token key (default: 'defaultToken')
   */
  setToken(token: string, key: string = this.defaultTokenKey): void {
    this.tokens.set(key, token);
  }

  /**
   * Retrieve a token
   * @param key - Token key (default: 'defaultToken')
   * @returns Token value or undefined
   */
  getToken(key: string = this.defaultTokenKey): string | undefined {
    return this.tokens.get(key);
  }

  /**
   * Check if token exists
   * @param key - Token key (default: 'defaultToken')
   * @returns true if token exists
   */
  hasToken(key: string = this.defaultTokenKey): boolean {
    return this.tokens.has(key);
  }

  /**
   * Get Authorization header
   * @param key - Token key (default: 'defaultToken')
   * @returns Authorization header object or empty object
   */
  getAuthorizationHeader(key: string = this.defaultTokenKey): Record<string, string> {
    const token = this.getToken(key);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Set CSRF token
   * @param token - CSRF token value
   */
  setCsrfToken(token: string): void {
    this.setToken(token, 'csrfToken');
  }

  /**
   * Get CSRF token
   * @returns CSRF token or undefined
   */
  getCsrfToken(): string | undefined {
    return this.getToken('csrfToken');
  }

  /**
   * Get CSRF token header
   * @returns Object with x-csrf-token header or empty object
   */
  getCsrfTokenHeader(): Record<string, string> {
    const token = this.getCsrfToken();
    return token ? { 'x-csrf-token': token } : {};
  }

  /**
   * Clear specific token
   * @param key - Token key (default: 'defaultToken')
   */
  clearToken(key: string = this.defaultTokenKey): void {
    this.tokens.delete(key);
  }

  /**
   * Clear all tokens
   */
  clearAllTokens(): void {
    this.tokens.clear();
  }

  /**
   * Extract token from response
   * Supports common response structures: token, access_token, data.token
   * @param response - API response object
   * @param key - Token key for storage (default: 'defaultToken')
   * @returns Extracted token or null
   */
  extractTokenFromResponse(response: unknown, key: string = this.defaultTokenKey): string | null {
    let token: string | null = null;

    // Try common token field names
    const tokenPaths = [
      'token',
      'access_token',
      'data.token',
      'result.token',
      'data.tokens.accessToken',
    ];

    for (const path of tokenPaths) {
      const value = this.getNestedProperty(response, path);
      if (typeof value === 'string' && value.length > 0) {
        token = value;
        break;
      }
    }

    if (token) {
      this.setToken(token, key);
    }

    return token;
  }

  /**
   * Get nested property from object using dot notation
   * @param obj - Object to search
   * @param path - Dot-notation path (e.g., 'user.profile.name')
   * @returns Value at path or undefined
   */
  private getNestedProperty(obj: unknown, path: string): unknown {
    if (!obj || typeof obj !== 'object') {
      return undefined;
    }

    let current: unknown = obj;

    for (const prop of path.split('.')) {
      if (current !== null && typeof current === 'object') {
        current = (current as Record<string, unknown>)[prop];
      } else {
        return undefined;
      }
    }

    return current;
  }
}

// Export singleton instance
export const tokenManager = new TokenManager();

export default tokenManager;
