import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EstadoRelatorio,
  Relatorio,
} from 'src/database/entities/Relatorios';
import { ReportSnapshotService } from 'src/report/report-snapshot.service';
import { AgendamentoVinculoTipo } from '../entities/scheduler.enums';
import {
  ScheduleHandler,
  ScheduleHandlerContext,
  ScheduleHandlerResult,
} from './schedule-handler.interface';
import { ScheduleHandlerRegistry } from '../schedule-handler.registry';

@Injectable()
export class ReportSnapshotRefreshHandler
  implements ScheduleHandler, OnModuleInit
{
  readonly tipo = AgendamentoVinculoTipo.REPORT_SNAPSHOT_REFRESH;

  constructor(
    private readonly handlerRegistry: ScheduleHandlerRegistry,
    private readonly reportSnapshotService: ReportSnapshotService,
    @InjectRepository(Relatorio)
    private readonly relatorioRepository: Repository<Relatorio>,
  ) {}

  onModuleInit(): void {
    this.handlerRegistry.register(this);
  }

  async execute(ctx: ScheduleHandlerContext): Promise<ScheduleHandlerResult> {
    const relatorio = await this.relatorioRepository.findOne({
      where: { id: ctx.vinculo.entidadeId },
    });

    if (!relatorio) {
      return {
        status: 'skipped',
        erro: 'Relatório não encontrado',
      };
    }

    if (relatorio.estado !== EstadoRelatorio.OFFLINE) {
      return {
        status: 'skipped',
        erro: `Relatório em estado ${relatorio.estado}; snapshot agendado apenas para offline`,
      };
    }

    const payload = ctx.vinculo.payload ?? {};
    const userId = Number(payload.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
      return {
        status: 'failed',
        erro: 'userId inválido no payload do vínculo',
      };
    }

    const parametrosSnapshot =
      (payload.parametros_snapshot as Record<string, unknown> | undefined) ??
      {};

    try {
      const jobId = await this.reportSnapshotService.scheduleSnapshotGeneration(
        ctx.vinculo.entidadeId,
        userId,
        parametrosSnapshot,
      );

      return { status: 'completed', jobId };
    } catch (error) {
      return {
        status: 'failed',
        erro:
          error instanceof Error
            ? error.message
            : 'Falha ao enfileirar geração de snapshot',
      };
    }
  }
}
