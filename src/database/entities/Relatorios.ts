import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Usuario } from './Usuarios';
import { Conexao } from './Conexoes';
import { Privacidade } from './privacidade.enum';
import { UsuarioRelatorio } from './UsuarioRelatorio';

export enum EstadoRelatorio {
  ONLINE = 'online',
  OFFLINE = 'offline',
  GERANDO_SNAPSHOT = 'gerando_snapshot',
}

export interface ParametroRelatorio {
  nome: string;
  tipo: 'string' | 'number' | 'date' | 'boolean' | 'enum';
  obrigatorio?: boolean;
  padrao?: string | number | boolean | null;
  label?: string;
  valores?: string[];
}

@Entity('relatorios')
export class Relatorio {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'text', nullable: false, unique: true })
  nome: string;

  @Column({ type: 'text', nullable: false, default: 'table_chart' })
  icone?: string;

  @Column({ type: 'text', nullable: false })
  query: string;

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

  @Column({
    nullable: false,
    type: 'enum',
    enum: EstadoRelatorio,
    default: EstadoRelatorio.ONLINE,
  })
  estado: EstadoRelatorio;

  @Column({ type: 'jsonb', nullable: true })
  parametros?: ParametroRelatorio[] | null;

  @Column({ type: 'bigint', nullable: false })
  id_conexao: number;

  @ManyToOne(() => Conexao, (conexao) => conexao.relatorio, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'id_conexao' })
  conexao: Conexao;

  @Column({ nullable: true, type: 'timestamp' })
  snapshot_atualizado_em?: Date | null;

  @Column({ nullable: false, type: 'boolean', default: true })
  snapshot_valido: boolean;

  @Column({ type: 'text', nullable: true })
  erro_ultima_geracao?: string | null;

  @Column({ type: 'integer', nullable: false })
  limite_linhas: number;

  @Column({ type: 'integer', nullable: false })
  timeout_ms: number;

  @Column({ type: 'text', nullable: true })
  usuario_cadastrador?: string;

  @Column({ type: 'text', nullable: true })
  usuario_atualizador?: string;

  @CreateDateColumn({ nullable: false, type: 'timestamp' })
  data_criacao: Date;

  @UpdateDateColumn({ nullable: false, type: 'timestamp' })
  data_atualizacao: Date;

  @OneToMany(() => UsuarioRelatorio, (usuarioRelatorio) => usuarioRelatorio.relatorio)
  usuarioRelatorios: UsuarioRelatorio[];
}
