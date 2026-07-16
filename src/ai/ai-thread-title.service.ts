import { Injectable } from '@nestjs/common';
import { generateText } from 'ai';
import { AiService } from './ai.service';
import {
  buildTruncatedTitle,
  sanitizeGeneratedTitle,
} from './ai-thread-title.util';

@Injectable()
export class AiThreadTitleService {
  constructor(private readonly aiService: AiService) {}

  async generateTitle(userMessage: string): Promise<string> {
    const fallback = buildTruncatedTitle(userMessage);

    try {
      const { text } = await generateText({
        model: this.aiService.getChatModel(),
        prompt: [
          'Gere um título curto para uma conversa de chat.',
          'Regras:',
          '- Máximo de 6 palavras',
          '- Em português do Brasil',
          '- Sem aspas',
          '- Sem pontuação final',
          '- Responda apenas com o título, nada mais',
          '',
          `Mensagem do usuário: ${userMessage}`,
        ].join('\n'),
        maxOutputTokens: 30,
      });

      return sanitizeGeneratedTitle(text || fallback);
    } catch {
      return fallback;
    }
  }
}
