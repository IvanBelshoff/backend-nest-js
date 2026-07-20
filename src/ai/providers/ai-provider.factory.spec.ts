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
});
