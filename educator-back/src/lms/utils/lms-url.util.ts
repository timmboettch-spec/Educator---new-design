import { BadRequestException } from '@nestjs/common';
import { isIP } from 'node:net';
import { LmsSchoolConfig } from 'src/database/entities';

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function collectAllowedLmsHosts(config: LmsSchoolConfig): Set<string> {
  const hosts = new Set<string>();
  for (const raw of [
    config.issuer,
    config.authEndpoint,
    config.tokenEndpoint,
    config.jwksUrl,
    config.lmsBaseUrl,
  ]) {
    if (!raw) continue;
    const host = hostFromUrl(raw);
    if (host) {
      hosts.add(host);
    }
  }
  return hosts;
}

export function isLineItemUrlAllowed(lineItemUrl: string, config: LmsSchoolConfig): boolean {
  const targetHost = hostFromUrl(lineItemUrl);
  if (!targetHost) {
    return false;
  }
  return collectAllowedLmsHosts(config).has(targetHost);
}

export function assertLineItemUrlAllowed(lineItemUrl: string, config: LmsSchoolConfig): void {
  if (!isLineItemUrlAllowed(lineItemUrl, config)) {
    throw new Error(`Line item URL host is not allowed for school ${config.schoolId}`);
  }
}

/** AGS scores URL — append /scores to the path, not after query params (Moodle requirement). */
export function buildAgsScoreUrl(lineItemUrl: string): string {
  const url = new URL(lineItemUrl);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/scores`;
  return url.toString();
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'kubernetes.default',
  'kubernetes.default.svc',
]);

function isPrivateOrMetadataIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateOrMetadataIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  // Unique local (fc00::/7) and link-local (fe80::/10)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return true;
  }
  return false;
}

/** True when hostname is localhost/metadata or a private/link-local/metadata IP literal. */
export function isBlockedLmsOutboundHost(hostname: string): boolean {
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost') || host.endsWith('.local')) {
    return true;
  }

  const ipVersion = isIP(host);
  if (ipVersion === 4) return isPrivateOrMetadataIpv4(host);
  if (ipVersion === 6) return isPrivateOrMetadataIpv6(host);
  return false;
}

function parseOutboundLmsUrl(rawUrl: string): URL {
  const trimmed = String(rawUrl ?? '').trim();
  if (!trimmed) {
    throw new BadRequestException('NRPS URL is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new BadRequestException('NRPS URL is invalid');
  }

  if (parsed.protocol !== 'https:') {
    throw new BadRequestException('NRPS URL must use HTTPS');
  }

  const host = parsed.hostname.toLowerCase();
  if (isBlockedLmsOutboundHost(host)) {
    throw new BadRequestException('NRPS URL host is not allowed');
  }

  return parsed;
}

/**
 * Baseline SSRF checks when school LMS config is unavailable (HTTPS + no private/metadata hosts).
 */
export function assertSafeLmsOutboundUrl(url: string): void {
  parseOutboundLmsUrl(url);
}

export function isNrpsUrlAllowed(nrpsUrl: string, config: LmsSchoolConfig): boolean {
  try {
    const parsed = parseOutboundLmsUrl(nrpsUrl);
    return collectAllowedLmsHosts(config).has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Reject NRPS URLs that are not HTTPS, target private/metadata hosts, or whose host
 * is outside the school LMS allowlist (issuer / JWKS / token / base URL).
 */
export function assertNrpsUrlAllowed(nrpsUrl: string, config: LmsSchoolConfig): void {
  const parsed = parseOutboundLmsUrl(nrpsUrl);
  const host = parsed.hostname.toLowerCase();
  if (!collectAllowedLmsHosts(config).has(host)) {
    throw new BadRequestException(`NRPS URL host is not allowed for school ${config.schoolId}`);
  }
}
