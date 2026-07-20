import { resolveAiProviderConfig } from './ai-provider.config';
import { createAnthropicProvider } from './anthropic.provider';
import { createGoogleProvider } from './google.provider';
import { createOllamaProvider } from './ollama.provider';
import {
  createOpenAiCompatibleProvider,
  createOpenAiOfficialProvider,
} from './openai.provider';
import type { AiProviderAdapter } from './ai-provider.types';

export function createAiProviderAdapter(): AiProviderAdapter {
  const config = resolveAiProviderConfig();

  switch (config.provider) {
    case 'ollama':
      return createOllamaProvider(config);
    case 'openai':
      return createOpenAiOfficialProvider(config);
    case 'openai-compatible':
      return createOpenAiCompatibleProvider(config);
    case 'anthropic':
      return createAnthropicProvider(config);
    case 'google':
      return createGoogleProvider(config);
    default: {
      const exhaustive: never = config.provider;
      throw new Error(`Provedor de IA não suportado: ${exhaustive}`);
    }
  }
}
