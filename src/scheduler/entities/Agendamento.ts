import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AgendamentoFrequencia } from './scheduler.enums';
import { AgendamentoVinculo } from './AgendamentoVinculo';

@Entity('agendamentos')
export class Agendamento {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'text', nullable: false })
  nome: string;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @Column({ type: 'int', default: 1 })
  intervalo: number;

  @Column({
    type: 'enum',
    enum: AgendamentoFrequencia,
  })
  frequencia: AgendamentoFrequencia;

  @Column({ type: 'text', default: 'America/Sao_Paulo' })
  timezone: string;

  @Column({ name: 'hora_inicio', type: 'timestamptz', nullable: true })
  horaInicio: Date | null;

  @Column({ name: 'dias_semana', type: 'smallint', array: true, default: [] })
  diasSemana: number[];

  @Column({ type: 'smallint', array: true, default: [] })
  horas: number[];

  @Column({ type: 'smallint', array: true, default: [0] })
  minutos: number[];

  @Column({ name: 'cron_expression', type: 'text' })
  cronExpression: string;

  @Column({ name: 'proxima_execucao', type: 'timestamptz', nullable: true })
  proximaExecucao: Date | null;

  @Column({ name: 'ultima_execucao', type: 'timestamptz', nullable: true })
  ultimaExecucao: Date | null;

  @Column({ name: 'usuario_cadastrador', type: 'text', nullable: true })
  usuarioCadastrador: string | null;

  @Column({ name: 'usuario_atualizador', type: 'text', nullable: true })
  usuarioAtualizador: string | null;

  @CreateDateColumn({ name: 'data_criacao', type: 'timestamptz' })
  dataCriacao: Date;

  @UpdateDateColumn({ name: 'data_atualizacao', type: 'timestamptz' })
  dataAtualizacao: Date;

  @OneToMany(() => AgendamentoVinculo, (vinculo) => vinculo.agendamento)
  vinculos: AgendamentoVinculo[];
}
