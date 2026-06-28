import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToMany,
  UpdateDateColumn,
} from 'typeorm';
import { Usuario } from './Usuarios';

export enum Privacidade {
  PRIVAT = 'privado',
  PUBLIC = 'publico',
}

@Entity('dashboards')
export class Dashboard {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'text', nullable: false, unique: true })
  nome: string;

  @Column({ type: 'text', nullable: false, default: 'insert_chart' })
  icone?: string;

  @Column({ type: 'text', nullable: true })
  query?: string;

  @Column({ type: 'text', nullable: false, unique: true })
  url: string;

  @Column({ nullable: false, type: 'boolean', default: false })
  temporario: boolean;

  @Column({ nullable: true, type: 'date' })
  data_expiracao_inicial?: Date | null;

  @Column({ nullable: true, type: 'date' })
  data_expiracao_final?: Date | null;

  @Column({ type: 'integer', nullable: true })
  id_proprietario?: number | null;

  @Column({
    nullable: false,
    type: 'enum',
    enum: Privacidade,
    default: Privacidade.PRIVAT,
  })
  privacidade?: Privacidade;

  @Column({ nullable: false, type: 'boolean', default: false })
  visivel?: boolean;

  @Column({ type: 'text', nullable: true })
  usuario_cadastrador?: string;

  @Column({ type: 'text', nullable: true })
  usuario_atualizador?: string;

  @CreateDateColumn({ nullable: false, type: 'timestamp' })
  data_criacao: Date;

  @UpdateDateColumn({ nullable: false, type: 'timestamp' })
  data_atualizacao: Date;

  @ManyToMany(() => Usuario, (usuario) => usuario.dashboard)
  usuario: Usuario[];
}
