import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { DashboardService, DashboardListParams } from './dashboard.service';
import {
  createDashboardSchema,
  type CreateDashboardDto,
} from './dto/create-dashboard.dto';
import {
  updateDashboardSchema,
  type UpdateDashboardDto,
} from './dto/update-dashboard.dto';
import { assignUsersSchema, type AssignUsersDto } from './dto/assign-users.dto';
import { ZodValidation } from 'src/shared/decorators/zod-validation.decorator';
import { Public } from 'src/shared/decorators/auth-public.decorator';
import { Authorization } from 'src/shared/decorators/authorization.decorator';
import * as UserRequest from 'src/shared/interfaces/UserRequest';
import { parsePagination, setTotalCount } from 'src/shared/dto/pagination.dto';

@Controller('dashboards')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Post('/')
  @Authorization('permission', ['PERMISSAO_CRIAR_DASHBOARD'])
  @ZodValidation(createDashboardSchema)
  async create(
    @Body() dto: CreateDashboardDto,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) {
      throw new Error('User information is missing in the request');
    }

    return this.dashboardService.create(dto, req.user);
  }

  @Get('/')
  @Authorization('role', ['REGRA_DASHBOARD'])
  async findAll(
    @Query() query: Record<string, string>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { page, limit } = parsePagination(query, { defaultLimit: 4 });

    const params: DashboardListParams = {
      page,
      limit,
      nome: query.nome,
      id_criador: query.id_criador,
      visivel: query.visivel,
      privacidade: query.privacidade,
      temporario: query.temporario,
      expiracao: query.expiracao,
    };

    const { data, total } = await this.dashboardService.findAllPaginated(
      params,
    );

    setTotalCount(response, total);

    return data;
  }

  @Get('/private')
  async findAllPrivate(
    @Query() query: Record<string, string>,
    @Request() req: UserRequest.UserRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!req.user) {
      throw new Error('User information is missing in the request');
    }

    const { page, limit } = parsePagination(query, { defaultLimit: 4 });

    const { data, total, favoritos } =
      await this.dashboardService.findAllPrivate(
        req.user.sub,
        page,
        limit,
        query.nome,
        query.favoritos === 'true',
      );

    setTotalCount(response, total);

    return { data, favoritos };
  }

  @Public()
  @Get('/public')
  async findAllPublic(
    @Query() query: Record<string, string>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { page, limit } = parsePagination(query, { defaultLimit: 4 });

    const { data, total } = await this.dashboardService.findAllPublic(
      page,
      limit,
      query.nome,
    );

    setTotalCount(response, total);

    return data;
  }

  @Get('/filters')
  @Authorization('role', ['REGRA_DASHBOARD'])
  async getFilters(@Query() query: Record<string, string>) {
    const { page, limit } = parsePagination(query, { defaultLimit: 4 });

    const params: DashboardListParams = {
      page,
      limit,
      nome: query.nome,
      id_criador: query.id_criador,
      visivel: query.visivel,
      privacidade: query.privacidade,
      temporario: query.temporario,
      expiracao: query.expiracao,
    };

    return this.dashboardService.getFilters(params);
  }

  @Public()
  @Get('/public/:id')
  async findPublicById(@Param('id', ParseIntPipe) id: number) {
    return this.dashboardService.findPublicById(id);
  }

  @Get('/private/:id')
  async findPrivateById(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) {
      throw new Error('User information is missing in the request');
    }

    return this.dashboardService.findPrivateById(id, req.user.sub);
  }

  @Get('/:id')
  @Authorization('role', ['REGRA_DASHBOARD'])
  async findById(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) {
      throw new Error('User information is missing in the request');
    }

    return this.dashboardService.findById(id, req.user.sub);
  }

  @Patch('/users/:id')
  @Authorization('permission', ['PERMISSAO_CONCEDER_ACESSO_USUARIO'])
  @ZodValidation(assignUsersSchema)
  @HttpCode(204)
  async assignUsers(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignUsersDto,
  ) {
    await this.dashboardService.assignUsers(id, dto.usuarios);
  }

  @Patch('/:id')
  @Authorization('permission', ['PERMISSAO_ATUALIZAR_DASHBOARD'])
  @ZodValidation(updateDashboardSchema)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDashboardDto,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) {
      throw new Error('User information is missing in the request');
    }

    return this.dashboardService.update(id, dto, req.user);
  }

  @Delete('/:id')
  @Authorization('permission', ['PERMISSAO_DELETAR_DASHBOARD'])
  @HttpCode(204)
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.dashboardService.delete(id);
  }
}
