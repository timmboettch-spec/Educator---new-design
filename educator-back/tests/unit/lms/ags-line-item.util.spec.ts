import { resolveLineItemUrlForScore } from '../../../src/lms/utils/ags-line-item.util';
import { OutboundIntegration } from '../../../src/common/constants';
import { createOutboundHttpStub } from '../helpers/outbound-http.stub';
import { isLineItemsCollectionUrl } from '../../../src/lms/utils/lti-ags.util';

jest.mock('../../../src/lms/utils/lti-ags.util', () => ({
  isLineItemsCollectionUrl: jest.fn(),
}));

const mockedIsCollection = isLineItemsCollectionUrl as jest.MockedFunction<
  typeof isLineItemsCollectionUrl
>;

describe('ags-line-item.util', () => {
  const outbound = createOutboundHttpStub();
  const fetchFn = (url: string | URL, init?: RequestInit): Promise<Response> =>
    outbound.client.fetch(OutboundIntegration.Lms, url, init);
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    mockedIsCollection.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns direct line item URLs unchanged', async () => {
    mockedIsCollection.mockReturnValue(false);
    const directUrl = 'https://lms.example.com/lineitems/42';

    await expect(
      resolveLineItemUrlForScore({
        lineItemUrl: directUrl,
        accessToken: 'token',
        fetchFn,
      }),
    ).resolves.toBe(directUrl);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reuses an existing line item from a collection URL', async () => {
    mockedIsCollection.mockReturnValue(true);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        JSON.stringify({
          lineItems: [
            {
              id: 'https://canvas.example.com/api/lti/courses/1/line_items/99',
              label: 'Scenario A',
              resourceId: 'resource-1',
            },
          ],
        }),
    });

    const resolved = await resolveLineItemUrlForScore({
      lineItemUrl: 'https://canvas.example.com/api/lti/courses/1/line_items',
      accessToken: 'token',
      fetchFn,
      resourceLinkId: 'resource-1',
    });

    expect(resolved).toBe('https://canvas.example.com/api/lti/courses/1/line_items/99');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outbound.integrations).toContain(OutboundIntegration.Lms);
  });

  it('creates a line item when the collection has no match', async () => {
    mockedIsCollection.mockReturnValue(true);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ lineItems: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            id: 'https://canvas.example.com/api/lti/courses/1/line_items/100',
          }),
      });

    const resolved = await resolveLineItemUrlForScore({
      lineItemUrl: 'https://canvas.example.com/api/lti/courses/1/line_items',
      accessToken: 'token',
      fetchFn,
      label: 'Realityworks Simulation',
      resourceLinkId: 'resource-2',
      scoreMaximum: 100,
    });

    expect(resolved).toBe('https://canvas.example.com/api/lti/courses/1/line_items/100');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, createInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(createInit.method).toBe('POST');
    expect(JSON.parse(createInit.body as string)).toMatchObject({
      label: 'Realityworks Simulation',
      resourceId: 'resource-2',
      scoreMaximum: 100,
    });
  });
});
