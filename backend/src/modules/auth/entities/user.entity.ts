import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { randomUUID } from 'crypto';
import type { Project } from '../../projects/entities/project.entity';
import type { ProjectMember } from '../../projects/entities/project-member.entity';
import type { SessionParticipant } from '../../projects/entities/session-participant.entity';

@Schema({
  collection: 'users',
  timestamps: { createdAt: 'createdAt', updatedAt: false },
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class User {
  @Prop({ type: String, default: () => randomUUID() })
  _id?: string;

  id: string;

  @Prop({ type: String, required: true, trim: true, maxlength: 100 })
  fullName: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 150,
  })
  email: string;

  @Prop({ type: String, required: true, select: false })
  passwordHash: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Date })
  createdAt: Date;

  // Propiedades virtuales / de compatibilidad en TypeScript
  projectsCreated?: Project[];
  projectMemberships?: ProjectMember[];
  sessionParticipations?: SessionParticipant[];
  diagramVersions?: any[];
  aiLogs?: any[];
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
