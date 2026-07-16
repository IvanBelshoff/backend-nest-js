import { Body, Controller, Post, Res } from '@nestjs/common';
import {
  convertToModelMessages,
  pipeUIMessageStreamToResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import type { Response } from 'express';
import { Public } from 'src/shared/decorators/auth-public.decorator';
import { AiService } from './ai.service';

type ChatBody = {
  messages: UIMessage[];
};

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Public()
  @Post('chat')
  async chat(@Body() body: ChatBody, @Res() res: Response) {
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    const result = streamText({
      model: this.aiService.getChatModel(),
      system: 'Responda de forma clara e objetiva em português.',
      messages: await convertToModelMessages(messages),
    });

    pipeUIMessageStreamToResponse({
      response: res,
      stream: toUIMessageStream({ stream: result.stream }),
    });
  }
}
