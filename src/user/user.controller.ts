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
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'fs';

import { UsersService } from './user.service';
import { createUserSchema, type CreateUserDto } from './dtos/create-user.dto';
import { ZodValidation } from 'src/shared/decorators/zod-validation.decorator';
import { Public } from 'src/shared/decorators/auth-public.decorator';
import { UploadPhoto } from 'src/shared/decorators/upload-photo.decorator';

@Controller('user')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post('/')
  @ZodValidation(createUserSchema)
  @UploadPhoto('foto')
  async create(
    @Body() dto: CreateUserDto,
    @UploadedFile() foto?: Express.Multer.File,
  ) {
    return this.usersService.create(dto, foto);
  }

  @Get('/')
  async findAll() {
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
