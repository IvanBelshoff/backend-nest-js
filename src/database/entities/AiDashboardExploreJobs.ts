import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AiDashboardExploreFase {
  DISCOVERY = 'discovery',
  ANALYSIS = 'analysis',
}

export enum AiDashboardExploreStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export type AiDashboardExploreMapa = {
  abas: string[];
  filtros: Array<{
    nome: string;
    valores?: string[];
    valoresAmostra?: string[];
  }>;
  destaquesCapa: string[];
  geradoEm: string;
};

export type AiDashboardExplorePlano = {
  abas: string[];
  filtros: Array<{ nome: string; valor: string }>;
  perguntaAnalitica: string;
  objetivo?: string;
};

@Entity('ai_dashboard_explore_jobs')
@Index('IDX_ai_dash_explore_user_id', ['userId'])
@Index('IDX_ai_dash_explore_thread_id', ['threadId'])
export class AiDashboardExploreJob {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ name: 'thread_id', type: 'uuid' })
  threadId: string;

  @Column({ name: 'dashboard_id', type: 'bigint' })
  dashboardId: number;

  @Column({
    type: 'enum',
    enum: AiDashboardExploreFase,
  })
  fase: AiDashboardExploreFase;

  @Column({
    type: 'enum',
    enum: AiDashboardExploreStatus,
    default: AiDashboardExploreStatus.QUEUED,
  })
  status: AiDashboardExploreStatus;

  @Column({ type: 'int', default: 0 })
  progress: number;

  @Column({ type: 'jsonb', nullable: true })
  mapa: AiDashboardExploreMapa | null;

  @Column({ type: 'jsonb', nullable: true })
  plano: AiDashboardExplorePlano | null;

  @Column({ type: 'jsonb', nullable: true })
  extract: Record<string, unknown> | null;

  @Column({ name: 'insight_message_id', type: 'uuid', nullable: true })
  insightMessageId: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;
}
