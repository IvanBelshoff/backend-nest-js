import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Request,
  Res,
  UnauthorizedException,
  UploadedFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as UserRequest from 'src/shared/interfaces/UserRequest';
import { LightweightAuth } from 'src/shared/decorators/lightweight-auth.decorator';
import { UploadPhoto } from 'src/shared/decorators/upload-photo.decorator';
import { ZodQueryValidation, ZodValidation } from 'src/shared/decorators/zod-validation.decorator';
import { setTotalCount } from 'src/shared/dto/pagination.dto';
import { UsersService } from 'src/user/user.service';
import {
  changeOwnPasswordSchema,
  type ChangeOwnPasswordDto,
} from 'src/user/dto/change-own-password.dto';
import { UserMeSummaryService } from './user-me-summary.service';
import { UserNotificationService } from './user-notification.service';
import {
  listUserNotificationsQuerySchema,
  type ListUserNotificationsQueryDto,
} from './dto/list-user-notifications-query.dto';

@Controller('user/me')
@ApiTags('user')
@ApiBearerAuth('access-token')
export class UserMeController {
  constructor(
    private readonly userNotificationService: UserNotificationService,
    private readonly usersService: UsersService,
    private readonly userMeSummaryService: UserMeSummaryService,
  ) {}

  @Get('/notifications')
  @ZodQueryValidation(listUserNotificationsQuerySchema)
  async listNotifications(
    @Query() query: ListUserNotificationsQueryDto,
    @Request() req: UserRequest.UserRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!req.user) throw new UnauthorizedException();

    const result = await this.userNotificationService.listForUser(
      req.user.sub,
      query,
    );

    setTotalCount(response, result.total);

    return {
      items: result.items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        body: item.body,
        payload: item.payload,
        read_at: item.readAt,
        created_at: item.createdAt,
      })),
      page: result.page,
      page_size: result.pageSize,
      total: result.total,
    };
  }

  @Get('/notifications/unread-count')
  @SkipThrottle()
  @LightweightAuth()
  async getUnreadCount(@Request() req: UserRequest.UserRequest) {
    if (!req.user) throw new UnauthorizedException();

    const count = await this.userNotificationService.getUnreadCount(
      req.user.sub,
    );

    return { count };
  }

  @Patch('/notifications/:id/read')
  @HttpCode(204)
  async markNotificationRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) throw new UnauthorizedException();
    await this.userNotificationService.markAsRead(req.user.sub, id);
  }

  @Patch('/notifications/read-all')
  @HttpCode(204)
  async markAllNotificationsRead(@Request() req: UserRequest.UserRequest) {
    if (!req.user) throw new UnauthorizedException();
    await this.userNotificationService.markAllAsRead(req.user.sub);
  }

  @Get('/summary')
  async getSummary(@Request() req: UserRequest.UserRequest) {
    if (!req.user) throw new UnauthorizedException();
    return this.userMeSummaryService.getSummary(req.user.sub);
  }

  @Patch('/photo')
  @UploadPhoto('foto')
  async updatePhoto(
    @Request() req: UserRequest.UserRequest,
    @UploadedFile() foto?: Express.Multer.File,
  ) {
    if (!req.user) throw new UnauthorizedException();

    const updated = await this.usersService.updatePhotoForUser(
      req.user.sub,
      req.user,
      foto,
    );

    const { senha: _senha, ...rest } = updated;
    return rest;
  }

  @Patch('/password')
  @HttpCode(204)
  @ZodValidation(changeOwnPasswordSchema)
  async changePassword(
    @Request() req: UserRequest.UserRequest,
    @Body() dto: ChangeOwnPasswordDto,
  ) {
    if (!req.user) throw new UnauthorizedException();

    await this.usersService.changeOwnPassword(
      req.user.sub,
      dto.senhaAtual,
      dto.senha,
    );
  }
}
