import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { env } from 'src/shared/env.schema';

export type UserAuditLogDocument = HydratedDocument<UserAuditLog>;

@Schema({ collection: 'user_audit_logs', timestamps: { createdAt: 'criado_em' } })
export class UserAuditLog {
  @Prop({ type: Number, default: null, index: true })
  actor_user_id: number | null;

  @Prop({ type: String, default: null })
  actor_email: string | null;

  @Prop({ type: String, required: true, enum: ['user', 'system', 'anonymous'] })
  actor_type: string;

  @Prop({ type: String, required: true, index: true })
  action: string;

  @Prop({ type: String, required: true, index: true })
  category: string;

  @Prop({
    type: String,
    required: true,
    enum: ['success', 'failure', 'denied'],
  })
  outcome: string;

  @Prop({ type: String, default: null, index: true })
  resource_type: string | null;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  resource_id: string | number | null;

  @Prop({ type: Object, default: undefined })
  http?: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ type: String, default: null })
  correlation_id: string | null;
}

export const UserAuditLogSchema = SchemaFactory.createForClass(UserAuditLog);

UserAuditLogSchema.index({ actor_user_id: 1, criado_em: -1 });
UserAuditLogSchema.index({ action: 1, criado_em: -1 });
UserAuditLogSchema.index({ resource_type: 1, resource_id: 1, criado_em: -1 });

if (env.AUDIT_LOG_TTL_DAYS > 0) {
  UserAuditLogSchema.index(
    { criado_em: 1 },
    { expireAfterSeconds: env.AUDIT_LOG_TTL_DAYS * 24 * 60 * 60 },
  );
}
