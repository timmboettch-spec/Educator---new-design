/** Base for AI gateway failures. Deliberately not an `HttpException`: callers decide the fallback. */
export class AiGatewayException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** No usable `OPENAI_API_KEY` is configured. */
export class AiNotConfiguredException extends AiGatewayException {
  constructor() {
    super('AI provider is not configured (missing API key)');
  }
}

/** The provider rejected the call or could not be reached. */
export class AiUpstreamException extends AiGatewayException {
  constructor(
    readonly caller: string,
    readonly status?: number,
    readonly requestId?: string,
    options?: ErrorOptions,
  ) {
    super(`AI call "${caller}" failed${status ? ` with status ${status}` : ''}`, options);
  }
}

/** The provider answered, but the output was empty or not the requested shape. */
export class AiInvalidResponseException extends AiGatewayException {
  constructor(
    readonly caller: string,
    reason: string,
    options?: ErrorOptions,
  ) {
    super(`AI call "${caller}" returned an invalid response: ${reason}`, options);
  }
}
