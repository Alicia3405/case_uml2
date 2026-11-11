import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { AuthorEvent, AuthorEventDocument } from '../entities/author-event.entity';
import {
  getUtcDateKey,
  toPlainEntities,
  toPlainEntity,
} from '../../../common/utils/mongoose-entity.util';

export interface ContributorStatsItem {
  userId: string;
  userName: string;
  actorType: 'human' | 'ai';
  totalEvents: number;
  umlEdits: number;
  aiInteractions: number;
  voiceCommands: number;
  lastActionAt: string;
  touchedClasses: string[];
}

@Injectable()
export class AuthorEventRepository {
  constructor(
    @InjectModel(AuthorEvent.name)
    private readonly eventModel: Model<AuthorEventDocument>,
  ) {}

  async createAndSave(data: Partial<AuthorEvent>): Promise<AuthorEvent> {
    const id = data._id || data.id || randomUUID();
    const now = data.createdAt || new Date();
    const doc = new this.eventModel({
      ...data,
      _id: id,
      sessionNumber: data.sessionNumber ?? 1,
      sessionDate: data.sessionDate || getUtcDateKey(now),
      actorType: data.actorType || 'human',
      category: data.category || 'uml',
      affectedClasses: data.affectedClasses || [],
      createdAt: now,
    });
    const saved = await doc.save();
    return toPlainEntity<AuthorEvent>(saved)!;
  }

  async findRecentByDiagramId(diagramId: string, limit = 150): Promise<AuthorEvent[]> {
    const docs = await this.eventModel
      .find({ diagramId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return toPlainEntities<AuthorEvent>(docs).reverse();
  }

  async findByUserAndDiagram(
    diagramId: string,
    userId: string,
    limit = 60,
  ): Promise<AuthorEvent[]> {
    const docs = await this.eventModel
      .find({ diagramId, userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
    return toPlainEntities<AuthorEvent>(docs).reverse();
  }

  async getContributionStatsByDiagram(diagramId: string): Promise<ContributorStatsItem[]> {
    const docs = await this.eventModel
      .find({ diagramId })
      .sort({ createdAt: 1 })
      .limit(500)
      .exec();
    const events = toPlainEntities<AuthorEvent>(docs);
    const byUser = new Map<string, ContributorStatsItem & { classesSet: Set<string> }>();

    for (const ev of events) {
      const key = `${ev.actorType}_${ev.userId}`;
      let entry = byUser.get(key);
      if (!entry) {
        entry = {
          userId: ev.userId,
          userName: ev.userName,
          actorType: ev.actorType || 'human',
          totalEvents: 0,
          umlEdits: 0,
          aiInteractions: 0,
          voiceCommands: 0,
          lastActionAt: ev.createdAt ? new Date(ev.createdAt).toISOString() : new Date().toISOString(),
          touchedClasses: [],
          classesSet: new Set<string>(),
        };
        byUser.set(key, entry);
      }

      entry.totalEvents += 1;
      if (ev.category === 'uml') entry.umlEdits += 1;
      if (ev.category === 'ai') entry.aiInteractions += 1;
      if (ev.category === 'voice') entry.voiceCommands += 1;
      entry.lastActionAt = ev.createdAt ? new Date(ev.createdAt).toISOString() : entry.lastActionAt;
      for (const cls of ev.affectedClasses || []) {
        if (cls) entry.classesSet.add(cls);
      }
    }

    return Array.from(byUser.values())
      .map(({ classesSet, ...rest }) => ({
        ...rest,
        touchedClasses: Array.from(classesSet),
      }))
      .sort((a, b) => b.totalEvents - a.totalEvents);
  }

  async deleteByDiagramIds(diagramIds: string[]): Promise<void> {
    if (!diagramIds || diagramIds.length === 0) return;
    await this.eventModel.deleteMany({ diagramId: { $in: diagramIds } }).exec();
  }
}

