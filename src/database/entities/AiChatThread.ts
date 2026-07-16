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
import { Usuario } from './Usuarios';
import { AiChatMessage } from './AiChatMessage';

@Entity('ai_chat_threads')
@Index('IDX_ai_chat_threads_user_id_updated_at', ['userId', 'updatedAt'])
export class AiChatThread {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  usuario: Usuario;

  @Column({ type: 'text', nullable: true })
  titulo: string | null;

  @OneToMany(() => AiChatMessage, (message) => message.thread)
  messages: AiChatMessage[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
