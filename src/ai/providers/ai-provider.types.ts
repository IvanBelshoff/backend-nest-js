import type { LanguageModel } from 'ai';

export const AI_PROVIDER_IDS = [
  'ollama',
  'openai',
  'openai-compatible',
  'anthropic',
  'google',
] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export type AiProviderConfig = {
  provider: AiProviderId;
  model: string;
  baseUrl?: string;
  apiKey?: string;
};

export type AiHealthStatus = {
  available: boolean;
  provider: AiProviderId;
  model: string;
  latencyMs: number;
  error?: string;
};

export type AiProviderAdapter = {
  getChatModel(): LanguageModel;
  checkHealth(): Promise<AiHealthStatus>;
};
