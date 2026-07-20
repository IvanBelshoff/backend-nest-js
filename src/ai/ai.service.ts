import { Injectable } from '@nestjs/common';
import { createAiProviderAdapter } from './providers/ai-provider.factory';
import type { AiHealthStatus } from './providers/ai-provider.types';

export type { AiHealthStatus } from './providers/ai-provider.types';

@Injectable()
export class AiService {
  private readonly provider = createAiProviderAdapter();

  getChatModel() {
    return this.provider.getChatModel();
  }

  async checkHealth(): Promise<AiHealthStatus> {
    return this.provider.checkHealth();
  }
}
