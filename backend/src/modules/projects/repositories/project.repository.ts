import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { Project, ProjectDocument } from '../entities/project.entity';
import { ProjectMemberRepository } from './project-member.repository';
import { UserRepository } from '../../auth/repositories/user.repository';
import { DiagramRepository } from '../../diagrams/repositories/diagram.repository';
import { DiagramSnapshotRepository } from '../../diagrams/repositories/diagram-snapshot.repository';
import { SessionRepository } from './session.repository';
import { RoomMessageRepository } from './room-message.repository';
import { AuthorEventRepository } from './author-event.repository';
import { NotificationRecordRepository } from './notification-record.repository';
import {
  pickDefined,
  resolveDocId,
  toPlainEntities,
  toPlainEntity,
} from '../../../common/utils/mongoose-entity.util';

@Injectable()
export class ProjectRepository {
  constructor(
    @InjectModel(Project.name)
    private readonly projectModel: Model<ProjectDocument>,
    private readonly projectMemberRepository: ProjectMemberRepository,
    private readonly userRepository: UserRepository,
    @Optional()
    @Inject(forwardRef(() => DiagramRepository))
    private readonly diagramRepository?: DiagramRepository,
    @Optional()
    @Inject(forwardRef(() => DiagramSnapshotRepository))
    private readonly snapshotRepository?: DiagramSnapshotRepository,
    @Optional()
    private readonly sessionRepository?: SessionRepository,
    @Optional()
    private readonly roomMessageRepository?: RoomMessageRepository,
    @Optional()
    private readonly authorEventRepository?: AuthorEventRepository,
    @Optional()
    private readonly notificationRepository?: NotificationRecordRepository,
  ) {}

  create(data: Partial<Project>): Project {
    const id = data._id || data.id || randomUUID();
    return {
      id,
      _id: id,
      name: data.name || 'Nuevo Proyecto',
      description: data.description ?? null,
      basePackage: data.basePackage || 'com.example.app',
      javaVersion: data.javaVersion ?? 21,
      springBootVersion: data.springBootVersion || '3.3.0',
      createdBy: data.createdBy!,
      createdAt: data.createdAt || new Date(),
      creator: data.creator,
      members: data.members || [],
      diagrams: data.diagrams || [],
    };
  }

  async save(project: Partial<Project>): Promise<Project> {
    const id = resolveDocId(project);
    const payload = pickDefined(project, ['id', '_id', 'creator', 'members', 'diagrams']);
    const updated = await this.projectModel
      .findOneAndUpdate(
        { _id: id },
        {
          $setOnInsert: { createdAt: project.createdAt || new Date() },
          $set: {
            ...payload,
            _id: id,
          },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      )
      .exec();
    return toPlainEntity<Project>(updated)!;
  }

  async findAllForUser(userId: string): Promise<Project[]> {
    const memberProjectIds = await this.projectMemberRepository.findProjectIdsForUser(userId);
    const queryFilter =
      memberProjectIds.length > 0
        ? { _id: { $in: memberProjectIds } }
        : { _id: { $in: [] as string[] } };

    const docs = await this.projectModel
      .find(queryFilter)
      .sort({ createdAt: -1 })
      .exec();

    const projects = toPlainEntities<Project>(docs);
    return Promise.all(projects.map((p) => this.hydrateProject(p) as Promise<Project>));
  }

  async findById(id: string): Promise<Project | null> {
    if (!id) return null;
    const doc = await this.projectModel.findById(id).exec();
    const project = toPlainEntity<Project>(doc);
    if (!project) return null;
    return this.hydrateProject(project);
  }

  async update(id: string, data: Partial<Project>): Promise<void> {
    const clean = pickDefined(data, ['id', '_id', 'creator', 'members', 'diagrams']);
    if (Object.keys(clean).length === 0) return;
    await this.projectModel.updateOne({ _id: id }, { $set: clean }).exec();
  }

  async delete(id: string): Promise<void> {
    const diagramIds = this.diagramRepository
      ? await this.diagramRepository.findIdsByProjectId(id)
      : [];

    if (diagramIds.length > 0) {
      await this.sessionRepository?.deleteByDiagramIds(diagramIds);
      await this.roomMessageRepository?.deleteByDiagramIds(diagramIds);
      await this.authorEventRepository?.deleteByDiagramIds(diagramIds);
      await this.notificationRepository?.deleteByDiagramIds(diagramIds);
      await this.snapshotRepository?.deleteByDiagramIds(diagramIds);
    }

    await this.diagramRepository?.deleteByProjectId(id);
    await this.projectMemberRepository.deleteByProjectId(id);
    await this.projectModel.deleteOne({ _id: id }).exec();
  }

  private async hydrateProject(project: Project | null): Promise<Project | null> {
    if (!project) return null;
    const [creator, members, diagrams] = await Promise.all([
      project.createdBy ? this.userRepository.findById(project.createdBy) : Promise.resolve(null),
      this.projectMemberRepository.findByProjectId(project.id),
      this.diagramRepository ? this.diagramRepository.findAllByProjectId(project.id) : Promise.resolve([]),
    ]);
    if (creator) {
      project.creator = creator;
    }
    project.members = members;
    project.diagrams = diagrams;
    return project;
  }
}
