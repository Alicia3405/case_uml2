import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'crypto';
import { UmlNode } from './uml-node.entity';
import { UmlConnection } from './uml-connection.entity';
import { AiAnnotationItem } from './ai-annotation.entity';
import { getUtcDateKey } from '../../../common/utils/mongoose-entity.util';

@Schema({
  collection: 'diagram_snapshots',
  timestamps: { createdAt: 'createdAt', updatedAt: false },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class DiagramSnapshot {
  @Prop({ type: String, default: () => randomUUID() })
  _id?: string;

  id: string;

  @Prop({ type: String, required: true, index: true })
  diagramId: string;

  @Prop({ type: String, default: null })
  sessionId?: string | null;

  @Prop({ type: Number, default: 1 })
  sessionNumber: number;

  @Prop({ type: String, default: () => getUtcDateKey() })
  sessionDate: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 160 })
  label: string;

  @Prop({ type: String, default: '' })
  summary: string;

  @Prop({ type: String, required: true })
  savedByUserId: string;

  @Prop({ type: String, required: true })
  savedByName: string;

  @Prop({ type: [UmlNode], default: [] })
  nodes: UmlNode[];

  @Prop({ type: [UmlConnection], default: [] })
  connections: UmlConnection[];

  @Prop({ type: [AiAnnotationItem], default: [] })
  aiAnnotations?: AiAnnotationItem[];

  @Prop({ type: Date })
  createdAt: Date;
}

export type DiagramSnapshotDocument = HydratedDocument<DiagramSnapshot>;
export const DiagramSnapshotSchema = SchemaFactory.createForClass(DiagramSnapshot);

DiagramSnapshotSchema.index({ diagramId: 1, createdAt: -1 });

