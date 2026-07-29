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
import { ReportJobService } from 'src/report/jobs/report-job.service';
import type { ListUserNotificationsQueryDto } from './dto/list-user-notifications-query.dto';
import type { UserNotificationPayloadDto } from './dto/user-notification-payload.dto';
import {
  buildAiAnalysisNotificationContent,
  buildAiAnalysisNotificationPayload,
  buildNotificationContent,
  buildNotificationPayload,
} from './user-notification-content';

export type UserNotificationItem = {
  id: string;
  type: UserNotificationType;
  title: string;
  body: string;
  payload: UserNotificationPayloadDto;
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
    private readonly reportJobService: ReportJobService,
  ) {}

  async createFromJob(
    job: RelatorioJob,
    relatorio: Pick<Relatorio, 'id' | 'nome'> | null,
  ): Promise<UserNotification | null> {
    const existing = await this.findByJobId(job.userId, job.id);

    if (existing) {
      return existing;
    }

    const relatorioNome = relatorio?.nome ?? `Relatório #${job.relatorioId}`;
    const downloadAvailable =
      job.tipo === RelatorioJobTipo.EXPORT_CSV &&
      job.status === RelatorioJobStatus.COMPLETED &&
      Boolean(job.resultPath);
    const origem = await this.reportJobService.resolveJobOrigem(job.id);

    const { type, title, body } = buildNotificationContent(job, relatorioNome);

    const notification = this.notificationRepository.create({
      userId: job.userId,
      type,
      title,
      body,
      payload: buildNotificationPayload(
        job,
        relatorioNome,
        downloadAvailable,
        origem,
      ),
      readAt: null,
    });

    return this.notificationRepository.save(notification);
  }

  /** Notifica o fim de uma análise em fila do assistente, com deep-link ao thread. */
  async createFromAiAnalysis(params: {
    userId: number;
    threadId: string;
    jobId: string;
    pergunta: string;
    errorMessage?: string | null;
  }): Promise<UserNotification> {
    const existing = await this.findByJobId(params.userId, params.jobId);

    if (existing) {
      return existing;
    }

    const { type, title, body } = buildAiAnalysisNotificationContent(params);

    const notification = this.notificationRepository.create({
      userId: params.userId,
      type,
      title,
      body,
      payload: buildAiAnalysisNotificationPayload(params),
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

  private findByJobId(
    userId: number,
    jobId: string,
  ): Promise<UserNotification | null> {
    return this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.user_id = :userId', { userId })
      .andWhere("notification.payload->>'jobId' = :jobId", { jobId })
      .getOne();
  }

  private toItem(notification: UserNotification): UserNotificationItem {
    const payload = notification.payload ?? {};

    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      // Notificações criadas antes do campo `kind` são todas de job de relatório.
      payload: {
        kind: 'report_job',
        ...payload,
      } as UserNotificationPayloadDto,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    };
  }
}
