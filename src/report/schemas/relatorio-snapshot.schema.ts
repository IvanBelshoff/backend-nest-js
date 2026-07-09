import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RelatorioSnapshotDocument = HydratedDocument<RelatorioSnapshot>;

@Schema({ collection: 'relatorio_snapshots', timestamps: false })
export class RelatorioSnapshot {
  @Prop({ type: Number, required: true, unique: true, index: true })
  relatorio_id: number;

  @Prop({ type: Date, required: true })
  gerado_em: Date;

  @Prop({ type: Number, required: true })
  gerado_por: number;

  @Prop({ type: Object, default: {} })
  parametros_utilizados: Record<string, unknown>;

  @Prop({ type: [String], default: [] })
  colunas: string[];

  @Prop({ type: Object, default: {} })
  colunas_tipos: Record<string, string>;

  @Prop({ type: Number, required: true, default: 0 })
  total_linhas: number;

  @Prop({ type: String, default: 'local' })
  storage_driver: string;

  @Prop({ type: String })
  storage_key?: string;

  @Prop({ type: String, default: 'parquet' })
  formato: string;

  @Prop({ type: String })
  checksum_sha256?: string;

  @Prop({ type: Number, default: 0 })
  tamanho_bytes: number;
}

export const RelatorioSnapshotSchema =
  SchemaFactory.createForClass(RelatorioSnapshot);
