import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  Request,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'fs';

import { UsersService } from './user.service';
import { createUserSchema, type CreateUserDto } from './dto/create-user.dto';
import { ZodValidation } from 'src/shared/decorators/zod-validation.decorator';
import { Public } from 'src/shared/decorators/auth-public.decorator';
import { UploadPhoto } from 'src/shared/decorators/upload-photo.decorator';
import * as UserRequest from 'src/shared/interfaces/UserRequest';
import { Authorization } from 'src/shared/decorators/authorization.decorator';
@Controller('user')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('/')
  @Authorization('role', ['admin'])
  @ZodValidation(createUserSchema)
  @UploadPhoto('foto')
  async create(
    @Body() dto: CreateUserDto,
    @Request() req: UserRequest.UserRequest,
    @UploadedFile() foto?: Express.Multer.File,
  ) {
    if (!req.user) {
      throw new Error('User information is missing in the request');
    }

    return this.usersService.create(dto, req.user, foto);
  }


  @Get('/')
  @Authorization('role', ['REGRA_ADMIN'])
  async findAll() {
    console.log('findAll called');
    return this.usersService.findAll();
  }

  @Public()
  @Get('/:id/foto')
  async findPhoto(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) response: Response,
  ) {
    const photo = await this.usersService.findPhotoFileByUserId(id);

    response.set({
      'Content-Type': photo.type,
    });

    return new StreamableFile(createReadStream(photo.path));
  }
}
