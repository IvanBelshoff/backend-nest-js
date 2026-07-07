import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AppLogDocument = HydratedDocument<AppLog>;

@Schema({ collection: 'app_logs', timestamps: { createdAt: 'criado_em' } })
export class AppLog {
  @Prop({ required: true })
  nivel: string;

  @Prop({ required: true })
  mensagem: string;

  @Prop({ type: Object, default: {} })
  contexto: Record<string, unknown>;

  @Prop({ type: Number, required: false, default: null })
  usuario_id?: number | null;
}

export const AppLogSchema = SchemaFactory.createForClass(AppLog);
