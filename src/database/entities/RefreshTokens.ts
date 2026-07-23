import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Usuario } from './Usuarios';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'bigint', nullable: false })
  usuario_id: number;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @Column({ type: 'text', nullable: false, unique: true })
  token_hash: string;

  @Column({ nullable: false, type: 'timestamptz' })
  expira_em: Date;

  @Column({ nullable: true, type: 'timestamptz' })
  revogado_em?: Date | null;

  @Column({ nullable: true, type: 'text' })
  novo_token?: string | null;

  @CreateDateColumn({ nullable: false, type: 'timestamptz' })
  data_criacao: Date;

  @UpdateDateColumn({ nullable: false, type: 'timestamptz' })
  data_atualizacao: Date;
}
