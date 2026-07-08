import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Request,
  Res,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { createReadStream, existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { Response } from 'express';
import * as UserRequest from 'src/shared/interfaces/UserRequest';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Relatorio } from 'src/database/entities/Relatorios';
import { ReportJobService } from './report-job.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@Controller('relatorios/jobs')
@ApiTags('relatorios')
export class ReportJobController {
  constructor(
    private readonly reportJobService: ReportJobService,
    @InjectRepository(Relatorio)
    private readonly relatorioRepository: Repository<Relatorio>,
  ) {}

  @Get('/:jobId')
  @ApiBearerAuth('access-token')
  async getJobStatus(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Request() req: UserRequest.UserRequest,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.reportJobService.getJobStatus(jobId, req.user.sub);
  }

  @Get('/:jobId/download')
  @ApiBearerAuth('access-token')
  async downloadExport(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Request() req: UserRequest.UserRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!req.user) throw new UnauthorizedException();

    const job = await this.reportJobService.getJobForDownload(
      jobId,
      req.user.sub,
    );

    if (!job.resultPath || !existsSync(job.resultPath)) {
      throw new NotFoundException('Arquivo de exportação não encontrado');
    }

    const relatorio = await this.relatorioRepository.findOne({
      where: { id: job.relatorioId },
    });
    const safeName = (relatorio?.nome ?? 'relatorio').replace(
      /[^a-zA-Z0-9-_]+/g,
      '_',
    );

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName}-${basename(job.resultPath)}"`,
    );

    return new StreamableFile(createReadStream(job.resultPath));
  }
}
