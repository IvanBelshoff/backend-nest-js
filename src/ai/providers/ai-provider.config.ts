import { env } from 'src/shared/env.schema';
import type { AiProviderConfig } from './ai-provider.types';

const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

export function resolveAiProviderConfig(): AiProviderConfig {
  const provider = env.AI_PROVIDER;
  const model = env.AI_MODEL;

  if (provider === 'ollama') {
    return {
      provider,
      model,
      baseUrl: env.AI_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL,
    };
  }

  if (provider === 'openai') {
    return {
      provider,
      model,
      baseUrl: env.AI_BASE_URL,
      apiKey: env.AI_API_KEY,
    };
  }

  if (provider === 'openai-compatible') {
    return {
      provider,
      model,
      baseUrl: env.AI_BASE_URL!,
      apiKey: env.AI_API_KEY,
    };
  }

  return {
    provider,
    model,
    apiKey: env.AI_API_KEY,
  };
}
