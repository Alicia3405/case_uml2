import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'crypto';

export type NotificationSeverity = 'info' | 'warning' | 'discipline' | 'mention';

@Schema({
  collection: 'notifications',
  timestamps: { createdAt: 'createdAt', updatedAt: false },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class NotificationRecord {
  @Prop({ type: String, default: () => randomUUID() })
  _id?: string;

  id: string;

  @Prop({ type: String, default: null, index: true })
  projectId?: string | null;

  @Prop({ type: String, required: true, index: true })
  diagramId: string;

  @Prop({ type: String, default: null })
  roomCode?: string | null;

  @Prop({ type: String, default: 'ROOM', index: true })
  recipientUserId: string;

  @Prop({ type: String, default: 'info' })
  severity: NotificationSeverity;

  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, required: true })
  body: string;

  @Prop({ type: String, default: null })
  actorUserId?: string | null;

  @Prop({ type: String, required: true })
  actorName: string;

  @Prop({ type: [String], default: [] })
  targetNodeIds: string[];

  @Prop({ type: [String], default: [] })
  readByUserIds: string[];

  @Prop({ type: Date })
  createdAt: Date;
}

export type NotificationRecordDocument = HydratedDocument<NotificationRecord>;
export const NotificationRecordSchema =
  SchemaFactory.createForClass(NotificationRecord);

NotificationRecordSchema.index({ diagramId: 1, createdAt: -1 });
NotificationRecordSchema.index({ recipientUserId: 1, createdAt: -1 });

