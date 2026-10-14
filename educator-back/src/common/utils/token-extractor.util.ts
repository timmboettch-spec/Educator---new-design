import type { Request } from 'express';
import { COOKIE_KEYS } from '../constants';
import { Socket } from 'socket.io';

/**
 * Reads the access token from the `accessToken` cookie (requires
 * `cookie-parser` to be mounted globally — see `src/main.ts`).
 */
export function extractAccessTokenFromCookies(req: Request): string | null {
  const cookies = req as unknown as { cookies?: Record<string, string> };
  return cookies.cookies?.[COOKIE_KEYS.ACCESS_TOKEN] ?? null;
}

/**
 * Reads the access token from the `accessToken` cookie found in a raw
 * `Cookie` header string. Used where `cookie-parser` hasn't run against the
 * request — e.g. a Socket.IO handshake.
 */
export function extractAccessTokenFromCookieHeader(
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader) return null;

  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_KEYS.ACCESS_TOKEN}=([^;]*)`));

  if (!match || !match[1]) return null;

  return decodeURIComponent(match[1]);
}

/** Reads `Authorization: Bearer <token>` from a plain Express request. */
export function extractAccessTokenFromAuthHeader(req: Request): string | null {
  const authHeader = req.headers?.authorization;
  if (typeof authHeader !== 'string') return null;

  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  return match ? match[1].trim() || null : null;
}

/**
 * Decodes a JWT's payload WITHOUT verifying its signature or expiry. Only for choosing a
 * clearer error message after verification has already failed — never for authorization.
 */
export function decodeUnverifiedJwtPayload(token: string): Record<string, unknown> | null {
  const payloadSegment = token.split('.')[1];
  if (!payloadSegment) return null;
  try {
    const payload: unknown = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8'));
    return typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Header-first, cookie-fallback token extraction for plain Express-style requests. */
export function extractAccessToken(req: Request): string | null {
  return extractAccessTokenFromAuthHeader(req) ?? extractAccessTokenFromCookies(req);
}


/** Extract token for the Socket connection request */
export function extractAccessTokenForSocket(client: Socket) {
  const { auth, headers } = client.handshake;
  const bearerToken = headers.authorization?.replace(/^Bearer\s+/i, '');

  return (
    (auth?.token as string | undefined) ||
    bearerToken ||
    extractAccessTokenFromCookieHeader(headers.cookie)
  );
}