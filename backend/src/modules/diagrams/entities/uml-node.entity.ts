import { Prop, Schema } from '@nestjs/mongoose';
import { UmlAttribute } from './uml-attribute.entity';
import { UmlMethod } from './uml-method.entity';

@Schema({ _id: false })
export class UmlNode {
  @Prop({ type: String, required: true })
  id: string;

  @Prop({ type: String })
  diagramId?: string;

  @Prop({ type: String, default: 'ClassName' })
  name: string;

  @Prop({ type: String, default: 'CLASS' })
  elementType: string;

  @Prop({ type: String, default: null })
  stereotype: string | null;

  @Prop({ type: String, default: null })
  noteContent: string | null;

  @Prop({ type: Number, default: 0 })
  positionX: number;

  @Prop({ type: Number, default: 0 })
  positionY: number;

  @Prop({ type: Number, default: 220 })
  width: number;

  @Prop({ type: Number, default: null })
  height: number | null;

  @Prop({ type: Boolean, default: false })
  isAnchor: boolean;

  @Prop({ type: String, default: null })
  assocMainConnId: string | null;

  @Prop({ type: [UmlAttribute], default: [] })
  attributes: UmlAttribute[];

  @Prop({ type: [UmlMethod], default: [] })
  methods: UmlMethod[];

  // Metadatos de autoría colaborativa por nodo (Segundo Parcial)
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

  // Propiedades de compatibilidad en TypeScript
  diagram?: any;
  outgoingConnections?: any[];
  incomingConnections?: any[];
}
