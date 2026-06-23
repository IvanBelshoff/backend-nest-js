import { Module } from '@nestjs/common';
import { UsersService } from './user.service';
import { UsersController } from './user.controller';
import { userProviders } from './user.provider';

@Module({
  controllers: [UsersController],
  providers: [...userProviders, UsersService],
  exports: [UsersService, ...userProviders],
})
export class UsersModule {}
