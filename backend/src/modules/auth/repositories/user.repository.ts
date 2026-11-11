import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { User, UserDocument } from '../entities/user.entity';
import {
  pickDefined,
  toPlainEntities,
  toPlainEntity,
} from '../../../common/utils/mongoose-entity.util';

@Injectable()
export class UserRepository {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async findByEmail(email: string, includePassword = false): Promise<User | null> {
    const normalized = (email || '').trim().toLowerCase();
    if (!normalized) return null;

    const query = this.userModel.findOne({ email: normalized });
    if (includePassword) {
      query.select('+passwordHash');
    }

    const doc = await query.exec();
    return toPlainEntity<User>(doc);
  }

  async findById(id: string): Promise<User | null> {
    if (!id) return null;
    const doc = await this.userModel.findById(id).exec();
    return toPlainEntity<User>(doc);
  }

  async findByIds(ids: string[]): Promise<User[]> {
    const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));
    if (uniqueIds.length === 0) return [];
    const docs = await this.userModel.find({ _id: { $in: uniqueIds } }).exec();
    return toPlainEntities<User>(docs);
  }

  async searchActiveUsers(
    query: string,
    excludeUserId?: string,
    limit = 8,
  ): Promise<Array<{ id: string; fullName: string; email: string }>> {
    const cleanQuery = (query || '').trim();
    const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 15);
    const filter: Record<string, any> = {
      isActive: { $ne: false },
    };

    if (excludeUserId) {
      filter._id = { $ne: excludeUserId };
    }

    if (cleanQuery.length > 0) {
      const escaped = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ fullName: regex }, { email: regex }];
    }

    const docs = await this.userModel
      .find(filter)
      .select('_id fullName email')
      .sort({ fullName: 1 })
      .limit(safeLimit)
      .exec();

    return toPlainEntities<User>(docs).map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
    }));
  }

  async existsByEmail(email: string): Promise<boolean> {
    const normalized = (email || '').trim().toLowerCase();
    if (!normalized) return false;
    const count = await this.userModel.countDocuments({ email: normalized }).exec();
    return count > 0;
  }

  async createAndSave(userData: Partial<User>): Promise<User> {
    const id = userData._id || userData.id || randomUUID();
    const doc = new this.userModel({
      ...pickDefined(userData, ['id', '_id', 'projectsCreated', 'projectMemberships', 'sessionParticipations', 'diagramVersions', 'aiLogs']),
      _id: id,
      email: userData.email ? userData.email.trim().toLowerCase() : undefined,
      createdAt: userData.createdAt || new Date(),
    });
    const saved = await doc.save();
    return toPlainEntity<User>(saved)!;
  }

  async update(id: string, partial: Partial<User>): Promise<void> {
    const clean = pickDefined(partial, ['id', '_id', 'projectsCreated', 'projectMemberships', 'sessionParticipations', 'diagramVersions', 'aiLogs']);
    if (clean.email) {
      clean.email = String(clean.email).trim().toLowerCase();
    }
    if (Object.keys(clean).length === 0) return;
    await this.userModel.updateOne({ _id: id }, { $set: clean }).exec();
  }
}
