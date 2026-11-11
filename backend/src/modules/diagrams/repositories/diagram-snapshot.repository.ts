import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { DiagramSnapshot, DiagramSnapshotDocument } from '../entities/diagram-snapshot.entity';
import { getUtcDateKey, toPlainEntities, toPlainEntity } from '../../../common/utils/mongoose-entity.util';

@Injectable()
export class DiagramSnapshotRepository {
  constructor(
    @InjectModel(DiagramSnapshot.name)
    private readonly snapshotModel: Model<DiagramSnapshotDocument>,
  ) {}

  async createAndSave(data: Partial<DiagramSnapshot>): Promise<DiagramSnapshot> {
    const id = data._id || data.id || randomUUID();
    const doc = new this.snapshotModel({
      ...data,
      _id: id,
      sessionNumber: data.sessionNumber ?? 1,
      sessionDate: data.sessionDate || getUtcDateKey(),
      nodes: data.nodes || [],
      connections: data.connections || [],
      aiAnnotations: data.aiAnnotations || [],
      createdAt: data.createdAt || new Date(),
    });
    const saved = await doc.save();
    return toPlainEntity<DiagramSnapshot>(saved)!;
  }

  async findByDiagramId(diagramId: string, limit = 30): Promise<DiagramSnapshot[]> {
    const docs = await this.snapshotModel
      .find({ diagramId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return toPlainEntities<DiagramSnapshot>(docs);
  }

  async findById(id: string): Promise<DiagramSnapshot | null> {
    if (!id) return null;
    const doc = await this.snapshotModel.findById(id).exec();
    return toPlainEntity<DiagramSnapshot>(doc);
  }

  async deleteByDiagramIds(diagramIds: string[]): Promise<void> {
    if (!diagramIds || diagramIds.length === 0) return;
    await this.snapshotModel.deleteMany({ diagramId: { $in: diagramIds } }).exec();
  }
}

