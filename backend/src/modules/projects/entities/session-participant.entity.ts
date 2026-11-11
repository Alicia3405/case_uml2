import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'crypto';
import type { CollaborationSession } from './collaboration-session.entity';
import type { User } from '../../auth/entities/user.entity';

@Schema({
  collection: 'session_participants',
  timestamps: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class SessionParticipant {
  @Prop({ type: String, default: () => randomUUID() })
  _id?: string;

  id: string;

  @Prop({ type: String, required: true, index: true })
  sessionId: string;

  @Prop({ type: String, required: true, index: true })
  userId: string;

  @Prop({ type: String, default: '#007ACC', maxlength: 20 })
  cursorColor: string;

  @Prop({ type: Boolean, default: true })
  isConnected: boolean;

  @Prop({ type: Date, default: () => new Date() })
  lastSeenAt: Date;

  // Relaciones pobladas en memoria
  session?: CollaborationSession;
  user?: User;
}

export type SessionParticipantDocument = HydratedDocument<SessionParticipant>;
export const SessionParticipantSchema =
  SchemaFactory.createForClass(SessionParticipant);

SessionParticipantSchema.index({ sessionId: 1, userId: 1 }, { unique: true });
