import { Injectable } from '@nestjs/common';
import { createOllama, type OllamaProvider } from 'ai-sdk-ollama';
import { env } from 'src/shared/env.schema';

const OLLAMA_HEALTH_TIMEOUT_MS = 5_000;

export type AiHealthStatus = {
  available: boolean;
  model: string;
  latencyMs: number;
  error?: string;
};

function isConfiguredModelListed(
  models: Array<{ name?: string }>,
  configuredModel: string,
): boolean {
  return models.some((entry) => entry.name === configuredModel);
}

@Injectable()
export class AiService {
  private readonly ollama: OllamaProvider = createOllama({
    baseURL: env.OLLAMA_BASE_URL,
  });

  getChatModel() {
    return this.ollama(env.OLLAMA_MODEL, { think: false });
  }

  async checkHealth(): Promise<AiHealthStatus> {
    const startedAt = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      OLLAMA_HEALTH_TIMEOUT_MS,
    );

    const baseUrl = env.OLLAMA_BASE_URL.replace(/\/$/, '');
    const healthUrl = `${baseUrl}/api/tags`;

    try {
      const response = await fetch(healthUrl, {
        signal: controller.signal,
      });

      let configuredModelFound = false;
      if (response.ok) {
        try {
          const body = (await response.json()) as {
            models?: Array<{ name?: string }>;
          };
          const models = Array.isArray(body.models) ? body.models : [];
          configuredModelFound = isConfiguredModelListed(
            models,
            env.OLLAMA_MODEL,
          );
        } catch {
          configuredModelFound = false;
        }
      }

      if (!response.ok) {
        return {
          available: false,
          model: env.OLLAMA_MODEL,
          latencyMs: Math.round(performance.now() - startedAt),
          error: `HTTP ${response.status}`,
        };
      }

      if (!configuredModelFound) {
        return {
          available: false,
          model: env.OLLAMA_MODEL,
          latencyMs: Math.round(performance.now() - startedAt),
          error: 'Modelo configurado não disponível no serviço de IA',
        };
      }

      return {
        available: true,
        model: env.OLLAMA_MODEL,
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Serviço indisponível';

      return {
        available: false,
        model: env.OLLAMA_MODEL,
        latencyMs: Math.round(performance.now() - startedAt),
        error: errorMessage,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
