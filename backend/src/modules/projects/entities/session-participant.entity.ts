import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import type { CollaborationSession } from './collaboration-session.entity';
import type { User } from '../../auth/entities/user.entity';

@Entity('session_participants')
@Unique(['sessionId', 'userId'])
export class SessionParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'cursor_color', type: 'varchar', length: 20, default: '#007ACC' })
  cursorColor: string;

  @Column({ name: 'is_connected', type: 'boolean', default: true })
  isConnected: boolean;

  @CreateDateColumn({ name: 'last_seen_at', type: 'timestamp' })
  lastSeenAt: Date;

  @ManyToOne('CollaborationSession', (s: CollaborationSession) => s.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: CollaborationSession;

  @ManyToOne('User', (u: User) => u.sessionParticipations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
