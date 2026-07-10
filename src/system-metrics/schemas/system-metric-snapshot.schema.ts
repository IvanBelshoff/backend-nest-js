import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { SystemMetricsSnapshot } from '../types/system-metrics.types';

export type SystemMetricSnapshotDocument =
  HydratedDocument<SystemMetricSnapshotRecord>;

@Schema({ collection: 'system_metric_snapshots', versionKey: false })
export class SystemMetricSnapshotRecord {
  @Prop({ required: true, type: Date })
  recordedAt: Date;

  @Prop({ required: true })
  version: string;

  @Prop({ required: true })
  environment: string;

  @Prop({ type: Object, required: true })
  process: SystemMetricsSnapshot['process'];

  @Prop({ type: Object, required: true })
  dependencies: SystemMetricsSnapshot['dependencies'];

  @Prop({ type: Object, required: true })
  http: SystemMetricsSnapshot['http'];

  @Prop({ type: Object, required: true })
  storage: SystemMetricsSnapshot['storage'];
}

export const SystemMetricSnapshotSchema = SchemaFactory.createForClass(
  SystemMetricSnapshotRecord,
);
