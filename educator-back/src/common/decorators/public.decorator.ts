import { CustomDecorator, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/**
 * Opts a route (or a whole controller) out of the global default-deny `AuthGuard` — no token is
 * read or required. Use only for routes that must be reachable without an account, per the
 * public-route rule in ADR-0005 (docs/adr/0005-single-global-default-deny-auth-guard.md).
 */
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);
