import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { Diagram, DiagramDocument } from '../entities/diagram.entity';
import {
  pickDefined,
  resolveDocId,
  toPlainEntities,
  toPlainEntity,
} from '../../../common/utils/mongoose-entity.util';

@Injectable()
export class DiagramRepository {
  constructor(
    @InjectModel(Diagram.name)
    private readonly diagramModel: Model<DiagramDocument>,
  ) {}

  create(data: Partial<Diagram>): Diagram {
    const id = data._id || data.id || randomUUID();
    return {
      id,
      _id: id,
      projectId: data.projectId ?? null,
      name: data.name || 'UML Class Diagram',
      version: data.version || '1.0.0',
      defaultLineStyle: data.defaultLineStyle || 'segment',
      nodes: data.nodes || [],
      connections: data.connections || [],
      aiAnnotations: data.aiAnnotations || [],
      lastModifiedByUserId: data.lastModifiedByUserId ?? null,
      lastModifiedByName: data.lastModifiedByName ?? null,
      lastModifiedAt: data.lastModifiedAt ?? null,
      revisionCount: data.revisionCount ?? 0,
      createdAt: data.createdAt || new Date(),
      updatedAt: data.updatedAt || new Date(),
    };
  }

  async save(diagram: Partial<Diagram>): Promise<Diagram> {
    const id = resolveDocId(diagram);
    const payload = pickDefined(diagram, ['id', '_id', 'project', 'collaborationSessions', 'yjsBinaryState']);
    const updated = await this.diagramModel
      .findOneAndUpdate(
        { _id: id },
        {
          $set: {
            ...payload,
            _id: id,
            updatedAt: diagram.updatedAt || new Date(),
          },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      )
      .exec();
    return toPlainEntity<Diagram>(updated)!;
  }

  async findAllByProjectId(projectId: string): Promise<Diagram[]> {
    const docs = await this.diagramModel
      .find({ projectId })
      .sort({ updatedAt: -1 })
      .exec();
    return toPlainEntities<Diagram>(docs);
  }

  async findIdsByProjectId(projectId: string): Promise<string[]> {
    const docs = await this.diagramModel
      .find({ projectId })
      .select({ _id: 1 })
      .exec();
    return docs.map((d) => String(d._id));
  }

  async findById(id: string): Promise<Diagram | null> {
    if (!id) return null;
    const doc = await this.diagramModel.findById(id).exec();
    return toPlainEntity<Diagram>(doc);
  }

  async update(id: string, data: Partial<Diagram>): Promise<void> {
    const clean = pickDefined(data, ['id', '_id', 'project', 'collaborationSessions', 'yjsBinaryState']);
    if (Object.keys(clean).length === 0) return;
    await this.diagramModel
      .updateOne(
        { _id: id },
        {
          $set: {
            ...clean,
            updatedAt: clean.updatedAt || new Date(),
          },
        },
      )
      .exec();
  }

  async saveAstAtomic(
    id: string,
    payload: {
      defaultLineStyle?: string;
      nodes: any[];
      connections: any[];
      lastModifiedByUserId?: string | null;
      lastModifiedByName?: string | null;
      lastModifiedAt?: Date;
    },
  ): Promise<Diagram | null> {
    const setFields: Record<string, any> = {
      nodes: payload.nodes,
      connections: payload.connections,
      updatedAt: new Date(),
    };
    if (payload.defaultLineStyle) {
      setFields.defaultLineStyle = payload.defaultLineStyle;
    }
    if (payload.lastModifiedByUserId !== undefined) {
      setFields.lastModifiedByUserId = payload.lastModifiedByUserId;
    }
    if (payload.lastModifiedByName !== undefined) {
      setFields.lastModifiedByName = payload.lastModifiedByName;
    }
    if (payload.lastModifiedAt !== undefined) {
      setFields.lastModifiedAt = payload.lastModifiedAt;
    }

    const updated = await this.diagramModel
      .findOneAndUpdate(
        { _id: id },
        {
          $set: setFields,
          $inc: { revisionCount: 1 },
        },
        { returnDocument: 'after' },
      )
      .exec();
    return toPlainEntity<Diagram>(updated);
  }

  async updateAiAnnotations(id: string, aiAnnotations: any[]): Promise<Diagram | null> {
    const updated = await this.diagramModel
      .findOneAndUpdate(
        { _id: id },
        {
          $set: {
            aiAnnotations,
            updatedAt: new Date(),
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    return toPlainEntity<Diagram>(updated);
  }

  async delete(id: string): Promise<void> {
    await this.diagramModel.deleteOne({ _id: id }).exec();
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    await this.diagramModel.deleteMany({ projectId }).exec();
  }
}
