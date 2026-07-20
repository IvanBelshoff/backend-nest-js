jest.mock('ai-sdk-ollama', () => ({
  createOllama: jest.fn(() => jest.fn()),
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(() => ({
    chat: jest.fn(),
  })),
}));

jest.mock('src/shared/env.schema', () => ({
  env: {
    OLLAMA_BASE_URL: 'http://localhost:11434',
    OLLAMA_MODEL: 'qwen3.5:4b',
    API_KEY: undefined,
  },
}));

import { AiService } from './ai.service';

describe('AiService', () => {
  const service = new AiService();
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns available when service responds and configured model is listed', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'qwen3.5:4b' }] }),
    });

    const result = await service.checkHealth();

    expect(result.available).toBe(true);
    expect(result.model).toBe('qwen3.5:4b');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/tags',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('returns unavailable when configured model is not listed', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'other-model:7b' }] }),
    });

    const result = await service.checkHealth();

    expect(result.available).toBe(false);
    expect(result.error).toBe('Modelo configurado não disponível no serviço de IA');
  });

  it('returns unavailable when Ollama responds with non-2xx status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    const result = await service.checkHealth();

    expect(result.available).toBe(false);
    expect(result.error).toBe('HTTP 503');
  });

  it('returns unavailable when fetch fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await service.checkHealth();

    expect(result.available).toBe(false);
    expect(result.error).toBe('ECONNREFUSED');
  });
});
