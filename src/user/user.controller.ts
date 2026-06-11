import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { UsersService } from './user.service';
import { createUserSchema, type CreateUserDto } from './dtos/create-user.dto';
import { ZodValidation } from 'src/shared/decorators/zod-validation.decorator';
import { Public } from 'src/shared/decorators/public';

@Controller('user')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post('/')
  @ZodValidation(createUserSchema)
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
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
