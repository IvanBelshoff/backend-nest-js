import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Request,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { UIMessage } from 'ai';
import { ZodValidation } from 'src/shared/decorators/zod-validation.decorator';
import type { UserRequest } from 'src/shared/interfaces/UserRequest';
import { AiAccessGuard } from './ai-access.guard';
import { AiAccessService } from './ai-access.service';
import { AiChatService } from './ai-chat.service';
import { AiChatPersistenceService } from './ai-chat-persistence.service';
import { AiMentionService } from './ai-mention.service';
import { AiService } from './ai.service';
import { AiPlanService } from './plan/ai-plan.service';
import {
  updateAiPlanSchema,
  type UpdateAiPlanDto,
} from './plan/ai-plan.schema';
import {
  aiChatSchema,
  createAiThreadSchema,
  type AiChatDto,
  type CreateAiThreadDto,
} from './dto/ai-chat.dto';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiAccessService: AiAccessService,
    private readonly aiService: AiService,
    private readonly aiChatService: AiChatService,
    private readonly aiChatPersistenceService: AiChatPersistenceService,
    private readonly aiMentionService: AiMentionService,
    private readonly aiPlanService: AiPlanService,
  ) {}

  @Get('health')
  @SkipThrottle()
  async getHealth(@Request() req: UserRequest) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.aiService.checkHealth();
  }

  @Get('access')
  async getAccess(@Request() req: UserRequest) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.aiAccessService.getAccessStatus(Number(req.user.sub));
  }

  @Get('mentions/relatorios')
  @UseGuards(AiAccessGuard)
  async listMentionRelatorios(@Request() req: UserRequest) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.aiMentionService.listMentionRelatorios(Number(req.user.sub));
  }

  @Get('threads')
  @UseGuards(AiAccessGuard)
  async listThreads(@Request() req: UserRequest) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    const threads = await this.aiChatPersistenceService.listThreads(
      Number(req.user.sub),
    );

    return threads.map((thread) => ({
      id: thread.id,
      titulo: thread.titulo,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    }));
  }

  @Post('threads')
  @UseGuards(AiAccessGuard)
  @ZodValidation(createAiThreadSchema)
  async createThread(
    @Body() dto: CreateAiThreadDto,
    @Request() req: UserRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    const thread = await this.aiChatPersistenceService.createThread(
      Number(req.user.sub),
      dto.titulo,
    );

    return {
      id: thread.id,
      titulo: thread.titulo,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };
  }

  @Get('threads/:id/messages')
  @UseGuards(AiAccessGuard)
  async getThreadMessages(
    @Param('id') threadId: string,
    @Request() req: UserRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    const messages = await this.aiChatPersistenceService.getThreadMessages(
      Number(req.user.sub),
      threadId,
    );

    return {
      messages: this.aiChatPersistenceService.toUiMessages(messages),
    };
  }

  @Delete('threads/:id')
  @UseGuards(AiAccessGuard)
  @HttpCode(204)
  async deleteThread(
    @Param('id') threadId: string,
    @Request() req: UserRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    await this.aiChatPersistenceService.deleteThread(
      Number(req.user.sub),
      threadId,
    );
  }

  @Patch('threads/:threadId/plans/:planId')
  @UseGuards(AiAccessGuard)
  @ZodValidation(updateAiPlanSchema)
  async updatePlan(
    @Param('threadId') threadId: string,
    @Param('planId') planId: string,
    @Body() dto: UpdateAiPlanDto,
    @Request() req: UserRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.aiPlanService.updatePlan(
      Number(req.user.sub),
      threadId,
      planId,
      dto,
    );
  }

  @Post('threads/:threadId/plans/:planId/approve')
  @UseGuards(AiAccessGuard)
  async approvePlan(
    @Param('threadId') threadId: string,
    @Param('planId') planId: string,
    @Request() req: UserRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.aiPlanService.approvePlan(
      Number(req.user.sub),
      threadId,
      planId,
    );
  }

  @Post('threads/:threadId/plans/:planId/cancel')
  @UseGuards(AiAccessGuard)
  async cancelPlan(
    @Param('threadId') threadId: string,
    @Param('planId') planId: string,
    @Request() req: UserRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.aiPlanService.cancelPlan(
      Number(req.user.sub),
      threadId,
      planId,
    );
  }

  @Post('chat')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseGuards(AiAccessGuard)
  @ZodValidation(aiChatSchema)
  async chat(
    @Body() body: AiChatDto,
    @Request() req: UserRequest,
    @Res() res: Response,
  ) {
    if (!req.user || !req.authUser) {
      throw new UnauthorizedException();
    }

    await this.aiChatService.streamChat({
      user: req.authUser,
      messages: body.messages as unknown as UIMessage[],
      threadId: body.threadId,
      mentions: body.mentions,
      mode: body.mode,
      thinking: body.thinking,
      res,
    });
  }
}
