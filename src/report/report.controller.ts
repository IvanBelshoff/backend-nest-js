import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { EstadoRelatorio } from 'src/database/entities/Relatorios';
import { Public } from 'src/shared/decorators/auth-public.decorator';
import { Authorization, AuthorizationAll } from 'src/shared/decorators/authorization.decorator';
import { ZodQueryValidation, ZodValidation } from 'src/shared/decorators/zod-validation.decorator';
import { setTotalCount } from 'src/shared/dto/pagination.dto';
import * as UserRequest from 'src/shared/interfaces/UserRequest';
import {
  assignReportUsersSchema,
  type AssignReportUsersDto,
} from './dto/assign-users.dto';
import {
  createReportSchema,
  executeReportSchema,
  snapshotUpdateSchema,
  updateReportSchema,
  type CreateReportDto,
  type ExecuteReportDto,
  type SnapshotUpdateDto,
  type UpdateReportDto,
} from './dto/create-report.dto';
import {
  reportPrivateQuerySchema,
  reportPublicQuerySchema,
  reportQuerySchema,
  type ReportPrivateQueryDto,
  type ReportPublicQueryDto,
  type ReportQueryDto,
} from './dto/report-query.dto';
import { ReportExecutionService } from './execution/report-execution.service';
import { exportReportSchema, type ExportReportDto } from './jobs/dto/export-report.dto';
import { ReportExportService } from './export/report-export.service';
import { ReportSnapshotService } from './report-snapshot.service';
import { ReportListParams, ReportService } from './report.service';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';

@Controller('relatorios')
@ApiTags('relatorios')
export class ReportController {
  constructor(
    private readonly reportService: ReportService,
    private readonly reportExecutionService: ReportExecutionService,
    private readonly reportSnapshotService: ReportSnapshotService,
    private readonly reportExportService: ReportExportService,
  ) {}

  @Post('/')
  @AuthorizationAll(
    { type: 'role', required: ['REGRA_RELATORIO'] },
    { type: 'permission', required: ['PERMISSAO_CRIAR_RELATORIO'] },
  )
  @ApiBearerAuth('access-token')
  @ZodValidation(createReportSchema)
  async create(
    @Body() dto: CreateReportDto,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.reportService.create(dto, req.user);
  }

  @Get('/')
  @Authorization('role', ['REGRA_RELATORIO'])
  @ApiBearerAuth('access-token')
  @ZodQueryValidation(reportQuerySchema)
  @ApiHeader({ name: 'x-total-count', description: 'Total de registros' })
  async findAll(
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const params: ReportListParams = { ...query };
    const { data, total } = await this.reportService.findAllPaginated(params);
    setTotalCount(response, total);
    return data;
  }

  @Get('/private')
  @ZodQueryValidation(reportPrivateQuerySchema)
  async findAllPrivate(
    @Query() query: ReportPrivateQueryDto,
    @Request() req: UserRequest.UserRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!req.user) throw new UnauthorizedException();
    const { data, total, favoritos } = await this.reportService.findAllPrivate(
      req.user.sub,
      query,
    );
    setTotalCount(response, total);
    return { data, favoritos };
  }

  @Public()
  @Get('/public')
  @ZodQueryValidation(reportPublicQuerySchema)
  async findAllPublic(
    @Query() query: ReportPublicQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { page, limit, nome } = query;
    const { data, total } = await this.reportService.findAllPublic(
      page,
      limit,
      nome,
    );
    setTotalCount(response, total);
    return data;
  }

  @Get('/filters')
  @Authorization('role', ['REGRA_RELATORIO'])
  @ZodQueryValidation(reportQuerySchema)
  async getFilters(@Query() query: ReportQueryDto) {
    return this.reportService.getFilters(query);
  }

  @Public()
  @Get('/public/:id')
  async findPublicById(@Param('id', ParseIntPipe) id: number) {
    return this.reportService.findPublicById(id);
  }

  @Get('/private/:id')
  async findPrivateById(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.reportService.findPrivateById(id, req.user.sub);
  }

  @Get('/:id/status')
  async getStatus(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.reportService.getStatus(id, req.user.sub);
  }

  @Post('/:id/executar')
  @ZodValidation(executeReportSchema)
  async execute(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExecuteReportDto,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) throw new UnauthorizedException();
    const relatorio = await this.reportService.findById(id, req.user.sub);

    if (relatorio.estado !== EstadoRelatorio.ONLINE) {
      throw new ConflictException(
        'Relatório não está online. Use GET /relatorios/:id/dados para snapshot.',
      );
    }

    return this.reportExecutionService.execute(id, dto.parametros);
  }

  @Get('/:id/dados')
  async getData(
    @Param('id', ParseIntPipe) id: number,
    @Query('parametros') parametrosRaw: string | undefined,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) throw new UnauthorizedException();
    const relatorio = await this.reportService.findById(id, req.user.sub);

    if (relatorio.estado === EstadoRelatorio.ONLINE) {
      const parametros = parametrosRaw ? JSON.parse(parametrosRaw) : {};
      const result = await this.reportExecutionService.execute(id, parametros);
      return {
        estado: relatorio.estado,
        ...result,
      };
    }

    if (
      relatorio.estado === EstadoRelatorio.OFFLINE &&
      !relatorio.snapshot_valido
    ) {
      throw new ConflictException(
        'Snapshot desatualizado. Solicite ao gestor uma nova geração.',
      );
    }

    const snapshot = await this.reportSnapshotService.findSnapshot(id);

    if (!snapshot) {
      throw new ConflictException('Snapshot não encontrado para este relatório.');
    }

    return {
      estado: relatorio.estado,
      snapshot_atualizado_em: relatorio.snapshot_atualizado_em,
      snapshot_valido: relatorio.snapshot_valido,
      parametros_utilizados: snapshot.parametros_utilizados,
      colunas: snapshot.colunas,
      dados: snapshot.dados,
      total_linhas: snapshot.total_linhas,
    };
  }

  @Post('/:id/exportar')
  @ZodValidation(exportReportSchema)
  @HttpCode(HttpStatus.ACCEPTED)
  async exportReport(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExportReportDto,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) throw new UnauthorizedException();

    const jobId = await this.reportExportService.scheduleExport(
      id,
      req.user.sub,
      dto.parametros ?? {},
    );

    return {
      jobId,
      status: 'queued',
      message: 'Exportação enfileirada.',
    };
  }

  @Post('/:id/snapshot/atualizar')
  @Authorization('permission', ['PERMISSAO_ATUALIZAR_RELATORIO'])
  @ZodValidation(snapshotUpdateSchema)
  @HttpCode(HttpStatus.ACCEPTED)
  async refreshSnapshot(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SnapshotUpdateDto,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.reportService.startSnapshotRefresh(
      id,
      req.user,
      dto.parametros_snapshot,
    );
  }

  @Get('/users/:id')
  @AuthorizationAll(
    { type: 'role', required: ['REGRA_USUARIO'] },
    { type: 'permission', required: ['PERMISSAO_CONCEDER_ACESSO_RELATORIO'] },
  )
  async getRelatoriosByUser(@Param('id', ParseIntPipe) id: number) {
    return this.reportService.getRelatoriosByUser(id);
  }

  @Get('/:id')
  @Authorization('role', ['REGRA_RELATORIO'])
  async findById(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.reportService.findById(id, req.user.sub);
  }

  @Patch('/users/:id')
  @Authorization('permission', ['PERMISSAO_CONCEDER_ACESSO_RELATORIO'])
  @ZodValidation(assignReportUsersSchema)
  @HttpCode(204)
  async assignUsers(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignReportUsersDto,
  ) {
    await this.reportService.assignUsers(id, dto.usuarios);
  }

  @Patch('/:id')
  @Authorization('permission', ['PERMISSAO_ATUALIZAR_RELATORIO'])
  @ZodValidation(updateReportSchema)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReportDto,
    @Request() req: UserRequest.UserRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!req.user) throw new UnauthorizedException();

    const { relatorio, shouldGenerateSnapshot } = await this.reportService.update(
      id,
      dto,
      req.user,
    );

    if (shouldGenerateSnapshot) {
      response.status(HttpStatus.ACCEPTED);

      try {
        const jobId = await this.reportSnapshotService.scheduleSnapshotGeneration(
          id,
          req.user.sub,
          dto.parametros_snapshot ?? {},
        );

        return { ...relatorio, jobId };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Falha ao enfileirar geração de snapshot';
        await this.reportService.rollbackSnapshotEnqueue(id, message);
        throw error;
      }
    }

    return relatorio;
  }

  @Delete('/:id')
  @Authorization('permission', ['PERMISSAO_EXCLUIR_RELATORIO'])
  @HttpCode(204)
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.reportService.delete(id);
  }
}
