import { OutboundFetch } from '../../common/interfaces';
import { isLineItemsCollectionUrl } from './lti-ags.util';

const LINE_ITEM_CONTAINER_ACCEPT = 'application/vnd.ims.lis.v2.lineitemcontainer+json';
const LINE_ITEM_ACCEPT = 'application/vnd.ims.lis.v2.lineitem+json';

type LineItemRecord = {
  id?: string;
  label?: string;
  resourceId?: string;
  tag?: string;
};

function readLineItems(payload: unknown): LineItemRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const rawItems = (payload as Record<string, unknown>)['lineItems'];
  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems.filter((item): item is LineItemRecord => !!item && typeof item === 'object');
}

async function fetchLineItemsCollection(
  collectionUrl: string,
  accessToken: string,
  fetchFn: OutboundFetch,
): Promise<LineItemRecord[]> {
  const response = await fetchFn(collectionUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: LINE_ITEM_CONTAINER_ACCEPT,
    },
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`AGS line items GET failed (${response.status}): ${body}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error('AGS line items GET returned invalid JSON');
  }

  return readLineItems(payload);
}

function pickExistingLineItem(
  items: LineItemRecord[],
  resourceLinkId?: string | null,
  label?: string | null,
): string | null {
  const normalizedResourceLinkId = resourceLinkId?.trim();
  if (normalizedResourceLinkId) {
    const byResource = items.find(
      (item) => typeof item.resourceId === 'string' && item.resourceId.trim() === normalizedResourceLinkId,
    );
    if (byResource?.id?.trim()) {
      return byResource.id.trim();
    }
  }

  const normalizedLabel = label?.trim();
  if (normalizedLabel) {
    const byLabel = items.find(
      (item) => typeof item.label === 'string' && item.label.trim() === normalizedLabel,
    );
    if (byLabel?.id?.trim()) {
      return byLabel.id.trim();
    }
  }

  return null;
}

async function createLineItem(
  collectionUrl: string,
  accessToken: string,
  params: { label: string; resourceLinkId?: string | null; scoreMaximum: number },
  fetchFn: OutboundFetch,
): Promise<string> {
  const payload: Record<string, unknown> = {
    scoreMaximum: params.scoreMaximum,
    label: params.label,
    tag: 'realityworks',
  };

  const resourceLinkId = params.resourceLinkId?.trim();
  if (resourceLinkId) {
    payload.resourceId = resourceLinkId;
  }

  const response = await fetchFn(collectionUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: LINE_ITEM_ACCEPT,
      'Content-Type': LINE_ITEM_ACCEPT,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`AGS line item POST failed (${response.status}): ${body}`);
  }

  let created: unknown;
  try {
    created = JSON.parse(body);
  } catch {
    throw new Error('AGS line item POST returned invalid JSON');
  }

  const id =
    created &&
    typeof created === 'object' &&
    typeof (created as Record<string, unknown>)['id'] === 'string'
      ? ((created as Record<string, unknown>)['id'] as string).trim()
      : '';

  if (!id) {
    throw new Error('AGS line item POST did not return an id');
  }

  return id;
}

/**
 * Resolve a concrete line-item URL for score submission.
 * Accepts either a direct line item URL or a line-items collection URL from Canvas.
 */
export async function resolveLineItemUrlForScore(params: {
  lineItemUrl: string;
  accessToken: string;
  label?: string | null;
  resourceLinkId?: string | null;
  scoreMaximum?: number;
  fetchFn: OutboundFetch;
}): Promise<string> {
  const lineItemUrl = params.lineItemUrl.trim();
  if (!lineItemUrl) {
    throw new Error('Line item URL is required for grade passback');
  }

  if (!isLineItemsCollectionUrl(lineItemUrl)) {
    return lineItemUrl;
  }

  const existingItems = await fetchLineItemsCollection(
    lineItemUrl,
    params.accessToken,
    params.fetchFn,
  );
  const existingUrl = pickExistingLineItem(
    existingItems,
    params.resourceLinkId,
    params.label ?? 'Realityworks Simulation',
  );
  if (existingUrl) {
    return existingUrl;
  }

  return createLineItem(
    lineItemUrl,
    params.accessToken,
    {
      label: params.label?.trim() || 'Realityworks Simulation',
      resourceLinkId: params.resourceLinkId,
      scoreMaximum: params.scoreMaximum ?? 100,
    },
    params.fetchFn,
  );
}
