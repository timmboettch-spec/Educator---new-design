import { registerAs } from '@nestjs/config';

export default registerAs('ai', () => ({
  provider: process.env.AI_PROVIDER,
  conversationProvider: process.env.CONVERSATION_PROVIDER,
  model: process.env.AI_MODEL,
  openaiApiKey: process.env.OPENAI_API_KEY,
  speechEngine: {
    provider: process.env.SPEECH_ENGINE_PROVIDER,
    apiKey: process.env.SPEECH_ENGINE_API_KEY,
    apiUrl: process.env.SPEECH_ENGINE_API_URL,
    model: process.env.SPEECH_ENGINE_MODEL,
    language: process.env.SPEECH_ENGINE_LANGUAGE,
  },
}));
