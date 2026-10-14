import { OutboundIntegration } from '../../../src/common/constants';
import { OutboundHttpClient } from '../../../src/common/services';

/**
 * Test double for `OutboundHttpClient` that forwards to `global.fetch` (so specs keep mocking
 * `global.fetch` for responses) and records the integration each call was made under.
 */
export function createOutboundHttpStub(): {
  client: OutboundHttpClient;
  integrations: OutboundIntegration[];
} {
  const integrations: OutboundIntegration[] = [];
  const client = {
    fetch: (integration: OutboundIntegration, url: string | URL, init?: RequestInit) => {
      integrations.push(integration);
      return init === undefined ? global.fetch(url) : global.fetch(url, init);
    },
  } as unknown as OutboundHttpClient;
  return { client, integrations };
}
