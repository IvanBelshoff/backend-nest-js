import { parseAiEnv } from './ai-env.schema';

describe('ai-env.schema', () => {
  it('accepts ollama without API key', () => {
    expect(
      parseAiEnv({
        AI_PROVIDER: 'ollama',
        AI_MODEL: 'qwen3.5:4b',
      }),
    ).toMatchObject({
      AI_PROVIDER: 'ollama',
      AI_MODEL: 'qwen3.5:4b',
    });
  });

  it('requires AI_API_KEY for anthropic', () => {
    expect(() =>
      parseAiEnv({
        AI_PROVIDER: 'anthropic',
        AI_MODEL: 'claude-sonnet-4-20250514',
      }),
    ).toThrow(/AI_API_KEY/);
  });

  it('requires AI_BASE_URL for openai-compatible', () => {
    expect(() =>
      parseAiEnv({
        AI_PROVIDER: 'openai-compatible',
        AI_MODEL: 'nvidia/nemotron-3-super-120b-a12b',
        AI_API_KEY: 'nvapi-test',
      }),
    ).toThrow(/AI_BASE_URL/);
  });

  it('accepts openai-compatible with base URL and API key', () => {
    expect(
      parseAiEnv({
        AI_PROVIDER: 'openai-compatible',
        AI_BASE_URL: 'https://integrate.api.nvidia.com/v1',
        AI_MODEL: 'nvidia/nemotron-3-super-120b-a12b',
        AI_API_KEY: 'nvapi-test',
      }),
    ).toMatchObject({
      AI_PROVIDER: 'openai-compatible',
      AI_BASE_URL: 'https://integrate.api.nvidia.com/v1',
    });
  });
});
