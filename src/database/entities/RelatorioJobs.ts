import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Relatorio } from './Relatorios';

export enum RelatorioJobTipo {
  SNAPSHOT = 'snapshot',
  EXPORT_CSV = 'export_csv',
}

export enum RelatorioJobStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('relatorio_jobs')
@Index('IDX_relatorio_jobs_relatorio_id', ['relatorioId'])
@Index('IDX_relatorio_jobs_user_id', ['userId'])
export class RelatorioJob {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'relatorio_id', type: 'bigint' })
  relatorioId: number;

  @ManyToOne(() => Relatorio, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'relatorio_id' })
  relatorio: Relatorio;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({
    type: 'enum',
    enum: RelatorioJobTipo,
  })
  tipo: RelatorioJobTipo;

  @Column({
    type: 'enum',
    enum: RelatorioJobStatus,
    default: RelatorioJobStatus.QUEUED,
  })
  status: RelatorioJobStatus;

  @Column({ type: 'int', default: 0 })
  progress: number;

  @Column({ name: 'result_path', type: 'text', nullable: true })
  resultPath: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'jsonb', default: {} })
  parametros: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;
}
