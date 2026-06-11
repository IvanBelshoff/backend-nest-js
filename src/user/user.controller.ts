import { Body, Controller, Get, Post } from '@nestjs/common';
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
}
