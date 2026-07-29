import type { LanguageModel } from 'ai';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Mesma forma de `providerOptions` do AI SDK (o tipo não é exportado pelo pacote). */
export type AiReasoningProviderOptions = Record<string, Record<string, JsonValue>>;

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
  /** Indica se o toggle "Pensamento" pode ser oferecido na UI. */
  supportsReasoning: boolean;
};

export type AiChatModelOptions = {
  /** Liga o raciocínio estendido nesta chamada. */
  thinking?: boolean;
};

export type AiProviderAdapter = {
  getChatModel(options?: AiChatModelOptions): LanguageModel;
  /**
   * Opções específicas do provedor para ligar o raciocínio, usadas em
   * `providerOptions` do `streamText` quando o modo Pensamento está ativo.
   * `undefined` quando o provedor não precisa de opções extras.
   */
  getReasoningProviderOptions(): AiReasoningProviderOptions | undefined;
  supportsReasoning(): boolean;
  checkHealth(): Promise<AiHealthStatus>;
};
