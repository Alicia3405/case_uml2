import { Prop, Schema } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';

export type AiAnnotationSeverity = 'idea' | 'warning' | 'discipline' | 'resolved';
export type AiAnnotationStatus = 'open' | 'applied' | 'dismissed';

@Schema({ _id: false })
export class AiAnnotationItem {
  @Prop({ type: String, default: () => `ai_note_${randomUUID().slice(0, 8)}` })
  id: string;

  @Prop({ type: String, default: null })
  targetNodeId?: string | null;

  @Prop({ type: String, default: null })
  targetClassName?: string | null;

  @Prop({ type: String, default: 'idea' })
  severity: AiAnnotationSeverity;

  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, required: true })
  message: string;

  @Prop({ type: String, default: 'Copilot IA' })
  authorName: string;

  @Prop({ type: String, default: null })
  requestedByUserName?: string | null;

  @Prop({ type: Object, default: null })
  suggestedAction?: Record<string, any> | null;

  @Prop({ type: String, default: 'open' })
  status: AiAnnotationStatus;

  @Prop({ type: Date, default: () => new Date() })
  createdAt: Date;

  @Prop({ type: Date, default: null })
  resolvedAt?: Date | null;

  @Prop({ type: String, default: null })
  resolvedByUserName?: string | null;
}

