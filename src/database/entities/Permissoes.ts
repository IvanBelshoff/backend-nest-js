import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  JoinColumn,
  ManyToOne,
  ManyToMany,
  UpdateDateColumn,
} from 'typeorm';
import { Regra } from './Regras';
import { Usuario } from './Usuarios';

@Entity('permissoes')
export class Permissao {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', nullable: false })
  nome: string;

  @Column({ type: 'varchar', nullable: false })
  descricao?: string;

  @CreateDateColumn({ nullable: false, type: 'date' })
  data_criacao: Date;

  @UpdateDateColumn({
    nullable: false,
    type: 'date',
    default: () => 'CURRENT_TIMESTAMP(6)',
    onUpdate: 'CURRENT_TIMESTAMP(6)',
  })
  data_atualizacao: Date;

  @ManyToOne(() => Regra, (regra) => regra.permissao, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'regra_id' })
  regra: Regra;

  @ManyToMany(() => Usuario, (usuario) => usuario.permissao)
  usuario: Usuario[];
}
