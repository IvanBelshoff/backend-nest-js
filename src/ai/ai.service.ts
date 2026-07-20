import { Injectable } from '@nestjs/common';
import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai';
import { createOllama, type OllamaProvider } from 'ai-sdk-ollama';
import { env } from 'src/shared/env.schema';

const AI_HEALTH_TIMEOUT_MS = 5_000;

export type AiHealthStatus = {
  available: boolean;
  model: string;
  latencyMs: number;
  error?: string;
};

function isOpenAiCompatibleBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return (
      url.hostname.includes('nvidia.com') ||
      url.pathname.replace(/\/$/, '').endsWith('/v1')
    );
  } catch {
    return false;
  }
}

function isConfiguredModelListed(
  modelIds: string[],
  configuredModel: string,
): boolean {
  return modelIds.includes(configuredModel);
}

@Injectable()
export class AiService {
  private readonly usesOpenAiCompatible = isOpenAiCompatibleBaseUrl(
    env.OLLAMA_BASE_URL,
  );

  private readonly ollama: OllamaProvider | null = this.usesOpenAiCompatible
    ? null
    : createOllama({
        baseURL: env.OLLAMA_BASE_URL,
      });

  private readonly openAi: OpenAIProvider | null = this.usesOpenAiCompatible
    ? createOpenAI({
        baseURL: env.OLLAMA_BASE_URL,
        apiKey: env.API_KEY,
      })
    : null;

  getChatModel() {
    if (this.openAi) {
      return this.openAi.chat(env.OLLAMA_MODEL);
    }

    return this.ollama!(env.OLLAMA_MODEL, { think: false });
  }

  async checkHealth(): Promise<AiHealthStatus> {
    if (this.usesOpenAiCompatible) {
      return this.checkOpenAiCompatibleHealth();
    }

    return this.checkOllamaHealth();
  }

  private async checkOpenAiCompatibleHealth(): Promise<AiHealthStatus> {
    const startedAt = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      AI_HEALTH_TIMEOUT_MS,
    );

    if (!env.API_KEY) {
      return {
        available: false,
        model: env.OLLAMA_MODEL,
        latencyMs: Math.round(performance.now() - startedAt),
        error: 'API_KEY não configurada para o provedor OpenAI-compatible',
      };
    }

    const baseUrl = env.OLLAMA_BASE_URL.replace(/\/$/, '');
    const healthUrl = `${baseUrl}/models`;

    try {
      const response = await fetch(healthUrl, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${env.API_KEY}`,
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

  private async checkOllamaHealth(): Promise<AiHealthStatus> {
    const startedAt = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      AI_HEALTH_TIMEOUT_MS,
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
            models
              .map((entry) => entry.name)
              .filter((name): name is string => typeof name === 'string'),
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
