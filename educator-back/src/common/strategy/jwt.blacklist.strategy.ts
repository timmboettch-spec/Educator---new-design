import { Injectable } from '@nestjs/common';
const DEFAULT_TTL_MS = 86_400_000;

function parseJwtExpiry(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8')) as {
      exp?: number;
    };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

@Injectable()
export class TokenBlacklistService {
  private static readonly blacklist = new Map<string, number>();

  add(token: string): void {
    if (!token) return;
    const expiresAtMs = parseJwtExpiry(token) ?? Date.now() + DEFAULT_TTL_MS;
    TokenBlacklistService.blacklist.set(token, expiresAtMs);
  }

  has(token: string): boolean {
    if (!token) return false;
    const expiresAtMs = TokenBlacklistService.blacklist.get(token);
    if (expiresAtMs === undefined) return false;
    if (Date.now() >= expiresAtMs) {
      TokenBlacklistService.blacklist.delete(token);
      return false;
    }
    return true;
  }
}
