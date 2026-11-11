import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'crypto';
import type { Project } from './project.entity';
import type { User } from '../../auth/entities/user.entity';
import { ProjectRole } from './project-role.enum';

@Schema({
  collection: 'project_members',
  timestamps: { createdAt: 'joinedAt', updatedAt: false },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class ProjectMember {
  @Prop({ type: String, default: () => randomUUID() })
  _id?: string;

  id: string;

  @Prop({ type: String, required: true, index: true })
  projectId: string;

  @Prop({ type: String, required: true, index: true })
  userId: string;

  @Prop({
    type: String,
    enum: Object.values(ProjectRole),
    default: ProjectRole.EDITOR,
  })
  role: ProjectRole;

  @Prop({ type: Boolean, default: true })
  canDownloadCode: boolean;

  @Prop({ type: Date })
  joinedAt: Date;

  // Relaciones pobladas en memoria
  project?: Project;
  user?: User;
}

export type ProjectMemberDocument = HydratedDocument<ProjectMember>;
export const ProjectMemberSchema = SchemaFactory.createForClass(ProjectMember);

ProjectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });
