import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { SessionParticipant, SessionParticipantDocument } from '../entities/session-participant.entity';
import { UserRepository } from '../../auth/repositories/user.repository';
import {
  pickDefined,
  resolveDocId,
  toPlainEntities,
  toPlainEntity,
} from '../../../common/utils/mongoose-entity.util';

@Injectable()
export class SessionParticipantRepository {
  constructor(
    @InjectModel(SessionParticipant.name)
    private readonly participantModel: Model<SessionParticipantDocument>,
    private readonly userRepository: UserRepository,
  ) {}

  create(data: Partial<SessionParticipant>): SessionParticipant {
    const id = data._id || data.id || randomUUID();
    return {
      id,
      _id: id,
      sessionId: data.sessionId!,
      userId: data.userId!,
      cursorColor: data.cursorColor || '#007ACC',
      isConnected: data.isConnected ?? true,
      lastSeenAt: data.lastSeenAt || new Date(),
      user: data.user,
      session: data.session,
    };
  }

  async save(participant: Partial<SessionParticipant>): Promise<SessionParticipant> {
    const id = resolveDocId(participant);
    const payload = pickDefined(participant, ['id', '_id', 'user', 'session']);
    const updated = await this.participantModel
      .findOneAndUpdate(
        { sessionId: participant.sessionId, userId: participant.userId },
        {
          $setOnInsert: { _id: id },
          $set: {
            sessionId: payload.sessionId,
            userId: payload.userId,
            cursorColor: payload.cursorColor || '#007ACC',
            isConnected: payload.isConnected ?? true,
            lastSeenAt: payload.lastSeenAt || new Date(),
          },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      )
      .exec();

    const plain = toPlainEntity<SessionParticipant>(updated)!;
    if (participant.user) {
      plain.user = participant.user;
    } else if (plain.userId) {
      plain.user = (await this.userRepository.findById(plain.userId)) || undefined;
    }
    return plain;
  }

  async findBySessionAndUser(sessionId: string, userId: string): Promise<SessionParticipant | null> {
    const doc = await this.participantModel.findOne({ sessionId, userId }).exec();
    const plain = toPlainEntity<SessionParticipant>(doc);
    if (!plain) return null;
    plain.user = (await this.userRepository.findById(plain.userId)) || undefined;
    return plain;
  }

  async findBySessionId(sessionId: string): Promise<SessionParticipant[]> {
    const docs = await this.participantModel
      .find({ sessionId })
      .sort({ lastSeenAt: -1 })
      .exec();
    const participants = toPlainEntities<SessionParticipant>(docs);
    if (participants.length === 0) return [];

    const users = await this.userRepository.findByIds(participants.map((p) => p.userId));
    const userMap = new Map(users.map((u) => [u.id, u]));
    for (const p of participants) {
      p.user = userMap.get(p.userId);
    }
    return participants;
  }

  async updateBySessionAndUser(
    sessionId: string,
    userId: string,
    data: Partial<SessionParticipant>,
  ): Promise<void> {
    const clean = pickDefined(data, ['id', '_id', 'user', 'session']);
    if (Object.keys(clean).length === 0) return;
    await this.participantModel.updateOne({ sessionId, userId }, { $set: clean }).exec();
  }

  async updateBySessionId(
    sessionId: string,
    data: Partial<SessionParticipant>,
  ): Promise<void> {
    const clean = pickDefined(data, ['id', '_id', 'user', 'session']);
    if (Object.keys(clean).length === 0) return;
    await this.participantModel.updateMany({ sessionId }, { $set: clean }).exec();
  }

  async delete(sessionId: string, userId: string): Promise<void> {
    await this.participantModel.deleteOne({ sessionId, userId }).exec();
  }

  async deleteBySessionIds(sessionIds: string[]): Promise<void> {
    if (!sessionIds || sessionIds.length === 0) return;
    await this.participantModel.deleteMany({ sessionId: { $in: sessionIds } }).exec();
  }
}
