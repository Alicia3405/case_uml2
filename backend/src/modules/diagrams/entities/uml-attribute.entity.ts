import { Prop, Schema } from '@nestjs/mongoose';

@Schema({ _id: false })
export class UmlAttribute {
  id?: string;
  nodeId?: string;

  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({ type: String, default: 'String', trim: true })
  type: string;

  @Prop({ type: String, default: '-' })
  visibility: string;

  @Prop({ type: Boolean, default: false })
  isPrimaryKey: boolean;

  @Prop({ type: Boolean, default: true })
  isNullable: boolean;

  @Prop({ type: Number, default: 0 })
  orderIndex: number;

  node?: any;
}
