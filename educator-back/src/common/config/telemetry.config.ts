import { registerAs } from '@nestjs/config';

export default registerAs('telemetry', () => ({
  appInsightsConnectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
  appInsightsAuthType: process.env.APPINSIGHTS_AUTH_TYPE || 'api-key',
  appInsightsAppId: process.env.APPLICATIONINSIGHTS_APP_ID,
  appInsightsApiKey: process.env.APPLICATIONINSIGHTS_API_KEY,
  azureClientId: process.env.AZURE_CLIENT_ID,
  samplingPriority: Number(process.env.TELEMETRY_SAMPLING_PRIORITY) || 100,
  // Matches the original lifecycle-telemetry.service.ts check: enabled unless explicitly 'false'.
  lifecycleEnabled: process.env.TELEMETRY_LIFECYCLE_ENABLED !== 'false',
}));
