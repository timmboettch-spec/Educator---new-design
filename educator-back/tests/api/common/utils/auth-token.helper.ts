/**
 * Lightweight in-memory token store for smoke/pre-deployment tests.
 * Each test file imports this singleton; state persists for the Jest worker lifetime.
 */
class AuthTokenHelper {
  private accessToken = '';
  private csrfToken = '';

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  getAccessToken(): string {
    return this.accessToken;
  }

  setCsrfToken(token: string): void {
    this.csrfToken = token;
  }

  getCsrfToken(): string {
    return this.csrfToken;
  }

  /** Returns Authorization header value or empty string if no token. */
  bearerHeader(): string {
    return this.accessToken ? `Bearer ${this.accessToken}` : '';
  }

  clear(): void {
    this.accessToken = '';
    this.csrfToken = '';
  }

  hasToken(): boolean {
    return this.accessToken.length > 0;
  }
}

export const authTokenHelper = new AuthTokenHelper();
