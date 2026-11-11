import { Prop, Schema } from '@nestjs/mongoose';

@Schema({ _id: false })
export class UmlConnection {
  @Prop({ type: String, required: true })
  id: string;

  @Prop({ type: String })
  diagramId?: string;

  @Prop({ type: String, required: true })
  sourceNodeId: string;

  @Prop({ type: String, required: true })
  targetNodeId: string;

  @Prop({ type: String, required: true })
  sourceId: string;

  @Prop({ type: String, required: true })
  targetId: string;

  @Prop({ type: String, required: true })
  type: string;

  @Prop({ type: String, default: 'segment' })
  lineStyle: string;

  @Prop({ type: String, default: null })
  name: string | null;

  @Prop({ type: String, default: '1' })
  sourceMultiplicity: string;

  @Prop({ type: String, default: '0..*' })
  targetMultiplicity: string;

  @Prop({ type: String, default: null })
  assocAnchorNodeId: string | null;

  // Autoría colaborativa
  @Prop({ type: String, default: null })
  createdByUserId?: string | null;

  @Prop({ type: String, default: null })
  createdByName?: string | null;

  @Prop({ type: String, default: null })
  lastModifiedByUserId?: string | null;

  @Prop({ type: String, default: null })
  lastModifiedByName?: string | null;

  @Prop({ type: Date, default: null })
  lastModifiedAt?: Date | null;

  // Compatibilidad TypeScript
  diagram?: any;
  sourceNode?: any;
  targetNode?: any;
}
