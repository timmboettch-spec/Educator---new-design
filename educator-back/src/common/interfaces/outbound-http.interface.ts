/** Bound `fetch` handed to plain-function utilities by their injectable callers (ADR-0011). */
export type OutboundFetch = (url: string | URL, init?: RequestInit) => Promise<Response>;
