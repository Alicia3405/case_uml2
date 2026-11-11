import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'crypto';
import type { Project } from '../../projects/entities/project.entity';
import type { CollaborationSession } from '../../projects/entities/collaboration-session.entity';
import { UmlNode } from './uml-node.entity';
import { UmlConnection } from './uml-connection.entity';
import { AiAnnotationItem } from './ai-annotation.entity';

@Schema({
  collection: 'diagrams',
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Diagram {
  @Prop({ type: String, default: () => randomUUID() })
  _id?: string;

  id: string;

  @Prop({ type: String, default: null, index: true })
  projectId: string | null;

  @Prop({ type: String, default: 'UML Class Diagram', trim: true, maxlength: 150 })
  name: string;

  @Prop({ type: String, default: '1.0.0', maxlength: 20 })
  version: string;

  @Prop({ type: String, default: 'segment', maxlength: 30 })
  defaultLineStyle: string;

  @Prop({ type: [UmlNode], default: [] })
  nodes: UmlNode[];

  @Prop({ type: [UmlConnection], default: [] })
  connections: UmlConnection[];

  @Prop({ type: [AiAnnotationItem], default: [] })
  aiAnnotations?: AiAnnotationItem[];

  // Trazabilidad continua del último cambio en el diagrama
  @Prop({ type: String, default: null })
  lastModifiedByUserId?: string | null;

  @Prop({ type: String, default: null })
  lastModifiedByName?: string | null;

  @Prop({ type: Date, default: null })
  lastModifiedAt?: Date | null;

  @Prop({ type: Number, default: 0 })
  revisionCount?: number;

  @Prop({ type: Date })
  updatedAt: Date;

  @Prop({ type: Date })
  createdAt: Date;

  // Propiedades virtuales / de compatibilidad en TypeScript
  yjsBinaryState?: Buffer | null;
  project?: Project | null;
  collaborationSessions?: CollaborationSession[];
}

export type DiagramDocument = HydratedDocument<Diagram>;
export const DiagramSchema = SchemaFactory.createForClass(Diagram);

DiagramSchema.index({ projectId: 1, updatedAt: -1 });
