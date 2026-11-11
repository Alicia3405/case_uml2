import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { ProjectMember, ProjectMemberDocument } from '../entities/project-member.entity';
import { ProjectRole } from '../entities/project-role.enum';
import { UserRepository } from '../../auth/repositories/user.repository';
import {
  pickDefined,
  resolveDocId,
  toPlainEntities,
  toPlainEntity,
} from '../../../common/utils/mongoose-entity.util';

@Injectable()
export class ProjectMemberRepository {
  constructor(
    @InjectModel(ProjectMember.name)
    private readonly memberModel: Model<ProjectMemberDocument>,
    private readonly userRepository: UserRepository,
  ) { }

  create(data: Partial<ProjectMember>): ProjectMember {
    const id = data._id || data.id || randomUUID();
    return {
      id,
      _id: id,
      projectId: data.projectId!,
      userId: data.userId!,
      role: data.role || ProjectRole.EDITOR,
      canDownloadCode: data.canDownloadCode ?? true,
      joinedAt: data.joinedAt || new Date(),
      user: data.user,
      project: data.project,
    };
  }

  async save(member: Partial<ProjectMember>): Promise<ProjectMember> {
    const id = resolveDocId(member);
    const payload = pickDefined(member, ['id', '_id', 'user', 'project']);
    const updated = await this.memberModel
      .findOneAndUpdate(
        { projectId: member.projectId, userId: member.userId },
        {
          $setOnInsert: { _id: id, joinedAt: member.joinedAt || new Date() },
          $set: {
            projectId: payload.projectId,
            userId: payload.userId,
            role: payload.role || ProjectRole.EDITOR,
            canDownloadCode: payload.canDownloadCode ?? true,
          },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      )
      .exec();

    const plain = toPlainEntity<ProjectMember>(updated)!;
    if (member.user) {
      plain.user = member.user;
    } else if (plain.userId) {
      plain.user = (await this.userRepository.findById(plain.userId)) || undefined;
    }
    return plain;
  }

  async findByProjectIdAndUserId(projectId: string, userId: string): Promise<ProjectMember | null> {
    const doc = await this.memberModel.findOne({ projectId, userId }).exec();
    const plain = toPlainEntity<ProjectMember>(doc);
    if (!plain) return null;
    plain.user = (await this.userRepository.findById(plain.userId)) || undefined;
    return plain;
  }

  async findRole(projectId: string, userId: string): Promise<ProjectRole | null> {
    const doc = await this.memberModel
      .findOne({ projectId, userId })
      .select({ role: 1 })
      .exec();
    return doc ? (doc.role as ProjectRole) : null;
  }

  async findMembership(
    projectId: string,
    userId: string,
  ): Promise<{ role: ProjectRole; canDownloadCode: boolean } | null> {
    const doc = await this.memberModel
      .findOne({ projectId, userId })
      .select({ role: 1, canDownloadCode: 1 })
      .exec();
    return doc
      ? { role: doc.role as ProjectRole, canDownloadCode: doc.canDownloadCode ?? true }
      : null;
  }

  async findByProjectId(projectId: string): Promise<ProjectMember[]> {
    const docs = await this.memberModel
      .find({ projectId })
      .sort({ joinedAt: 1 })
      .exec();
    const members = toPlainEntities<ProjectMember>(docs);
    if (members.length === 0) return [];

    const users = await this.userRepository.findByIds(members.map((m) => m.userId));
    const userMap = new Map(users.map((u) => [u.id, u]));
    for (const member of members) {
      member.user = userMap.get(member.userId);
    }
    return members;
  }

  async findProjectIdsForUser(userId: string): Promise<string[]> {
    const docs = await this.memberModel
      .find({ userId })
      .select({ projectId: 1 })
      .exec();
    return Array.from(new Set(docs.map((d) => d.projectId)));
  }

  async updateRole(projectId: string, userId: string, role: ProjectRole): Promise<void> {
    await this.memberModel.updateOne({ projectId, userId }, { $set: { role } }).exec();
  }

  async updateMember(
    projectId: string,
    userId: string,
    data: Partial<Pick<ProjectMember, 'role' | 'canDownloadCode'>>,
  ): Promise<void> {
    const clean = pickDefined(data, ['id', '_id']);
    if (Object.keys(clean).length === 0) return;
    await this.memberModel.updateOne({ projectId, userId }, { $set: clean }).exec();
  }

  async delete(projectId: string, userId: string): Promise<void> {
    await this.memberModel.deleteOne({ projectId, userId }).exec();
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    await this.memberModel.deleteMany({ projectId }).exec();
  }
}
