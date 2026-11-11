import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import type { Project } from '../../projects/entities/project.entity';
import type { UmlNode } from './uml-node.entity';
import type { UmlConnection } from './uml-connection.entity';
import type { CollaborationSession } from '../../projects/entities/collaboration-session.entity';

@Entity('diagrams')
export class Diagram {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ type: 'varchar', length: 150, default: 'UML Class Diagram' })
  name: string;

  @Column({ type: 'varchar', length: 20, default: '1.0.0' })
  version: string;

  @Column({ name: 'default_line_style', type: 'varchar', length: 30, default: 'segment' })
  defaultLineStyle: string;

  @Column({ name: 'yjs_binary_state', type: 'bytea', nullable: true })
  yjsBinaryState: Buffer | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @ManyToOne('Project', (project: Project) => project.diagrams, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'project_id' })
  project: Project | null;

  @OneToMany('UmlNode', (node: UmlNode) => node.diagram, { cascade: true })
  nodes: UmlNode[];

  @OneToMany('UmlConnection', (conn: UmlConnection) => conn.diagram, { cascade: true })
  connections: UmlConnection[];

  @OneToMany('CollaborationSession', (sess: CollaborationSession) => sess.diagram, { cascade: true })
  collaborationSessions: CollaborationSession[];
}
