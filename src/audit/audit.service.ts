import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { env } from 'src/shared/env.schema';
import { UserAuditLog } from './schemas/user-audit-log.schema';
import type { AuditQueryDto } from './dto/audit-query.dto';
import type {
  AuditLogItem,
  AuditLogListResult,
  AuditRecordInput,
} from './types/audit.types';
import { sanitizeAuditMetadata } from './utils/sanitize-audit-metadata.util';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(UserAuditLog.name)
    private readonly auditModel: Model<UserAuditLog>,
  ) {}

  record(input: AuditRecordInput): void {
    if (!env.AUDIT_ENABLED) {
      return;
    }

    void this.persist(input).catch((error: unknown) => {
      this.logger.warn('Audit persist failed', {
        message: error instanceof Error ? error.message : String(error),
        action: input.action,
      });
    });
  }

  async findPaginated(query: AuditQueryDto): Promise<AuditLogListResult> {
    const filter = this.buildFilter(query);
    const skip = (query.page - 1) * query.pageSize;

    const [items, total] = await Promise.all([
      this.auditModel
        .find(filter)
        .sort({ criado_em: -1 })
        .skip(skip)
        .limit(query.pageSize)
        .lean()
        .exec(),
      this.auditModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items.map((item) => this.mapToItem(item)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async findById(id: string): Promise<AuditLogItem> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Evento de auditoria não encontrado');
    }

    const item = await this.auditModel.findById(id).lean().exec();

    if (!item) {
      throw new NotFoundException('Evento de auditoria não encontrado');
    }

    return this.mapToItem(item);
  }

  async listDistinctActions(): Promise<string[]> {
    return this.auditModel.distinct('action').exec();
  }

  private async persist(input: AuditRecordInput): Promise<void> {
    const metadata = sanitizeAuditMetadata(input.metadata ?? {}) as Record<
      string,
      unknown
    >;

    await this.auditModel.create({
      actor_user_id: input.actor.userId ?? null,
      actor_email: input.actor.email ?? null,
      actor_type: input.actor.type,
      action: input.action,
      category: input.category,
      outcome: input.outcome,
      resource_type: input.resource?.type ?? null,
      resource_id: input.resource?.id ?? null,
      http: input.http as Record<string, unknown> | undefined,
      metadata,
      correlation_id: input.correlation_id ?? null,
    });
  }

  private buildFilter(query: AuditQueryDto): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    if (query.actorUserId !== undefined) {
      filter.actor_user_id = query.actorUserId;
    }

    if (query.action) {
      filter.action = query.action;
    }

    if (query.category) {
      filter.category = query.category;
    }

    if (query.outcome) {
      filter.outcome = query.outcome;
    }

    if (query.resourceType) {
      filter.resource_type = query.resourceType;
    }

    if (query.resourceId) {
      filter.resource_id = query.resourceId;
    }

    if (query.from || query.to) {
      const criadoEm: Record<string, Date> = {};
      if (query.from) {
        criadoEm.$gte = new Date(query.from);
      }
      if (query.to) {
        criadoEm.$lte = new Date(query.to);
      }
      filter.criado_em = criadoEm;
    }

    if (query.search) {
      const regex = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ actor_email: regex }, { action: regex }];
    }

    return filter;
  }

  private mapToItem(
    doc: UserAuditLog & { _id: Types.ObjectId; criado_em?: Date },
  ): AuditLogItem {
    return {
      id: doc._id.toString(),
      actor_user_id: doc.actor_user_id,
      actor_email: doc.actor_email,
      actor_type: doc.actor_type as AuditLogItem['actor_type'],
      action: doc.action,
      category: doc.category as AuditLogItem['category'],
      outcome: doc.outcome as AuditLogItem['outcome'],
      resource_type: doc.resource_type,
      resource_id: doc.resource_id,
      http: doc.http as AuditLogItem['http'],
      metadata: doc.metadata ?? {},
      correlation_id: doc.correlation_id,
      criado_em: doc.criado_em ?? new Date(),
    };
  }
}
