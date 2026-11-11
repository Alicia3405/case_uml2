import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'crypto';
import { getUtcDateKey } from '../../../common/utils/mongoose-entity.util';

export type AuthorEventCategory = 'uml' | 'ai' | 'voice' | 'permission' | 'system';

export interface AstDiffSummary {
  addedClasses?: string[];
  removedClasses?: string[];
  modifiedClasses?: string[];
  addedRelations?: number;
  removedRelations?: number;
}

@Schema({
  collection: 'author_events',
  timestamps: { createdAt: 'createdAt', updatedAt: false },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class AuthorEvent {
  @Prop({ type: String, default: () => randomUUID() })
  _id?: string;

  id: string;

  @Prop({ type: String, required: true, index: true })
  diagramId: string;

  @Prop({ type: String, default: null, index: true })
  roomCode?: string | null;

  @Prop({ type: String, default: null })
  sessionId?: string | null;

  @Prop({ type: Number, default: 1 })
  sessionNumber: number;

  @Prop({ type: String, default: () => getUtcDateKey(), index: true })
  sessionDate: string;

  @Prop({ type: String, default: 'human' })
  actorType: 'human' | 'ai';

  @Prop({ type: String, required: true, index: true })
  userId: string;

  @Prop({ type: String, required: true })
  userName: string;

  @Prop({ type: String, default: 'uml' })
  category: AuthorEventCategory;

  @Prop({ type: String, required: true })
  action: string;

  @Prop({ type: String, default: null })
  detail?: string | null;

  @Prop({ type: [String], default: [] })
  affectedClasses: string[];

  @Prop({ type: Object, default: null })
  diffSummary?: AstDiffSummary | null;

  @Prop({ type: String, default: null })
  color?: string | null;

  @Prop({ type: Date })
  createdAt: Date;
}

export type AuthorEventDocument = HydratedDocument<AuthorEvent>;
export const AuthorEventSchema = SchemaFactory.createForClass(AuthorEvent);

AuthorEventSchema.index({ diagramId: 1, createdAt: -1 });
AuthorEventSchema.index({ diagramId: 1, userId: 1, createdAt: -1 });

