import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { NotificationRecord, NotificationRecordDocument } from '../entities/notification-record.entity';
import { toPlainEntities, toPlainEntity } from '../../../common/utils/mongoose-entity.util';

@Injectable()
export class NotificationRecordRepository {
  constructor(
    @InjectModel(NotificationRecord.name)
    private readonly notificationModel: Model<NotificationRecordDocument>,
  ) {}

  async createAndSave(data: Partial<NotificationRecord>): Promise<NotificationRecord> {
    const id = data._id || data.id || randomUUID();
    const doc = new this.notificationModel({
      ...data,
      _id: id,
      recipientUserId: data.recipientUserId || 'ROOM',
      severity: data.severity || 'info',
      targetNodeIds: data.targetNodeIds || [],
      readByUserIds: data.readByUserIds || [],
      createdAt: data.createdAt || new Date(),
    });
    const saved = await doc.save();
    return toPlainEntity<NotificationRecord>(saved)!;
  }

  async findForUserAndDiagrams(params: {
    diagramIds: string[];
    userId: string;
    unreadOnly?: boolean;
    limit?: number;
  }): Promise<NotificationRecord[]> {
    const { diagramIds, userId, unreadOnly = false, limit = 50 } = params;
    const filter: Record<string, any> = {
      $or: [
        { recipientUserId: userId },
        ...(diagramIds.length > 0
          ? [{ recipientUserId: 'ROOM', diagramId: { $in: diagramIds } }]
          : []),
      ],
    };
    if (unreadOnly) {
      filter.readByUserIds = { $ne: userId };
    }

    const docs = await this.notificationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return toPlainEntities<NotificationRecord>(docs);
  }

  async findByDiagramId(diagramId: string, limit = 50): Promise<NotificationRecord[]> {
    const docs = await this.notificationModel
      .find({ diagramId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return toPlainEntities<NotificationRecord>(docs);
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await this.notificationModel
      .updateOne(
        { _id: notificationId },
        { $addToSet: { readByUserIds: userId } },
      )
      .exec();
  }

  async markAllAsRead(diagramIds: string[], userId: string): Promise<void> {
    if (!diagramIds || diagramIds.length === 0) return;
    await this.notificationModel
      .updateMany(
        {
          $or: [
            { recipientUserId: userId },
            { recipientUserId: 'ROOM', diagramId: { $in: diagramIds } },
          ],
          readByUserIds: { $ne: userId },
        },
        { $addToSet: { readByUserIds: userId } },
      )
      .exec();
  }

  async deleteByDiagramIds(diagramIds: string[]): Promise<void> {
    if (!diagramIds || diagramIds.length === 0) return;
    await this.notificationModel.deleteMany({ diagramId: { $in: diagramIds } }).exec();
  }
}

