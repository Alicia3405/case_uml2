import { Prop, Schema } from '@nestjs/mongoose';

@Schema({ _id: false })
export class UmlMethod {
  id?: string;
  nodeId?: string;

  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({ type: String, default: '' })
  parameters: string;

  @Prop({ type: String, default: 'void', trim: true })
  returnType: string;

  @Prop({ type: String, default: '+' })
  visibility: string;

  @Prop({ type: Number, default: 0 })
  orderIndex: number;

  node?: any;
}
