import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectRepository } from '@nestjs/typeorm';
import { Model } from 'mongoose';
import { In, Repository } from 'typeorm';
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
import { DuckDbService } from './duckdb/duckdb.service';
import { sha256File } from './storage/checksum.util';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from './storage/storage-provider.interface';

export interface ResolvedSnapshotFile {
  snapshot: RelatorioSnapshot;
  readUri: string;
}

@Injectable()
export class ReportSnapshotService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReportSnapshotService.name);

  constructor(
    @InjectModel(RelatorioSnapshot.name)
    private readonly snapshotModel: Model<RelatorioSnapshot>,
    @InjectRepository(Relatorio)
    private readonly relatorioRepository: Repository<Relatorio>,
    private readonly reportExecutionService: ReportExecutionService,
    private readonly pgBossService: PgBossService,
    private readonly duckDbService: DuckDbService,
    @Inject(STORAGE_PROVIDER)
    private readonly storage: StorageProvider,
    @Inject(forwardRef(() => ReportJobService))
    private readonly reportJobService: ReportJobService,
  ) {}

  /** Invalida snapshots em formato antigo (sem arquivo Parquet) forçando regeneração. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const legacy = await this.snapshotModel
        .find({
          $or: [
            { storage_key: { $exists: false } },
            { storage_key: null },
            { storage_key: '' },
          ],
        })
        .select('relatorio_id')
        .lean();

      const ids = legacy.map((doc) => doc.relatorio_id).filter(Boolean);
      if (ids.length === 0) {
        return;
      }

      await this.relatorioRepository.update(
        { id: In(ids), estado: EstadoRelatorio.OFFLINE },
        {
          snapshot_valido: false,
          erro_ultima_geracao:
            'Snapshot em formato antigo. Gere o snapshot novamente.',
        },
      );

      this.logger.warn(
        `${ids.length} snapshot(s) legado(s) marcados para regeneração (Parquet).`,
      );
    } catch (error) {
      this.logger.error(
        `Falha ao invalidar snapshots legados: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
    }
  }

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

    let jsonlPath: string | undefined;

    try {
      const result = await this.reportExecutionService.execute(
        relatorioId,
        parametrosSnapshot,
      );

      const previous = await this.snapshotModel
        .findOne({ relatorio_id: relatorioId })
        .lean();

      const storageKey = this.buildStorageKey(relatorioId);
      const outPath = await this.storage.resolveWritePath(storageKey);

      if (result.total_linhas === 0) {
        await this.duckDbService.writeEmptyParquet(result.colunas, outPath);
      } else {
        jsonlPath = await this.writeRowsToJsonl(relatorioId, result.dados);
        await this.duckDbService.writeParquet(jsonlPath, outPath);
      }

      await this.storage.finalizeWrite(storageKey);

      const colunasTipos = await this.duckDbService.describe(outPath);
      const checksum = await sha256File(outPath);
      const { size } = await this.storage.stat(storageKey);

      await this.snapshotModel.findOneAndUpdate(
        { relatorio_id: relatorioId },
        {
          relatorio_id: relatorioId,
          gerado_em: new Date(),
          gerado_por: userId,
          parametros_utilizados: parametrosSnapshot,
          colunas: result.colunas,
          colunas_tipos: colunasTipos,
          total_linhas: result.total_linhas,
          storage_driver: this.storage.driver,
          storage_key: storageKey,
          formato: 'parquet',
          checksum_sha256: checksum,
          tamanho_bytes: size,
        },
        { upsert: true, returnDocument: 'after' },
      );

      if (previous?.storage_key && previous.storage_key !== storageKey) {
        await this.storage
          .delete(previous.storage_key)
          .catch((error: unknown) =>
            this.logger.warn(
              `Falha ao remover Parquet anterior ${previous.storage_key}: ${
                error instanceof Error ? error.message : 'erro'
              }`,
            ),
          );
      }

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
    } finally {
      if (jsonlPath) {
        await rm(jsonlPath, { force: true }).catch(() => undefined);
      }
    }
  }

  private buildStorageKey(relatorioId: number): string {
    const unique = `${Date.now()}-${randomBytes(6).toString('hex')}`;
    return `rel_${relatorioId}/${unique}.parquet`;
  }

  private async writeRowsToJsonl(
    relatorioId: number,
    rows: Record<string, unknown>[],
  ): Promise<string> {
    const dir = join(tmpdir(), 'datadash-snapshots');
    await mkdir(dir, { recursive: true });
    const filePath = join(
      dir,
      `rel_${relatorioId}-${Date.now()}-${randomBytes(4).toString('hex')}.jsonl`,
    );

    const stream = createWriteStream(filePath, { encoding: 'utf8' });
    const replacer = (_key: string, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value;

    try {
      for (const row of rows) {
        const line = `${JSON.stringify(row, replacer)}\n`;
        if (!stream.write(line)) {
          await new Promise<void>((resolve) => stream.once('drain', resolve));
        }
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        stream.end((error?: Error | null) =>
          error ? reject(error) : resolve(),
        );
      });
    }

    return filePath;
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

  /**
   * Resolve o arquivo Parquet de um snapshot válido, verificando integridade
   * (checksum). Retorna null se não houver snapshot em formato Parquet.
   */
  async resolveSnapshotFile(
    relatorioId: number,
  ): Promise<ResolvedSnapshotFile | null> {
    const snapshot = await this.snapshotModel
      .findOne({ relatorio_id: relatorioId })
      .lean();

    if (!snapshot || !snapshot.storage_key) {
      return null;
    }

    const exists = await this.storage.exists(snapshot.storage_key);
    if (!exists) {
      throw new Error(
        'Arquivo do snapshot não encontrado no armazenamento. Gere novamente.',
      );
    }

    if (snapshot.checksum_sha256) {
      const readUri = this.storage.resolveReadUri(snapshot.storage_key);
      const actual = await sha256File(readUri);
      if (actual !== snapshot.checksum_sha256) {
        await this.relatorioRepository.update(
          { id: relatorioId },
          {
            snapshot_valido: false,
            erro_ultima_geracao:
              'Integridade do snapshot comprometida (checksum divergente). Gere novamente.',
          },
        );
        throw new Error(
          'Integridade do snapshot comprometida (checksum divergente). Gere novamente.',
        );
      }
    }

    return {
      snapshot,
      readUri: this.storage.resolveReadUri(snapshot.storage_key),
    };
  }

  async deleteSnapshot(relatorioId: number): Promise<void> {
    const snapshot = await this.snapshotModel
      .findOne({ relatorio_id: relatorioId })
      .lean();

    if (snapshot?.storage_key) {
      await this.storage
        .delete(snapshot.storage_key)
        .catch((error: unknown) =>
          this.logger.warn(
            `Falha ao remover Parquet ${snapshot.storage_key}: ${
              error instanceof Error ? error.message : 'erro'
            }`,
          ),
        );
    }

    await this.snapshotModel.deleteOne({ relatorio_id: relatorioId });
  }
}
