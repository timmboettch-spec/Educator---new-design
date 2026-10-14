import { LmsConstants } from '../lms.constants';

/** Plain-language message for a standard OAuth error code in a token-endpoint body, if any. */
export function oauthErrorMessage(body: string): string | null {
  const trimmed = (body ?? '').trim();
  let code: string;
  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown };
    code = typeof parsed.error === 'string' ? parsed.error : '';
  } catch {
    code = /^[a-z_]+$/.test(trimmed) ? trimmed : '';
  }
  return LmsConstants.OAUTH_ERRORS[code.trim().toLowerCase()] ?? null;
}

export function isFriendlyOauthError(message: string): boolean {
  return Object.values(LmsConstants.OAUTH_ERRORS).includes(message);
}

/**
 * Turn LMS HTTP error bodies into short, user-safe messages.
 * Never surface HTML or long raw payloads in API responses / toasts.
 */
export function sanitizeLmsErrorBody(body: string, maxLen = 120): string {
  const trimmed = (body ?? '').trim();
  if (!trimmed) {
    return '';
  }

  const looksLikeHtml = /<!DOCTYPE|<html[\s>]|<head[\s>]|<body[\s>]|<style[\s>]|<h1[\s>]/i.test(
    trimmed,
  );

  if (looksLikeHtml) {
    const heading = trimmed.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim();
    return heading || 'Unexpected response from LMS';
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      error?: string;
      error_description?: string;
      message?: string;
      exception?: string;
    };
    const fromJson =
      parsed.error_description || parsed.message || parsed.exception || parsed.error || '';
    if (fromJson.trim()) {
      return fromJson.trim().slice(0, maxLen);
    }
  } catch {
    // not JSON — fall through
  }

  const singleLine = trimmed.replace(/\s+/g, ' ');
  return singleLine.slice(0, maxLen);
}

export function formatLmsHttpFailure(
  status: number,
  body: string,
  context: 'oauth' | 'api' | 'moodle' | 'canvas' = 'oauth',
): string {
  if (context === 'oauth') {
    const friendly = oauthErrorMessage(body);
    if (friendly) {
      return friendly;
    }
  }
  const safe = sanitizeLmsErrorBody(body);
  const hintByStatus: Record<number, string> = {
    401: 'Check Client ID, API token, and LMS registration.',
    403: 'The LMS rejected access. Check permissions and token scopes.',
    404: 'LMS endpoint not found. Check Issuer URL / base URL.',
    500: 'The LMS returned a server error. Try again later.',
    502: 'The LMS is unreachable. Check the URL and network access.',
    503: 'The LMS is temporarily unavailable.',
  };

  const defaultHint =
    context === 'oauth'
      ? 'Check Issuer URL, Client ID, and that the LTI tool is registered.'
      : 'Check LMS base URL and API / web service token.';

  const hint = hintByStatus[status] ?? defaultHint;
  const detail = safe ? ` ${safe}.` : '';
  return `LMS connection failed (${status}).${detail} ${hint}`;
}
