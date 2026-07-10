import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Foto } from './Fotos';
import { Permissao } from './Permissoes';
import { Regra } from './Regras';
import { Dashboard } from './Dashboards';
import { Relatorio } from './Relatorios';
import type { UsuarioPreferenciasUi } from 'src/user/types/usuario-preferencias-ui.types';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'text', nullable: false })
  nome: string;

  @Column({ type: 'text', nullable: false })
  sobrenome: string;

  @Column({ type: 'text', nullable: false, unique: true })
  email: string;

  @Column({ default: false })
  bloqueado: boolean;

  @Column()
  senha?: string;

  @Column({ type: 'text', nullable: true })
  usuario_atualizador?: string;

  @Column({ type: 'text', nullable: true })
  usuario_cadastrador?: string;

  @Column({ nullable: true, type: 'timestamp' })
  ultimo_login?: Date;

  @CreateDateColumn({ nullable: false, type: 'timestamp' })
  data_criacao: Date;

  @UpdateDateColumn({ nullable: false, type: 'timestamp' })
  data_atualizacao: Date;

  @Column({ type: 'simple-array', nullable: true })
  dashboards_favoritos: number[];

  @Column({ type: 'simple-array', nullable: true })
  relatorios_favoritos: number[];

  @Column({ type: 'jsonb', nullable: true })
  preferencias_ui: UsuarioPreferenciasUi | null;

  @ManyToMany(() => Permissao, (permissao) => permissao.usuario, {
    cascade: true,
    onDelete: 'CASCADE',
    onUpdate: 'SET NULL',
  })
  @JoinTable({
    name: 'usuarios_permissoes',
    joinColumns: [{ name: 'usuario_id' }],
    inverseJoinColumns: [{ name: 'permissao_id' }],
  })
  permissao: Permissao[];

  @ManyToMany(() => Regra, (regra) => regra.usuario, {
    cascade: true,
    onDelete: 'CASCADE',
    onUpdate: 'SET NULL',
  })
  @JoinTable({
    name: 'usuarios_regras',
    joinColumns: [{ name: 'usuario_id' }],
    inverseJoinColumns: [{ name: 'regra_id' }],
  })
  regra: Regra[];

  @ManyToMany(() => Dashboard, (dashboard) => dashboard.usuario, {
    cascade: true,
    onDelete: 'CASCADE',
    onUpdate: 'SET NULL',
  })
  @JoinTable({
    name: 'usuarios_dashboards',
    joinColumns: [{ name: 'usuario_id' }],
    inverseJoinColumns: [{ name: 'dashboard_id' }],
  })
  dashboard: Dashboard[];

  @ManyToMany(() => Relatorio, (relatorio) => relatorio.usuario, {
    cascade: true,
    onDelete: 'CASCADE',
    onUpdate: 'SET NULL',
  })
  @JoinTable({
    name: 'usuarios_relatorios',
    joinColumns: [{ name: 'usuario_id' }],
    inverseJoinColumns: [{ name: 'relatorio_id' }],
  })
  relatorio: Relatorio[];

  @OneToOne(() => Foto, (foto) => foto.usuario, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'foto_id' })
  foto: Foto;
}
