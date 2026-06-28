import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from './shared/decorators/auth-public.decorator';

@Controller()
export class AppController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @Public()
  @Get('/')
  root(): string {
    return 'Tudo certo!';
  }

  @Public()
  @Get('/health')
  async health(): Promise<{ status: string; db: string }> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', db: 'up' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        db: 'down',
      });
    }
  }
}
