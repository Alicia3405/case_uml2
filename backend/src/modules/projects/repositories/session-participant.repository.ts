import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { SessionParticipant } from '../entities/session-participant.entity';

@Injectable()
export class SessionParticipantRepository {
  constructor(
    @InjectRepository(SessionParticipant)
    private readonly repo: Repository<SessionParticipant>,
  ) {}

  create(data: DeepPartial<SessionParticipant>): SessionParticipant {
    return this.repo.create(data);
  }

  async save(participant: SessionParticipant): Promise<SessionParticipant> {
    return this.repo.save(participant);
  }

  async findBySessionAndUser(sessionId: string, userId: string): Promise<SessionParticipant | null> {
    return this.repo.findOne({
      where: { sessionId, userId },
      relations: {
        user: true,
      },
    });
  }

  async findBySessionId(sessionId: string): Promise<SessionParticipant[]> {
    return this.repo.find({
      where: { sessionId },
      relations: {
        user: true,
      },
      order: { lastSeenAt: 'DESC' },
    });
  }

  async updateBySessionAndUser(
    sessionId: string,
    userId: string,
    data: QueryDeepPartialEntity<SessionParticipant>,
  ): Promise<void> {
    await this.repo.update({ sessionId, userId }, data);
  }

  async updateBySessionId(
    sessionId: string,
    data: QueryDeepPartialEntity<SessionParticipant>,
  ): Promise<void> {
    await this.repo.update({ sessionId }, data);
  }

  async delete(sessionId: string, userId: string): Promise<void> {
    await this.repo.delete({ sessionId, userId });
  }
}
