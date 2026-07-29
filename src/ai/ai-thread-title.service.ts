import { Injectable } from '@nestjs/common';
import { generateText } from 'ai';
import { AiService } from './ai.service';
import {
  buildTruncatedTitle,
  extractTitleCandidate,
} from './ai-thread-title.util';
import { runWithNvidiaChatTemplateContext } from './providers/nvidia-chat-template.util';

const TITLE_MAX_OUTPUT_TOKENS = 128;

@Injectable()
export class AiThreadTitleService {
  constructor(private readonly aiService: AiService) {}

  async generateTitle(userMessage: string): Promise<string> {
    const fallback = buildTruncatedTitle(userMessage);

    try {
      const result = await runWithNvidiaChatTemplateContext(
        {
          enableThinking: false,
          forceNonemptyContent: false,
        },
        () =>
          generateText({
            model: this.aiService.getChatModel(),
            prompt: [
              'Gere um título curto para uma conversa de chat.',
              'Regras obrigatórias:',
              '- Máximo de 6 palavras',
              '- Em português do Brasil',
              '- Sem aspas',
              '- Sem pontuação final',
              '- NÃO explique, NÃO raciocine, NÃO traduza a mensagem',
              '- Responda APENAS com o título na primeira linha, nada mais',
              '',
              `Mensagem do usuário: ${userMessage}`,
            ].join('\n'),
            maxOutputTokens: TITLE_MAX_OUTPUT_TOKENS,
          }),
      );

      return extractTitleCandidate(result.text || '', fallback);
    } catch {
      return fallback;
    }
  }
}
