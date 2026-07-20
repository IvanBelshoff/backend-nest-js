import { createOllama } from 'ai-sdk-ollama';
import type {
  AiHealthStatus,
  AiProviderAdapter,
  AiProviderConfig,
} from './ai-provider.types';
import {
  buildHealthResult,
  fetchWithTimeout,
  isConfiguredModelListed,
} from './ai-provider.health.util';

export function createOllamaProvider(
  config: AiProviderConfig,
): AiProviderAdapter {
  const baseUrl = config.baseUrl!;
  const ollama = createOllama({ baseURL: baseUrl });

  return {
    getChatModel() {
      return ollama(config.model, { think: false });
    },

    async checkHealth(): Promise<AiHealthStatus> {
      const startedAt = performance.now();
      const healthUrl = `${baseUrl.replace(/\/$/, '')}/api/tags`;

      try {
        const response = await fetchWithTimeout(healthUrl);
        let configuredModelFound = false;

        if (response.ok) {
          try {
            const body = (await response.json()) as {
              models?: Array<{ name?: string }>;
            };
            const models = Array.isArray(body.models) ? body.models : [];
            configuredModelFound = isConfiguredModelListed(
              models
                .map((entry) => entry.name)
                .filter((name): name is string => typeof name === 'string'),
              config.model,
            );
          } catch {
            configuredModelFound = false;
          }
        }

        if (!response.ok) {
          return buildHealthResult({
            available: false,
            provider: 'ollama',
            model: config.model,
            startedAt,
            error: `HTTP ${response.status}`,
          });
        }

        if (!configuredModelFound) {
          return buildHealthResult({
            available: false,
            provider: 'ollama',
            model: config.model,
            startedAt,
            error: 'Modelo configurado não disponível no serviço de IA',
          });
        }

        return buildHealthResult({
          available: true,
          provider: 'ollama',
          model: config.model,
          startedAt,
        });
      } catch (error) {
        return buildHealthResult({
          available: false,
          provider: 'ollama',
          model: config.model,
          startedAt,
          error: error instanceof Error ? error.message : 'Serviço indisponível',
        });
      }
    },
  };
}
