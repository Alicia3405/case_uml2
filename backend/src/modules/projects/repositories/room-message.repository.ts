import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { RoomMessage, RoomMessageDocument } from '../entities/room-message.entity';
import {
  getUtcDateKey,
  toPlainEntities,
  toPlainEntity,
} from '../../../common/utils/mongoose-entity.util';

@Injectable()
export class RoomMessageRepository {
  constructor(
    @InjectModel(RoomMessage.name)
    private readonly messageModel: Model<RoomMessageDocument>,
  ) {}

  async createAndSave(data: Partial<RoomMessage>): Promise<RoomMessage> {
    const id = data._id || data.id || randomUUID();
    const now = data.createdAt || new Date();
    const doc = new this.messageModel({
      ...data,
      _id: id,
      sessionNumber: data.sessionNumber ?? 1,
      sessionDate: data.sessionDate || getUtcDateKey(now),
      senderType: data.senderType || 'human',
      targetNodes: data.targetNodes || [],
      mutatedDiagram: Boolean(data.mutatedDiagram),
      createdAt: now,
    });
    const saved = await doc.save();
    return toPlainEntity<RoomMessage>(saved)!;
  }

  async findRecentByDiagramId(diagramId: string, limit = 120): Promise<RoomMessage[]> {
    const docs = await this.messageModel
      .find({ diagramId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return toPlainEntities<RoomMessage>(docs).reverse();
  }

  async findByDateKey(diagramId: string, sessionDate: string, limit = 200): Promise<RoomMessage[]> {
    const docs = await this.messageModel
      .find({ diagramId, sessionDate })
      .sort({ createdAt: 1 })
      .limit(limit)
      .exec();
    return toPlainEntities<RoomMessage>(docs);
  }

  async countByDiagramId(diagramId: string): Promise<number> {
    return this.messageModel.countDocuments({ diagramId }).exec();
  }

  async deleteByDiagramIds(diagramIds: string[]): Promise<void> {
    if (!diagramIds || diagramIds.length === 0) return;
    await this.messageModel.deleteMany({ diagramId: { $in: diagramIds } }).exec();
  }
}

