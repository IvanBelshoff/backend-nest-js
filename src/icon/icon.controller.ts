import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { IconService } from './icon.service';
import { parsePagination, setTotalCount } from 'src/shared/dto/pagination.dto';

@Controller('icones')
export class IconController {
  constructor(private readonly iconService: IconService) {}

  @Get('/')
  findAll(
    @Query() query: Record<string, string>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { page, limit } = parsePagination(query, {
      defaultLimit: 50,
      maxLimit: 200,
    });

    const { data, total } = this.iconService.findAll(page, limit, query.nome);

    setTotalCount(response, total);

    return data;
  }
}
