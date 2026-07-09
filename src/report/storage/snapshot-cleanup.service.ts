import { stat } from 'node:fs/promises';
import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { env } from 'src/shared/env.schema';
import { RelatorioSnapshot } from '../schemas/relatorio-snapshot.schema';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from './storage-provider.interface';

/**
 * Remove arquivos Parquet órfãos (sem documento correspondente no MongoDB)
 * que excederam o TTL configurado em `SNAPSHOT_TTL_HOURS`.
 */
@Injectable()
export class SnapshotCleanupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SnapshotCleanupService.name);

  constructor(
    @InjectModel(RelatorioSnapshot.name)
    private readonly snapshotModel: Model<RelatorioSnapshot>,
    @Inject(STORAGE_PROVIDER)
    private readonly storage: StorageProvider,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const removed = await this.cleanupOrphanParquet();
      if (removed > 0) {
        this.logger.log(`${removed} arquivo(s) Parquet órfão(s) removido(s).`);
      }
    } catch (error) {
      this.logger.error(
        `Falha na limpeza de Parquet órfãos: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
    }
  }

  async cleanupOrphanParquet(): Promise<number> {
    const keys = await this.storage.listKeys();
    if (keys.length === 0) {
      return 0;
    }

    const snapshots = await this.snapshotModel
      .find({ storage_key: { $exists: true, $ne: null } })
      .select('storage_key')
      .lean();

    const referenced = new Set(
      snapshots
        .map((doc) => doc.storage_key)
        .filter((key): key is string => Boolean(key)),
    );

    const ttlMs = env.SNAPSHOT_TTL_HOURS * 60 * 60 * 1000;
    const now = Date.now();
    let removed = 0;

    for (const key of keys) {
      if (referenced.has(key)) {
        continue;
      }

      try {
        const readUri = this.storage.resolveReadUri(key);
        const info = await stat(readUri);
        const ageMs = now - info.mtimeMs;

        if (ageMs < ttlMs) {
          continue;
        }

        await this.storage.delete(key);
        removed += 1;
      } catch (error) {
        this.logger.warn(
          `Falha ao avaliar/remover Parquet órfão ${key}: ${
            error instanceof Error ? error.message : 'erro'
          }`,
        );
      }
    }

    return removed;
  }
}
