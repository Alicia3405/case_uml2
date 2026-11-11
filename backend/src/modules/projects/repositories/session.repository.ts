import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { CollaborationSession } from '../entities/collaboration-session.entity';

@Injectable()
export class SessionRepository {
  constructor(
    @InjectRepository(CollaborationSession)
    private readonly repo: Repository<CollaborationSession>,
  ) {}

  create(data: DeepPartial<CollaborationSession>): CollaborationSession {
    return this.repo.create(data);
  }

  async save(session: CollaborationSession): Promise<CollaborationSession> {
    return this.repo.save(session);
  }

  async findById(sessionId: string): Promise<CollaborationSession | null> {
    return this.repo.findOne({
      where: { id: sessionId },
      relations: {
        diagram: true,
        participants: {
          user: true,
        },
      },
    });
  }

  async findActiveByDiagramId(diagramId: string): Promise<CollaborationSession | null> {
    return this.repo.findOne({
      where: { diagramId, isActive: true },
      relations: {
        diagram: true,
        participants: {
          user: true,
        },
      },
    });
  }

  async findByRoomCode(roomCode: string): Promise<CollaborationSession | null> {
    return this.repo.findOne({
      where: { roomCode },
      relations: {
        diagram: true,
        participants: {
          user: true,
        },
      },
    });
  }

  async update(id: string, data: QueryDeepPartialEntity<CollaborationSession>): Promise<void> {
    await this.repo.update(id, data);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}

export { SessionRepository as CollaborationSessionRepository };
