// O pacote `ai` é ESM-only e não passa pelo transform CommonJS do ts-jest.
jest.mock('ai', () => ({
  extractReasoningMiddleware: jest.fn(() => ({})),
  wrapLanguageModel: jest.fn(({ model }: { model: unknown }) => model),
}));

const ollamaModel = jest.fn(() => 'ollama-model');

jest.mock('ai-sdk-ollama', () => ({
  createOllama: jest.fn(() => ollamaModel),
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(() => ({
    chat: jest.fn(() => 'openai-model'),
  })),
}));

jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn(() => jest.fn(() => 'anthropic-model')),
}));

jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: jest.fn(() => jest.fn(() => 'google-model')),
}));

jest.mock('src/shared/env.schema', () => ({
  env: {
    AI_PROVIDER: 'ollama',
    AI_BASE_URL: 'http://localhost:11434',
    AI_MODEL: 'qwen3.5:4b',
    AI_API_KEY: undefined,
    AI_REASONING_ENABLED: true,
    AI_REASONING_EFFORT: 'medium',
    AI_REASONING_BUDGET_TOKENS: 4096,
    AI_REASONING_THINK_TAGS: true,
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

  it('returns available when Ollama responds and configured model is listed', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'qwen3.5:4b' }] }),
    });

    const result = await service.checkHealth();

    expect(result.available).toBe(true);
    expect(result.provider).toBe('ollama');
    expect(result.model).toBe('qwen3.5:4b');
    expect(result.supportsReasoning).toBe(true);
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

  it('returns unavailable with reasoning disabled when fetch fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await service.checkHealth();

    expect(result.supportsReasoning).toBe(false);
  });

  it('returns chat model from provider adapter', () => {
    expect(service.getChatModel()).toBe('ollama-model');
    expect(ollamaModel).toHaveBeenLastCalledWith('qwen3.5:4b', { think: false });
  });

  it('enables Ollama think parameter when thinking is requested', () => {
    service.getChatModel({ thinking: true });

    expect(ollamaModel).toHaveBeenLastCalledWith('qwen3.5:4b', { think: true });
  });
});
