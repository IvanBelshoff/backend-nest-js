import { createAnthropic } from '@ai-sdk/anthropic';
import type {
  AiHealthStatus,
  AiProviderAdapter,
  AiProviderConfig,
} from './ai-provider.types';
import { buildHealthResult, fetchWithTimeout } from './ai-provider.health.util';

export function createAnthropicProvider(
  config: AiProviderConfig,
): AiProviderAdapter {
  const anthropic = createAnthropic({
    apiKey: config.apiKey,
  });

  return {
    getChatModel() {
      return anthropic(config.model);
    },

    async checkHealth(): Promise<AiHealthStatus> {
      const startedAt = performance.now();

      if (!config.apiKey) {
        return buildHealthResult({
          available: false,
          provider: 'anthropic',
          model: config.model,
          startedAt,
          error: 'AI_API_KEY não configurada para o provedor Anthropic',
        });
      }

      try {
        const response = await fetchWithTimeout(
          'https://api.anthropic.com/v1/models',
          {
            headers: {
              'x-api-key': config.apiKey,
              'anthropic-version': '2023-06-01',
            },
          },
        );

        if (!response.ok) {
          return buildHealthResult({
            available: false,
            provider: 'anthropic',
            model: config.model,
            startedAt,
            error: `HTTP ${response.status}`,
          });
        }

        return buildHealthResult({
          available: true,
          provider: 'anthropic',
          model: config.model,
          startedAt,
        });
      } catch (error) {
        return buildHealthResult({
          available: false,
          provider: 'anthropic',
          model: config.model,
          startedAt,
          error: error instanceof Error ? error.message : 'Serviço indisponível',
        });
      }
    },
  };
}
