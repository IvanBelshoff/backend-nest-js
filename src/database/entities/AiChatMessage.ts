import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AiChatThread } from './AiChatThread';

export type AiChatMessageRole = 'user' | 'assistant' | 'system';

@Entity('ai_chat_messages')
@Index('IDX_ai_chat_messages_thread_id_created_at', ['threadId', 'createdAt'])
export class AiChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'thread_id', type: 'uuid' })
  threadId: string;

  @ManyToOne(() => AiChatThread, (thread) => thread.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'thread_id' })
  thread: AiChatThread;

  @Column({ type: 'text' })
  role: AiChatMessageRole;

  @Column({ type: 'jsonb', default: [] })
  parts: Record<string, unknown>[];

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
