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

  @Prop({ type: [Object], default: [] })
  dados: Record<string, unknown>[];

  @Prop({ type: Number, required: true, default: 0 })
  total_linhas: number;
}

export const RelatorioSnapshotSchema =
  SchemaFactory.createForClass(RelatorioSnapshot);
