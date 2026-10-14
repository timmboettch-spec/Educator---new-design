/**
 * Resolve the API base URL for backend requests.
 *
 * Checks VITE_API_URL env var first, falls back to localhost:3000 for local dev.
 * Strips any trailing slash for consistent URL concatenation.
 */
export function getApiBase(): string {
  return (
    (import.meta.env.VITE_API_URL as string | undefined)?.trim() ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}
