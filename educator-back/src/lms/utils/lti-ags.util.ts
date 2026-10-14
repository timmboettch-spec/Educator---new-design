/**
 * Utility functions for LTI Assignment and Grade Services (AGS) claim extraction.
 * LTI 1.3 spec: https://www.imsglobal.org/spec/lti-ags/v2p0
 */

import { AGS_SCORE_SCOPE } from '../lms.constants';

export interface AgsEndpoint {
  scope?: string[];
  lineitems?: string;
  lineitem?: string;
}

const AGS_CLAIM_KEY = 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint';
const RESOURCE_LINK_CLAIM_KEY = 'https://purl.imsglobal.org/spec/lti/claim/resource_link';

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

export function extractAgsEndpoint(payload: Record<string, unknown>): AgsEndpoint | null {
  const agsClaim = readRecord(payload[AGS_CLAIM_KEY]);
  if (!agsClaim) {
    return null;
  }

  const scopeRaw = agsClaim['scope'];
  const lineitemsRaw = agsClaim['lineitems'];
  const lineitemRaw = agsClaim['lineitem'];

  return {
    scope: Array.isArray(scopeRaw)
      ? scopeRaw.filter((scope): scope is string => typeof scope === 'string')
      : undefined,
    lineitems: typeof lineitemsRaw === 'string' ? lineitemsRaw : undefined,
    lineitem: typeof lineitemRaw === 'string' ? lineitemRaw : undefined,
  };
}

export function extractResourceLinkId(payload: Record<string, unknown>): string | null {
  const resourceLinkClaim = readRecord(payload[RESOURCE_LINK_CLAIM_KEY]);
  if (!resourceLinkClaim) {
    return null;
  }

  const id = resourceLinkClaim['id'];
  return typeof id === 'string' ? id : null;
}

export function extractResourceLinkTitle(payload: Record<string, unknown>): string | null {
  const resourceLinkClaim = readRecord(payload[RESOURCE_LINK_CLAIM_KEY]);
  if (!resourceLinkClaim) {
    return null;
  }

  const title = resourceLinkClaim['title'];
  return typeof title === 'string' ? title : null;
}

export function hasScoreScope(agsEndpoint: AgsEndpoint | null): boolean {
  if (!agsEndpoint?.scope) return false;

  return agsEndpoint.scope.some((scope) => scope === AGS_SCORE_SCOPE || scope.includes('/score'));
}

export function getLineItemUrl(agsEndpoint: AgsEndpoint | null): string | null {
  if (!agsEndpoint) return null;
  if (agsEndpoint.lineitem?.trim()) return agsEndpoint.lineitem.trim();
  if (agsEndpoint.lineitems?.trim()) return agsEndpoint.lineitems.trim();
  return null;
}

/** True when the URL points at a line-items collection, not a single gradebook column. */
export function isLineItemsCollectionUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const pathname = new URL(trimmed).pathname.replace(/\/$/, '');
    return /\/line_?items$/i.test(pathname);
  } catch {
    return false;
  }
}
