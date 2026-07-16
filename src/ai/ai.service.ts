import { Injectable } from '@nestjs/common';
import { createOllama, type OllamaProvider } from 'ai-sdk-ollama';
import { env } from 'src/shared/env.schema';

@Injectable()
export class AiService {
  private readonly ollama: OllamaProvider = createOllama({
    baseURL: env.OLLAMA_BASE_URL,
  });

  getChatModel() {
    return this.ollama(env.OLLAMA_MODEL, { think: false });
  }
}
