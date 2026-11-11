import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'crypto';
import type { User } from '../../auth/entities/user.entity';
import type { ProjectMember } from './project-member.entity';
import type { Diagram } from '../../diagrams/entities/diagram.entity';

@Schema({
  collection: 'projects',
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Project {
  @Prop({ type: String, default: () => randomUUID() })
  _id?: string;

  id: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 120 })
  name: string;

  @Prop({ type: String, default: null })
  description: string | null;

  @Prop({ type: String, default: 'com.example.app', maxlength: 150 })
  basePackage: string;

  @Prop({ type: Number, default: 21 })
  javaVersion: number;

  @Prop({ type: String, default: '3.3.0', maxlength: 20 })
  springBootVersion: string;

  @Prop({ type: String, required: true, index: true })
  createdBy: string;

  @Prop({ type: Date })
  createdAt: Date;

  // Relaciones pobladas en memoria por ProjectRepository
  creator?: User;
  members?: ProjectMember[];
  diagrams?: Diagram[];
}

export type ProjectDocument = HydratedDocument<Project>;
export const ProjectSchema = SchemaFactory.createForClass(Project);

ProjectSchema.index({ createdBy: 1, createdAt: -1 });
