/** Educator Preview Allowance (see CONTEXT.md). */
export const PreviewConstants = {
  SWAGGER: {
    TAG: 'Educator Simulation Previews',
  },
  ROUTES: {
    BASE: 'educator-simulations',
    PREVIEW: ':scenarioId/preview',
  },
  /** Previews per educator per simulation; no reset. */
  MAX_ALLOWANCE: 3,
  VALIDATION: {
    SCENARIO_ID_MAX_LENGTH: 255,
  },
};
