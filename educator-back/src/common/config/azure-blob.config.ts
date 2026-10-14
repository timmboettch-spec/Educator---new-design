import { registerAs } from '@nestjs/config';

export default registerAs('azureBlob', () => ({
  connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
  account: process.env.AZURE_STORAGE_ACCOUNT,
  profilePictureContainer: process.env.AZURE_STORAGE_CONTAINER || 'profile-pictures',
  jsonCatalogContainer: process.env.AZURE_BLOB_CONTAINER_NAME || 'json-data',
  uploadsContainer: process.env.AZURE_BLOB_DATA_CONTAINER_NAME || 'rwai-data-files',
  // TTS voice reference wavs (voices/<voiceProfileId>/voice.wav). Only this backend reads/writes it.
  voiceProfilesContainer: process.env.AZURE_BLOB_VOICE_PROFILES_CONTAINER_NAME || 'voice-profiles',
  prefix: process.env.AZURE_BLOB_PREFIX || '',
  downloadTimeoutMs: Number(process.env.BLOB_DOWNLOAD_TIMEOUT_MS) || 20_000,
}));
