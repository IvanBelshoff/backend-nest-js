import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { IconService } from './icon.service';
import { parsePagination, setTotalCount } from 'src/shared/dto/pagination.dto';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

@Controller('icones')
@ApiTags('icones')
@ApiBearerAuth('access-token')
export class IconController {
  constructor(private readonly iconService: IconService) {}

  @Get('/')
  @ApiOperation({ summary: 'Lista ícones paginados (header x-total-count)' })
  @ApiHeader({ name: 'x-total-count', description: 'Total de registros' })
  async findAll(
    @Query() query: Record<string, string>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { page, limit } = parsePagination(query, {
      defaultLimit: 50,
      maxLimit: 200,
    });

    const { data, total } = await this.iconService.findAll(
      page,
      limit,
      query.nome,
    );

    setTotalCount(response, total);

    return data;
  }
}
