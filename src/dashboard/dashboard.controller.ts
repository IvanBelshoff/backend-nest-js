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
  UnauthorizedException,
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
import { Authorization, AuthorizationAll } from 'src/shared/decorators/authorization.decorator';
import * as UserRequest from 'src/shared/interfaces/UserRequest';
import { ZodQueryValidation } from 'src/shared/decorators/zod-validation.decorator';
import { setTotalCount } from 'src/shared/dto/pagination.dto';
import {
  dashboardPrivateQuerySchema,
  dashboardPublicQuerySchema,
  dashboardQuerySchema,
  type DashboardPrivateQueryDto,
  type DashboardPublicQueryDto,
  type DashboardQueryDto,
} from './dto/dashboard-query.dto';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

@Controller('dashboards')
@ApiTags('dashboards')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Post('/')
  @AuthorizationAll(
    { type: 'role', required: ['REGRA_DASHBOARD'] },
    { type: 'permission', required: ['PERMISSAO_CRIAR_DASHBOARD'] },
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cria dashboard' })
  @ZodValidation(createDashboardSchema)
  async create(
    @Body() dto: CreateDashboardDto,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.dashboardService.create(dto, req.user);
  }

  @Get('/')
  @Authorization('role', ['REGRA_DASHBOARD'])
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Lista dashboards admin (header x-total-count)' })
  @ApiHeader({ name: 'x-total-count', description: 'Total de registros' })
  @ZodQueryValidation(dashboardQuerySchema)
  async findAll(
    @Query() query: DashboardQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { page, limit, nome, id_criador, visivel, privacidade, temporario, expiracao } =
      query;

    const params: DashboardListParams = {
      page,
      limit,
      nome,
      id_criador,
      visivel,
      privacidade,
      temporario,
      expiracao,
    };

    const { data, total } = await this.dashboardService.findAllPaginated(
      params,
    );

    setTotalCount(response, total);

    return data;
  }

  @Get('/private')
  @ZodQueryValidation(dashboardPrivateQuerySchema)
  async findAllPrivate(
    @Query() query: DashboardPrivateQueryDto,
    @Request() req: UserRequest.UserRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    const { page, limit, nome, favoritos, privacidade, temporario } = query;

    const { data, total, favoritos: favoriteIds } =
      await this.dashboardService.findAllPrivate(req.user.sub, {
        page,
        limit,
        nome,
        favoritos,
        privacidade,
        temporario,
      });

    setTotalCount(response, total);

    return { data, favoritos: favoriteIds };
  }

  @Public()
  @Get('/public')
  @ZodQueryValidation(dashboardPublicQuerySchema)
  async findAllPublic(
    @Query() query: DashboardPublicQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { page, limit, nome } = query;

    const { data, total } = await this.dashboardService.findAllPublic(
      page,
      limit,
      nome,
    );

    setTotalCount(response, total);

    return data;
  }

  @Get('/filters')
  @Authorization('role', ['REGRA_DASHBOARD'])
  @ZodQueryValidation(dashboardQuerySchema)
  async getFilters(@Query() query: DashboardQueryDto) {
    const { page, limit, nome, id_criador, visivel, privacidade, temporario, expiracao } =
      query;

    const params: DashboardListParams = {
      page,
      limit,
      nome,
      id_criador,
      visivel,
      privacidade,
      temporario,
      expiracao,
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
      throw new UnauthorizedException();
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
      throw new UnauthorizedException();
    }

    return this.dashboardService.findById(id, req.user.sub);
  }

  @Get('/users/:id')
  @AuthorizationAll(
    { type: 'role', required: ['REGRA_USUARIO'] },
    { type: 'permission', required: ['PERMISSAO_CONCEDER_ACESSO_DASHBOARD'] },
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Lista dashboards disponíveis e concedidos por usuário' })
  async getDashboardsByUser(@Param('id', ParseIntPipe) id: number) {
    return this.dashboardService.getDashboardsByUser(id);
  }

  @Patch('/users/:id')
  @Authorization('permission', ['PERMISSAO_CONCEDER_ACESSO_USUARIO_DASHBOARD'])
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
      throw new UnauthorizedException();
    }

    return this.dashboardService.update(id, dto, req.user);
  }

  @Delete('/:id')
  @Authorization('permission', ['PERMISSAO_EXCLUIR_DASHBOARD'])
  @HttpCode(204)
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.dashboardService.delete(id);
  }
}
