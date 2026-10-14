export enum OutboundIntegration {
  Lms = 'lms',
  Moodle = 'moodle',
  Google = 'google',
  Ai = 'ai',
  Telemetry = 'telemetry',
}

export const OutboundHttpConstants = {
  TIMEOUT_MS: {
    [OutboundIntegration.Lms]: 15_000,
    [OutboundIntegration.Moodle]: 15_000,
    [OutboundIntegration.Google]: 10_000,
    [OutboundIntegration.Ai]: 45_000,
    [OutboundIntegration.Telemetry]: 30_000,
  },
  FALLBACK_API_TIMEOUT_MS: 60_000,
};
