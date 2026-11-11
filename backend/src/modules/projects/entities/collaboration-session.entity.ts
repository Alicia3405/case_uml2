import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'crypto';
import type { Diagram } from '../../diagrams/entities/diagram.entity';
import type { SessionParticipant } from './session-participant.entity';
import { getUtcDateKey } from '../../../common/utils/mongoose-entity.util';

@Schema({
  collection: 'collaboration_sessions',
  timestamps: { createdAt: 'startedAt', updatedAt: 'lastActivityAt' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class CollaborationSession {
  @Prop({ type: String, default: () => randomUUID() })
  _id?: string;

  id: string;

  @Prop({ type: String, required: true, index: true })
  diagramId: string;

  @Prop({ type: String, default: null, index: true })
  projectId?: string | null;

  @Prop({ type: String, required: true, unique: true, maxlength: 50 })
  roomCode: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  // Continuidad multi-sesión / multi-día y traspaso de anfitrión (2do Parcial)
  @Prop({ type: String, default: null })
  hostUserId?: string | null;

  @Prop({ type: String, default: null })
  hostUserName?: string | null;

  @Prop({ type: Number, default: 1 })
  sessionNumber: number;

  @Prop({ type: [String], default: () => [getUtcDateKey()] })
  activeDateKeys: string[];

  @Prop({ type: String, default: () => getUtcDateKey() })
  lastActiveDay: string;

  @Prop({ type: String, default: '' })
  resumeSummary: string;

  @Prop({ type: Date })
  startedAt: Date;

  @Prop({ type: Date })
  lastActivityAt: Date;

  // Relaciones pobladas en memoria
  diagram?: Diagram;
  participants?: SessionParticipant[];
}

export type CollaborationSessionDocument = HydratedDocument<CollaborationSession>;
export const CollaborationSessionSchema =
  SchemaFactory.createForClass(CollaborationSession);

CollaborationSessionSchema.index({ diagramId: 1, isActive: 1 });
