import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Model } from 'mongoose';
import { Repository } from 'typeorm';
import {
  EstadoRelatorio,
  Relatorio,
} from 'src/database/entities/Relatorios';
import { PgBossService } from 'src/queue/pg-boss.service';
import { REPORT_SNAPSHOT_QUEUE } from 'src/queue/queue.constants';
import type { SnapshotJobPayload } from 'src/queue/types/snapshot-job.payload';
import { env } from 'src/shared/env.schema';
import { RelatorioJobTipo } from 'src/database/entities/RelatorioJobs';
import { ReportJobService } from './jobs/report-job.service';
import { RelatorioSnapshot } from './schemas/relatorio-snapshot.schema';
import { ReportExecutionService } from './execution/report-execution.service';

@Injectable()
export class ReportSnapshotService {
  constructor(
    @InjectModel(RelatorioSnapshot.name)
    private readonly snapshotModel: Model<RelatorioSnapshot>,
    @InjectRepository(Relatorio)
    private readonly relatorioRepository: Repository<Relatorio>,
    private readonly reportExecutionService: ReportExecutionService,
    private readonly pgBossService: PgBossService,
    @Inject(forwardRef(() => ReportJobService))
    private readonly reportJobService: ReportJobService,
  ) {}

  async generateSnapshot(
    relatorioId: number,
    userId: number,
    parametrosSnapshot: Record<string, unknown> = {},
  ): Promise<void> {
    const relatorio = await this.relatorioRepository.findOne({
      where: { id: relatorioId },
    });

    if (!relatorio) {
      return;
    }

    try {
      const result = await this.reportExecutionService.execute(
        relatorioId,
        parametrosSnapshot,
      );

      await this.snapshotModel.findOneAndUpdate(
        { relatorio_id: relatorioId },
        {
          relatorio_id: relatorioId,
          gerado_em: new Date(),
          gerado_por: userId,
          parametros_utilizados: parametrosSnapshot,
          colunas: result.colunas,
          dados: result.dados,
          total_linhas: result.total_linhas,
        },
        { upsert: true, new: true },
      );

      relatorio.estado = EstadoRelatorio.OFFLINE;
      relatorio.snapshot_atualizado_em = new Date();
      relatorio.snapshot_valido = true;
      relatorio.erro_ultima_geracao = null;
      await this.relatorioRepository.save(relatorio);
    } catch (error) {
      relatorio.estado = EstadoRelatorio.ONLINE;
      relatorio.erro_ultima_geracao =
        error instanceof Error ? error.message : 'Erro ao gerar snapshot';
      await this.relatorioRepository.save(relatorio);
    }
  }

  async scheduleSnapshotGeneration(
    relatorioId: number,
    userId: number,
    parametrosSnapshot: Record<string, unknown> = {},
  ): Promise<string> {
    const payload: SnapshotJobPayload = {
      relatorioId,
      userId,
      parametrosSnapshot,
    };

    const expireInSeconds = Math.ceil(env.REPORT_QUERY_TIMEOUT_MS / 1000) + 300;

    const jobId = await this.pgBossService.send(
      REPORT_SNAPSHOT_QUEUE,
      payload,
      {
        singletonKey: `report-snapshot-${relatorioId}`,
        retryLimit: env.REPORT_SNAPSHOT_RETRY_LIMIT,
        retryDelay: env.REPORT_SNAPSHOT_RETRY_DELAY_SECONDS,
        expireInSeconds,
      },
    );

    await this.reportJobService.createJob({
      id: jobId,
      relatorioId,
      userId,
      tipo: RelatorioJobTipo.SNAPSHOT,
      parametros: parametrosSnapshot,
    });

    return jobId;
  }

  async findSnapshot(relatorioId: number) {
    return this.snapshotModel.findOne({ relatorio_id: relatorioId }).lean();
  }

  async deleteSnapshot(relatorioId: number): Promise<void> {
    await this.snapshotModel.deleteOne({ relatorio_id: relatorioId });
  }
}
