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
import { ConnectionService } from './connection.service';
import { ConnectionQueryService } from './connection-query.service';
import {
  createConnectionSchema,
  type CreateConnectionDto,
} from './dto/create-connection.dto';
import {
  updateConnectionSchema,
  type UpdateConnectionDto,
} from './dto/update-connection.dto';
import {
  connectionQuerySchema,
  type ConnectionQueryDto,
} from './dto/connection-query.dto';
import {
  connectionQueryCountSchema,
  connectionQueryPreviewSchema,
  type ConnectionQueryCountDto,
  type ConnectionQueryPreviewDto,
} from './dto/connection-query-preview.dto';
import { ZodValidation, ZodQueryValidation } from 'src/shared/decorators/zod-validation.decorator';
import { Authorization, AuthorizationAll } from 'src/shared/decorators/authorization.decorator';
import * as UserRequest from 'src/shared/interfaces/UserRequest';
import { setTotalCount } from 'src/shared/dto/pagination.dto';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';

@Controller('conexoes')
@ApiTags('conexoes')
@ApiBearerAuth('access-token')
export class ConnectionController {
  constructor(
    private readonly connectionService: ConnectionService,
    private readonly connectionQueryService: ConnectionQueryService,
  ) {}

  @Post('/')
  @AuthorizationAll(
    { type: 'role', required: ['REGRA_RELATORIO'] },
    { type: 'permission', required: ['PERMISSAO_CRIAR_CONEXAO'] },
  )
  @ZodValidation(createConnectionSchema)
  @ApiOperation({ summary: 'Cria conexão de banco' })
  async create(
    @Body() dto: CreateConnectionDto,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.connectionService.create(dto, req.user);
  }

  @Get('/')
  @Authorization('role', ['REGRA_RELATORIO'])
  @ZodQueryValidation(connectionQuerySchema)
  @ApiOperation({ summary: 'Lista conexões (header x-total-count)' })
  @ApiHeader({ name: 'x-total-count', description: 'Total de registros' })
  async findAll(
    @Query() query: ConnectionQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { page, limit, nome, tipo } = query;
    const { data, total } = await this.connectionService.findAllPaginated({
      page,
      limit,
      nome,
      tipo,
    });

    setTotalCount(response, total);
    return data;
  }

  @Get('/:id')
  @Authorization('role', ['REGRA_RELATORIO'])
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.connectionService.findById(id);
  }

  @Patch('/:id')
  @Authorization('permission', ['PERMISSAO_ATUALIZAR_CONEXAO'])
  @ZodValidation(updateConnectionSchema)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateConnectionDto,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) {
      throw new UnauthorizedException();
    }

    return this.connectionService.update(id, dto, req.user);
  }

  @Delete('/:id')
  @Authorization('permission', ['PERMISSAO_EXCLUIR_CONEXAO'])
  @HttpCode(204)
  async delete(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) throw new UnauthorizedException();
    await this.connectionService.delete(id, req.user);
  }

  @Post('/:id/testar')
  @Authorization('role', ['REGRA_RELATORIO'])
  @ApiOperation({ summary: 'Testa conectividade da conexão' })
  async test(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.connectionService.test(id, req.user);
  }

  @Post('/:id/consultar')
  @AuthorizationAll(
    { type: 'role', required: ['REGRA_RELATORIO'] },
    { type: 'permission', required: ['PERMISSAO_CRIAR_RELATORIO', 'PERMISSAO_ATUALIZAR_RELATORIO'] },
  )
  @ZodValidation(connectionQueryPreviewSchema)
  @ApiOperation({ summary: 'Executa preview de query ad-hoc na conexão' })
  async previewQuery(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConnectionQueryPreviewDto,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.connectionQueryService.preview(id, dto, req.user);
  }

  @Post('/:id/consultar/contar')
  @AuthorizationAll(
    { type: 'role', required: ['REGRA_RELATORIO'] },
    { type: 'permission', required: ['PERMISSAO_CRIAR_RELATORIO', 'PERMISSAO_ATUALIZAR_RELATORIO'] },
  )
  @ZodValidation(connectionQueryCountSchema)
  @ApiOperation({ summary: 'Conta total de registros de uma query ad-hoc' })
  async countQuery(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConnectionQueryCountDto,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.connectionQueryService.count(id, dto, req.user);
  }

  @Get('/:id/schema')
  @AuthorizationAll(
    { type: 'role', required: ['REGRA_RELATORIO'] },
    { type: 'permission', required: ['PERMISSAO_CRIAR_RELATORIO', 'PERMISSAO_ATUALIZAR_RELATORIO'] },
  )
  @ApiOperation({ summary: 'Lista schemas/databases da conexão' })
  async listSchema(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.connectionQueryService.listSchemas(id);
  }

  @Get('/:id/schema/:escopo/tabelas')
  @AuthorizationAll(
    { type: 'role', required: ['REGRA_RELATORIO'] },
    { type: 'permission', required: ['PERMISSAO_CRIAR_RELATORIO', 'PERMISSAO_ATUALIZAR_RELATORIO'] },
  )
  @ApiOperation({ summary: 'Lista tabelas/views de um schema' })
  async listTables(
    @Param('id', ParseIntPipe) id: number,
    @Param('escopo') escopo: string,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.connectionQueryService.listTables(id, escopo);
  }

  @Get('/:id/schema/:escopo/tabelas/:tabela/colunas')
  @AuthorizationAll(
    { type: 'role', required: ['REGRA_RELATORIO'] },
    { type: 'permission', required: ['PERMISSAO_CRIAR_RELATORIO', 'PERMISSAO_ATUALIZAR_RELATORIO'] },
  )
  @ApiOperation({ summary: 'Lista colunas de uma tabela' })
  async listColumns(
    @Param('id', ParseIntPipe) id: number,
    @Param('escopo') escopo: string,
    @Param('tabela') tabela: string,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.connectionQueryService.listColumns(id, escopo, tabela);
  }
}
