import { registerAs } from '@nestjs/config';

export default registerAs('studentBackend', () => ({
  scenarioHydrationConcurrency: Number(process.env.SCENARIO_HYDRATION_CONCURRENCY) || 32,
  jsonCacheMetadataCheckIntervalMs:
    Number(process.env.JSON_CACHE_METADATA_CHECK_INTERVAL_MS) || 3_000,
  localizedScenariosCacheTtlMs: Number(process.env.LOCALIZED_SCENARIOS_CACHE_TTL_MS) || 30_000,
}));
