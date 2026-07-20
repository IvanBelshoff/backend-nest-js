export const AI_HEALTH_TIMEOUT_MS = 5_000;

export function isConfiguredModelListed(
  modelIds: string[],
  configuredModel: string,
): boolean {
  return modelIds.includes(configuredModel);
}

export function buildHealthResult(params: {
  available: boolean;
  provider: import('./ai-provider.types').AiProviderId;
  model: string;
  startedAt: number;
  error?: string;
}): import('./ai-provider.types').AiHealthStatus {
  return {
    available: params.available,
    provider: params.provider,
    model: params.model,
    latencyMs: Math.round(performance.now() - params.startedAt),
    error: params.error,
  };
}

export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_HEALTH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
