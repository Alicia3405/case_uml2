import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import type { Diagram } from '../../diagrams/entities/diagram.entity';
import type { SessionParticipant } from './session-participant.entity';

@Entity('collaboration_sessions')
export class CollaborationSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'diagram_id', type: 'uuid' })
  diagramId: string;

  @Column({ name: 'room_code', type: 'varchar', length: 50, unique: true })
  roomCode: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'started_at', type: 'timestamp' })
  startedAt: Date;

  @ManyToOne('Diagram', (diagram: Diagram) => diagram.collaborationSessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'diagram_id' })
  diagram: Diagram;

  @OneToMany('SessionParticipant', (p: SessionParticipant) => p.session, { cascade: true })
  participants: SessionParticipant[];
}
