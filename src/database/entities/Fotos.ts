import {
  Column,
  CreateDateColumn,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Usuario } from './Usuarios';

@Entity('fotos')
export class Foto {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', nullable: false })
  nome: string;

  @Column({ type: 'text', nullable: false })
  originalname: string;

  @Column({ type: 'text', nullable: false })
  tipo: string;

  @Column({ type: 'integer', nullable: false })
  tamanho: number;

  @Column({ type: 'text', nullable: false })
  local: string;

  @Column({ type: 'text', nullable: false })
  url: string;

  @CreateDateColumn({ nullable: false, type: 'date' })
  data_criacao: Date;

  @UpdateDateColumn({
    nullable: false,
    type: 'date',
    default: () => 'CURRENT_TIMESTAMP(6)',
    onUpdate: 'CURRENT_TIMESTAMP(6)',
  })
  data_atualizacao: Date;

  @OneToOne(() => Usuario, (usuario) => usuario.foto)
  usuario: Usuario | null;
}
