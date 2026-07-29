// O pacote `ai` é ESM-only e não passa pelo transform CommonJS do ts-jest.
jest.mock('ai', () => ({
  extractReasoningMiddleware: jest.fn(() => ({})),
  wrapLanguageModel: jest.fn(({ model }: { model: unknown }) => model),
}));

jest.mock('ai-sdk-ollama', () => ({
  createOllama: jest.fn(() => jest.fn(() => 'ollama-model')),
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

const mockEnv = {
  AI_PROVIDER: 'openai-compatible' as const,
  AI_BASE_URL: 'https://integrate.api.nvidia.com/v1',
  AI_MODEL: 'nvidia/nemotron-3-super-120b-a12b',
  AI_API_KEY: 'nvapi-test',
  AI_REASONING_ENABLED: true,
  AI_REASONING_EFFORT: 'medium' as const,
  AI_REASONING_BUDGET_TOKENS: 4096,
  AI_REASONING_THINK_TAGS: true,
};

jest.mock('src/shared/env.schema', () => ({
  env: mockEnv,
}));

import { createOpenAI } from '@ai-sdk/openai';
import { createAiProviderAdapter } from './ai-provider.factory';

describe('ai-provider.factory', () => {
  it('creates openai-compatible adapter with configured base URL and key', () => {
    const adapter = createAiProviderAdapter();

    expect(createOpenAI).toHaveBeenCalledWith({
      apiKey: 'nvapi-test',
      baseURL: 'https://integrate.api.nvidia.com/v1',
    });
    expect(adapter.getChatModel()).toBe('openai-model');
  });

  it('does not send reasoningEffort for openai-compatible providers', () => {
    const adapter = createAiProviderAdapter();

    expect(adapter.supportsReasoning()).toBe(true);
    expect(adapter.getReasoningProviderOptions()).toBeUndefined();
  });
});
