import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Model } from 'mongoose';
import { Repository } from 'typeorm';
import {
  EstadoRelatorio,
  Relatorio,
} from 'src/database/entities/Relatorios';
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

  scheduleSnapshotGeneration(
    relatorioId: number,
    userId: number,
    parametrosSnapshot: Record<string, unknown> = {},
  ): void {
    setImmediate(() => {
      void this.generateSnapshot(relatorioId, userId, parametrosSnapshot);
    });
  }

  async findSnapshot(relatorioId: number) {
    return this.snapshotModel.findOne({ relatorio_id: relatorioId }).lean();
  }

  async deleteSnapshot(relatorioId: number): Promise<void> {
    await this.snapshotModel.deleteOne({ relatorio_id: relatorioId });
  }
}
