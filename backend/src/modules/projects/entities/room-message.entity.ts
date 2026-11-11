import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'crypto';
import { getUtcDateKey } from '../../../common/utils/mongoose-entity.util';

export type RoomSenderType = 'human' | 'ai' | 'system';
export type AiInteractionMode = 'MUTATE' | 'ADVISE' | 'REVIEW' | 'DISCIPLINE' | 'RECAP';

@Schema({
  collection: 'room_messages',
  timestamps: { createdAt: 'createdAt', updatedAt: false },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class RoomMessage {
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
  senderType: RoomSenderType;

  @Prop({ type: String, required: true })
  userId: string;

  @Prop({ type: String, required: true })
  userName: string;

  @Prop({ type: String, default: null })
  color?: string | null;

  @Prop({ type: String, required: true })
  message: string;

  @Prop({ type: String, default: null })
  aiMode?: AiInteractionMode | null;

  @Prop({ type: String, default: null })
  requestedByUserId?: string | null;

  @Prop({ type: String, default: null })
  requestedByUserName?: string | null;

  @Prop({ type: [String], default: [] })
  targetNodes?: string[];

  @Prop({ type: Boolean, default: false })
  mutatedDiagram?: boolean;

  @Prop({ type: String, default: null })
  providerUsed?: string | null;

  @Prop({ type: String, default: null })
  modelUsed?: string | null;

  @Prop({ type: Date })
  createdAt: Date;
}

export type RoomMessageDocument = HydratedDocument<RoomMessage>;
export const RoomMessageSchema = SchemaFactory.createForClass(RoomMessage);

RoomMessageSchema.index({ diagramId: 1, createdAt: -1 });
RoomMessageSchema.index({ roomCode: 1, createdAt: -1 });

