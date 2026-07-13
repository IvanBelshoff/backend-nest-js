import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AgendamentoVinculo } from './AgendamentoVinculo';
import { AgendamentoExecucaoStatus } from './scheduler.enums';

@Entity('agendamento_execucoes')
@Index('IDX_agendamento_execucoes_vinculo_id', ['vinculoId'])
export class AgendamentoExecucao {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'vinculo_id', type: 'bigint' })
  vinculoId: number;

  @ManyToOne(() => AgendamentoVinculo, (vinculo) => vinculo.execucoes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'vinculo_id' })
  vinculo: AgendamentoVinculo;

  @Column({
    type: 'enum',
    enum: AgendamentoExecucaoStatus,
  })
  status: AgendamentoExecucaoStatus;

  @Column({ name: 'job_id', type: 'uuid', nullable: true })
  jobId: string | null;

  @Column({ type: 'text', nullable: true })
  erro: string | null;

  @CreateDateColumn({ name: 'iniciado_em', type: 'timestamp' })
  iniciadoEm: Date;

  @Column({ name: 'concluido_em', type: 'timestamp', nullable: true })
  concluidoEm: Date | null;
}
