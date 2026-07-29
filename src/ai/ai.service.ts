import { Injectable } from '@nestjs/common';
import { createAiProviderAdapter } from './providers/ai-provider.factory';
import type {
  AiChatModelOptions,
  AiHealthStatus,
  AiReasoningProviderOptions,
} from './providers/ai-provider.types';

export type { AiHealthStatus } from './providers/ai-provider.types';

@Injectable()
export class AiService {
  private readonly provider = createAiProviderAdapter();

  getChatModel(options?: AiChatModelOptions) {
    return this.provider.getChatModel(options);
  }

  supportsReasoning(): boolean {
    return this.provider.supportsReasoning();
  }

  /** Opções de raciocínio do provedor, para o modo Pensamento. */
  getReasoningProviderOptions(): AiReasoningProviderOptions | undefined {
    return this.provider.getReasoningProviderOptions();
  }

  async checkHealth(): Promise<AiHealthStatus> {
    const health = await this.provider.checkHealth();

    return {
      ...health,
      supportsReasoning: health.available && this.provider.supportsReasoning(),
    };
  }
}
