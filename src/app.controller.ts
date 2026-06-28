import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from './shared/decorators/auth-public.decorator';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@Controller()
@ApiTags('health')
export class AppController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @Public()
  @Get('/')
  @ApiOperation({ summary: 'Root health message' })
  @ApiOkResponse({ schema: { example: 'Tudo certo!' } })
  root(): string {
    return 'Tudo certo!';
  }

  @Public()
  @Get('/health')
  @ApiOperation({ summary: 'Health check com ping no PostgreSQL' })
  @ApiOkResponse({
    schema: { example: { status: 'ok', db: 'up' } },
  })
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
