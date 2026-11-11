import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  CollaborationSession,
  CollaborationSessionDocument,
} from '../entities/collaboration-session.entity';
import { SessionParticipantRepository } from './session-participant.repository';
import { DiagramRepository } from '../../diagrams/repositories/diagram.repository';
import {
  getUtcDateKey,
  pickDefined,
  resolveDocId,
  toPlainEntity,
} from '../../../common/utils/mongoose-entity.util';

@Injectable()
export class SessionRepository {
  constructor(
    @InjectModel(CollaborationSession.name)
    private readonly sessionModel: Model<CollaborationSessionDocument>,
    private readonly participantRepository: SessionParticipantRepository,
    @Optional()
    @Inject(forwardRef(() => DiagramRepository))
    private readonly diagramRepository?: DiagramRepository,
  ) {}

  create(data: Partial<CollaborationSession>): CollaborationSession {
    const id = data._id || data.id || randomUUID();
    const today = getUtcDateKey();
    return {
      id,
      _id: id,
      diagramId: data.diagramId!,
      projectId: data.projectId ?? null,
      roomCode: data.roomCode!,
      isActive: data.isActive ?? true,
      hostUserId: data.hostUserId ?? null,
      hostUserName: data.hostUserName ?? null,
      sessionNumber: data.sessionNumber ?? 1,
      activeDateKeys: data.activeDateKeys && data.activeDateKeys.length > 0 ? data.activeDateKeys : [today],
      lastActiveDay: data.lastActiveDay || today,
      resumeSummary: data.resumeSummary || '',
      startedAt: data.startedAt || new Date(),
      lastActivityAt: data.lastActivityAt || new Date(),
      diagram: data.diagram,
      participants: data.participants || [],
    };
  }

  async save(session: Partial<CollaborationSession>): Promise<CollaborationSession> {
    const id = resolveDocId(session);
    const payload = pickDefined(session, ['id', '_id', 'diagram', 'participants']);
    const updated = await this.sessionModel
      .findOneAndUpdate(
        { _id: id },
        {
          $setOnInsert: { startedAt: session.startedAt || new Date() },
          $set: {
            ...payload,
            _id: id,
            lastActivityAt: payload.lastActivityAt || new Date(),
          },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      )
      .exec();
    return (await this.hydrateSession(toPlainEntity<CollaborationSession>(updated)))!;
  }

  async findById(sessionId: string): Promise<CollaborationSession | null> {
    if (!sessionId) return null;
    const doc = await this.sessionModel.findById(sessionId).exec();
    return this.hydrateSession(toPlainEntity<CollaborationSession>(doc));
  }

  async findActiveByDiagramId(diagramId: string): Promise<CollaborationSession | null> {
    const doc = await this.sessionModel
      .findOne({ diagramId, isActive: true })
      .sort({ lastActivityAt: -1 })
      .exec();
    return this.hydrateSession(toPlainEntity<CollaborationSession>(doc));
  }

  async findLatestByDiagramId(diagramId: string): Promise<CollaborationSession | null> {
    const doc = await this.sessionModel
      .findOne({ diagramId })
      .sort({ lastActivityAt: -1 })
      .exec();
    return this.hydrateSession(toPlainEntity<CollaborationSession>(doc));
  }

  async findByRoomCode(roomCode: string): Promise<CollaborationSession | null> {
    const doc = await this.sessionModel.findOne({ roomCode }).exec();
    return this.hydrateSession(toPlainEntity<CollaborationSession>(doc));
  }

  async findIdsByDiagramIds(diagramIds: string[]): Promise<string[]> {
    if (!diagramIds || diagramIds.length === 0) return [];
    const docs = await this.sessionModel
      .find({ diagramId: { $in: diagramIds } })
      .select({ _id: 1 })
      .exec();
    return docs.map((d) => String(d._id));
  }

  async update(id: string, data: Partial<CollaborationSession>): Promise<void> {
    const clean = pickDefined(data, ['id', '_id', 'diagram', 'participants']);
    if (Object.keys(clean).length === 0) return;
    await this.sessionModel
      .updateOne(
        { _id: id },
        {
          $set: {
            ...clean,
            lastActivityAt: clean.lastActivityAt || new Date(),
          },
        },
      )
      .exec();
  }

  async delete(id: string): Promise<void> {
    await this.participantRepository.deleteBySessionIds([id]);
    await this.sessionModel.deleteOne({ _id: id }).exec();
  }

  async deleteByDiagramIds(diagramIds: string[]): Promise<void> {
    if (!diagramIds || diagramIds.length === 0) return;
    const sessionIds = await this.findIdsByDiagramIds(diagramIds);
    if (sessionIds.length > 0) {
      await this.participantRepository.deleteBySessionIds(sessionIds);
    }
    await this.sessionModel.deleteMany({ diagramId: { $in: diagramIds } }).exec();
  }

  private async hydrateSession(
    session: CollaborationSession | null,
  ): Promise<CollaborationSession | null> {
    if (!session) return null;
    session.participants = await this.participantRepository.findBySessionId(session.id);
    if (this.diagramRepository && session.diagramId) {
      session.diagram = (await this.diagramRepository.findById(session.diagramId)) || undefined;
    }
    return session;
  }
}

export { SessionRepository as CollaborationSessionRepository };
