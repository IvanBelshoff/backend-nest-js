import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Relatorio } from './Relatorios';

export enum TipoConexao {
  POSTGRES = 'postgres',
  MYSQL = 'mysql',
  MSSQL = 'mssql',
  ORACLE = 'oracle',
}

@Entity('conexoes')
export class Conexao {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'text', nullable: false, unique: true })
  nome: string;

  @Column({
    nullable: false,
    type: 'enum',
    enum: TipoConexao,
  })
  tipo: TipoConexao;

  @Column({ type: 'text', nullable: false })
  host: string;

  @Column({ type: 'integer', nullable: false })
  porta: number;

  @Column({ type: 'text', nullable: false })
  database: string;

  @Column({ type: 'text', nullable: false })
  usuario: string;

  @Column({ type: 'text', nullable: false, select: false })
  senha_criptografada: string;

  @Column({ type: 'jsonb', nullable: true })
  opcoes?: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  usuario_cadastrador?: string;

  @Column({ type: 'text', nullable: true })
  usuario_atualizador?: string;

  @CreateDateColumn({ nullable: false, type: 'timestamptz' })
  data_criacao: Date;

  @UpdateDateColumn({ nullable: false, type: 'timestamptz' })
  data_atualizacao: Date;

  @OneToMany(() => Relatorio, (relatorio) => relatorio.conexao)
  relatorio: Relatorio[];
}
