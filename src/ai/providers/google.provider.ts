import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type {
  AiHealthStatus,
  AiProviderAdapter,
  AiProviderConfig,
} from './ai-provider.types';
import { buildHealthResult, fetchWithTimeout } from './ai-provider.health.util';
import {
  isReasoningEnabled,
  reasoningBudgetTokens,
} from './ai-provider.reasoning.util';

export function createGoogleProvider(
  config: AiProviderConfig,
): AiProviderAdapter {
  const google = createGoogleGenerativeAI({
    apiKey: config.apiKey,
  });

  return {
    getChatModel() {
      return google(config.model);
    },

    getReasoningProviderOptions() {
      return {
        google: {
          thinkingConfig: {
            thinkingBudget: reasoningBudgetTokens(),
            includeThoughts: true,
          },
        },
      };
    },

    supportsReasoning() {
      return isReasoningEnabled();
    },

    async checkHealth(): Promise<AiHealthStatus> {
      const startedAt = performance.now();

      if (!config.apiKey) {
        return buildHealthResult({
          available: false,
          provider: 'google',
          model: config.model,
          startedAt,
          error: 'AI_API_KEY não configurada para o provedor Google',
        });
      }

      try {
        const response = await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(config.apiKey)}`,
        );

        if (!response.ok) {
          return buildHealthResult({
            available: false,
            provider: 'google',
            model: config.model,
            startedAt,
            error: `HTTP ${response.status}`,
          });
        }

        return buildHealthResult({
          available: true,
          provider: 'google',
          model: config.model,
          startedAt,
        });
      } catch (error) {
        return buildHealthResult({
          available: false,
          provider: 'google',
          model: config.model,
          startedAt,
          error: error instanceof Error ? error.message : 'Serviço indisponível',
        });
      }
    },
  };
}
