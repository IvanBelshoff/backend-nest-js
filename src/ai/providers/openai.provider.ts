import { createOpenAI } from '@ai-sdk/openai';
import type {
  AiHealthStatus,
  AiProviderAdapter,
  AiProviderConfig,
  AiProviderId,
} from './ai-provider.types';
import {
  buildHealthResult,
  fetchWithTimeout,
  isConfiguredModelListed,
} from './ai-provider.health.util';
import {
  isReasoningEnabled,
  reasoningEffort,
  withThinkTagExtraction,
} from './ai-provider.reasoning.util';
import {
  createNvidiaExtraBodyFetch,
  isNvidiaNimBaseUrl,
} from './nvidia-chat-template.util';

function createOpenAiProvider(
  config: AiProviderConfig,
  provider: Extract<AiProviderId, 'openai' | 'openai-compatible'>,
): AiProviderAdapter {
  const usesNvidiaChatTemplate = isNvidiaNimBaseUrl(config.baseUrl);
  const openAi = createOpenAI({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    ...(usesNvidiaChatTemplate
      ? { fetch: createNvidiaExtraBodyFetch() }
      : {}),
  });

  return {
    getChatModel() {
      return withThinkTagExtraction(openAi.chat(config.model));
    },

    getReasoningProviderOptions() {
      // `reasoningEffort` é uma opção da API oficial da OpenAI. NVIDIA NIM usa
      // `chat_template_kwargs` (injetado via fetch customizado), não este campo.
      if (provider !== 'openai') {
        return undefined;
      }

      return { openai: { reasoningEffort: reasoningEffort() } };
    },

    supportsReasoning() {
      return isReasoningEnabled();
    },

    async checkHealth(): Promise<AiHealthStatus> {
      const startedAt = performance.now();

      if (!config.apiKey) {
        return buildHealthResult({
          available: false,
          provider,
          model: config.model,
          startedAt,
          error: 'AI_API_KEY não configurada para o provedor OpenAI',
        });
      }

      const baseUrl = (
        config.baseUrl ?? 'https://api.openai.com/v1'
      ).replace(/\/$/, '');
      const healthUrl = `${baseUrl}/models`;

      try {
        const response = await fetchWithTimeout(healthUrl, {
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
          },
        });

        let configuredModelFound = false;
        if (response.ok) {
          try {
            const body = (await response.json()) as {
              data?: Array<{ id?: string }>;
            };
            const modelIds = Array.isArray(body.data)
              ? body.data
                  .map((entry) => entry.id)
                  .filter((id): id is string => typeof id === 'string')
              : [];
            configuredModelFound = isConfiguredModelListed(
              modelIds,
              config.model,
            );
          } catch {
            configuredModelFound = false;
          }
        }

        if (!response.ok) {
          return buildHealthResult({
            available: false,
            provider,
            model: config.model,
            startedAt,
            error: `HTTP ${response.status}`,
          });
        }

        if (!configuredModelFound) {
          return buildHealthResult({
            available: false,
            provider,
            model: config.model,
            startedAt,
            error: 'Modelo configurado não disponível no serviço de IA',
          });
        }

        return buildHealthResult({
          available: true,
          provider,
          model: config.model,
          startedAt,
        });
      } catch (error) {
        return buildHealthResult({
          available: false,
          provider,
          model: config.model,
          startedAt,
          error: error instanceof Error ? error.message : 'Serviço indisponível',
        });
      }
    },
  };
}

export function createOpenAiOfficialProvider(
  config: AiProviderConfig,
): AiProviderAdapter {
  return createOpenAiProvider(config, 'openai');
}

export function createOpenAiCompatibleProvider(
  config: AiProviderConfig,
): AiProviderAdapter {
  return createOpenAiProvider(config, 'openai-compatible');
}
