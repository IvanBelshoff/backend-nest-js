import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { env } from 'src/shared/env.schema';
import {
  SystemMetricSnapshotRecord,
  type SystemMetricSnapshotDocument,
} from './schemas/system-metric-snapshot.schema';
import type { SystemMetricsSnapshot } from './types/system-metrics.types';

@Injectable()
export class MetricsPersistenceService implements OnModuleInit {
  constructor(
    @InjectModel(SystemMetricSnapshotRecord.name)
    private readonly snapshotModel: Model<SystemMetricSnapshotDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    const ttlSeconds = env.METRICS_RETENTION_DAYS * 24 * 60 * 60;
    const indexName = 'recordedAt_1';
    const collection = this.snapshotModel.collection;

    const indexes = await collection.indexes();
    const existing = indexes.find((index) => index.name === indexName);

    if (existing && existing.expireAfterSeconds !== ttlSeconds) {
      await collection.dropIndex(indexName);
    }

    await collection.createIndex(
      { recordedAt: 1 },
      { expireAfterSeconds: ttlSeconds, name: indexName },
    );
  }

  async saveSnapshot(snapshot: SystemMetricsSnapshot): Promise<void> {
    await this.snapshotModel.create({
      ...snapshot,
      recordedAt: new Date(snapshot.recordedAt),
    });
  }

  async findHistory(hours: number, limit = 500): Promise<SystemMetricsSnapshot[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const records = await this.snapshotModel
      .find({ recordedAt: { $gte: since } })
      .sort({ recordedAt: 1 })
      .limit(limit)
      .lean()
      .exec();

    return records.map((record) => ({
      ...record,
      recordedAt: new Date(record.recordedAt).toISOString(),
    }));
  }
}
