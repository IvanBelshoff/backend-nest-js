import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { randomUUID } from 'node:crypto';
import { Usuario } from './Usuarios';

export enum UserNotificationType {
  EXPORT_READY = 'export_ready',
  EXPORT_FAILED = 'export_failed',
  SNAPSHOT_READY = 'snapshot_ready',
  SNAPSHOT_FAILED = 'snapshot_failed',
  AI_DASHBOARD_DISCOVERY_READY = 'ai_dashboard_discovery_ready',
  AI_DASHBOARD_EXPLORE_READY = 'ai_dashboard_explore_ready',
  AI_DASHBOARD_EXPLORE_FAILED = 'ai_dashboard_explore_failed',
}

@Entity('user_notifications')
@Index('IDX_user_notifications_user_id_created_at', ['userId', 'createdAt'])
@Index('IDX_user_notifications_user_id_read_at', ['userId', 'readAt'])
export class UserNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  usuario: Usuario;

  @Column({
    type: 'enum',
    enum: UserNotificationType,
  })
  type: UserNotificationType;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, unknown>;

  @Column({ name: 'read_at', type: 'timestamp', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @BeforeInsert()
  ensureId(): void {
    if (!this.id) {
      this.id = randomUUID();
    }
  }
}
