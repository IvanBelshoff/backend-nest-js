import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import {
  RelatorioJob,
  RelatorioJobStatus,
  RelatorioJobTipo,
} from 'src/database/entities/RelatorioJobs';
import { Relatorio } from 'src/database/entities/Relatorios';
import {
  UserNotification,
  UserNotificationType,
} from 'src/database/entities/UserNotification';
import type { ListUserNotificationsQueryDto } from './dto/list-user-notifications-query.dto';

export type UserNotificationItem = {
  id: string;
  type: UserNotificationType;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
};

export type UserNotificationListResult = {
  items: UserNotificationItem[];
  page: number;
  pageSize: number;
  total: number;
};

@Injectable()
export class UserNotificationService {
  constructor(
    @InjectRepository(UserNotification)
    private readonly notificationRepository: Repository<UserNotification>,
  ) {}

  async createFromJob(
    job: RelatorioJob,
    relatorio: Pick<Relatorio, 'id' | 'nome'> | null,
  ): Promise<UserNotification | null> {
    const existing = await this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.user_id = :userId', { userId: job.userId })
      .andWhere("notification.payload->>'jobId' = :jobId", { jobId: job.id })
      .getOne();

    if (existing) {
      return existing;
    }

    const relatorioNome = relatorio?.nome ?? `Relatório #${job.relatorioId}`;
    const downloadAvailable =
      job.tipo === RelatorioJobTipo.EXPORT_CSV &&
      job.status === RelatorioJobStatus.COMPLETED &&
      Boolean(job.resultPath);

    const { type, title, body } = this.resolveNotificationContent(
      job,
      relatorioNome,
    );

    const notification = this.notificationRepository.create({
      userId: job.userId,
      type,
      title,
      body,
      payload: {
        jobId: job.id,
        relatorioId: Number(job.relatorioId),
        relatorioNome,
        downloadAvailable,
        errorMessage: job.errorMessage,
        jobTipo: job.tipo,
        jobStatus: job.status,
      },
      readAt: null,
    });

    return this.notificationRepository.save(notification);
  }

  async listForUser(
    userId: number,
    query: ListUserNotificationsQueryDto,
  ): Promise<UserNotificationListResult> {
    const page = query.page;
    const pageSize = query.page_size;

    const qb = this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.user_id = :userId', { userId });

    if (query.unread_only) {
      qb.andWhere('notification.read_at IS NULL');
    }

    qb.orderBy('notification.created_at', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [rows, total] = await qb.getManyAndCount();

    return {
      items: rows.map((row) => this.toItem(row)),
      page,
      pageSize,
      total,
    };
  }

  async getUnreadCount(userId: number): Promise<number> {
    return this.notificationRepository.count({
      where: {
        userId,
        readAt: IsNull(),
      },
    });
  }

  async markAsRead(userId: number, notificationId: string): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notificação não encontrada');
    }

    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notificationRepository.save(notification);
    }
  }

  async markAllAsRead(userId: number): Promise<void> {
    await this.notificationRepository
      .createQueryBuilder()
      .update(UserNotification)
      .set({ readAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('read_at IS NULL')
      .execute();
  }

  private resolveNotificationContent(
    job: RelatorioJob,
    relatorioNome: string,
  ): { type: UserNotificationType; title: string; body: string } {
    if (job.tipo === RelatorioJobTipo.EXPORT_CSV) {
      if (job.status === RelatorioJobStatus.COMPLETED) {
        return {
          type: UserNotificationType.EXPORT_READY,
          title: 'Exportação concluída',
          body: `O CSV do relatório "${relatorioNome}" está pronto para download.`,
        };
      }

      return {
        type: UserNotificationType.EXPORT_FAILED,
        title: 'Falha na exportação',
        body:
          job.errorMessage ??
          `Não foi possível exportar o relatório "${relatorioNome}".`,
      };
    }

    if (job.status === RelatorioJobStatus.COMPLETED) {
      return {
        type: UserNotificationType.SNAPSHOT_READY,
        title: 'Snapshot atualizado',
        body: `O snapshot do relatório "${relatorioNome}" foi atualizado.`,
      };
    }

    return {
      type: UserNotificationType.SNAPSHOT_FAILED,
      title: 'Falha no snapshot',
      body:
        job.errorMessage ??
        `Não foi possível atualizar o snapshot do relatório "${relatorioNome}".`,
    };
  }

  private toItem(notification: UserNotification): UserNotificationItem {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      payload: notification.payload ?? {},
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    };
  }
}
