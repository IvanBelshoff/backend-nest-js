import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToMany,
  ManyToMany,
  UpdateDateColumn,
} from 'typeorm';
import { Permissao } from './Permissoes';
import { Usuario } from './Usuarios';

@Entity('regras')
export class Regra {
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

  @OneToMany(() => Permissao, (permissao) => permissao.regra, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  permissao: Permissao[];

  @ManyToMany(() => Usuario, (usuario) => usuario.regra)
  usuario: Usuario[];
}
