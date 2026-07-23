import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Agendamento } from './Agendamento';
import { AgendamentoVinculoTipo } from './scheduler.enums';
import { AgendamentoExecucao } from './AgendamentoExecucao';

@Entity('agendamento_vinculos')
@Index('IDX_agendamento_vinculos_agendamento_id', ['agendamentoId'])
@Index('IDX_agendamento_vinculos_entidade', ['entidadeTipo', 'entidadeId'])
export class AgendamentoVinculo {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'agendamento_id', type: 'bigint' })
  agendamentoId: number;

  @ManyToOne(() => Agendamento, (agendamento) => agendamento.vinculos, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'agendamento_id' })
  agendamento: Agendamento;

  @Column({
    type: 'enum',
    enum: AgendamentoVinculoTipo,
  })
  tipo: AgendamentoVinculoTipo;

  @Column({ name: 'entidade_tipo', type: 'text' })
  entidadeTipo: string;

  @Column({ name: 'entidade_id', type: 'bigint' })
  entidadeId: number;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @Column({ name: 'pgboss_schedule_key', type: 'text', unique: true })
  pgbossScheduleKey: string;

  @CreateDateColumn({ name: 'data_criacao', type: 'timestamptz' })
  dataCriacao: Date;

  @UpdateDateColumn({ name: 'data_atualizacao', type: 'timestamptz' })
  dataAtualizacao: Date;

  @OneToMany(() => AgendamentoExecucao, (execucao) => execucao.vinculo)
  execucoes: AgendamentoExecucao[];
}
