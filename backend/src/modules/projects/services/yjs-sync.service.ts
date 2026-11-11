import { Injectable, NotFoundException } from '@nestjs/common';
import { SessionRepository } from '../repositories/session.repository';
import { SessionParticipantRepository } from '../repositories/session-participant.repository';
import { SessionResponseDto } from '../dtos/session-response.dto';
import { JoinRoomDto } from '../dtos/join-room.dto';

@Injectable()
export class YjsSyncService {
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly participantRepo: SessionParticipantRepository,
  ) {}

  async joinOrCreateSession(
    dto: JoinRoomDto,
    userId: string,
  ): Promise<SessionResponseDto> {
    let session = await this.sessionRepo.findActiveByDiagramId(dto.diagramId);

    if (!session) {
      const roomCode =
        dto.roomCode ||
        `ROOM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const newSession = this.sessionRepo.create({
        diagramId: dto.diagramId,
        roomCode,
        isActive: true,
      });

      session = await this.sessionRepo.save(newSession);
    }

    const cursorColor = dto.cursorColor || this.getRandomColor(userId);
    let participant = await this.participantRepo.findBySessionAndUser(session.id, userId);

    if (!participant) {
      participant = this.participantRepo.create({
        sessionId: session.id,
        userId,
        cursorColor,
        isConnected: true,
        lastSeenAt: new Date(),
      });
    } else {
      participant.isConnected = true;
      if (cursorColor) {
        participant.cursorColor = cursorColor;
      }
      participant.lastSeenAt = new Date();
    }

    await this.participantRepo.save(participant);

    const updatedSession = await this.sessionRepo.findById(session.id);
    return SessionResponseDto.fromEntity(updatedSession!);
  }

  async getSessionById(sessionId: string): Promise<SessionResponseDto> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundException('Sesión de colaboración no encontrada');
    }
    return SessionResponseDto.fromEntity(session);
  }

  async getActiveSessionByDiagram(diagramId: string): Promise<SessionResponseDto | null> {
    const session = await this.sessionRepo.findActiveByDiagramId(diagramId);
    if (!session) {
      return null;
    }
    return SessionResponseDto.fromEntity(session);
  }

  async leaveSession(sessionId: string, userId: string): Promise<void> {
    await this.participantRepo.updateBySessionAndUser(sessionId, userId, {
      isConnected: false,
      lastSeenAt: new Date(),
    });
  }

  async closeSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    await this.sessionRepo.update(sessionId, { isActive: false });
    await this.participantRepo.updateBySessionId(sessionId, {
      isConnected: false,
      lastSeenAt: new Date(),
    });

    return { success: true, message: 'Sesión de colaboración finalizada' };
  }

  private getRandomColor(seed: string): string {
    const colors = [
      '#EF4444', // Rojo
      '#F59E0B', // Ámbar
      '#10B981', // Verde esmeralda
      '#3B82F6', // Azul
      '#6366F1', // Índigo
      '#8B5CF6', // Púrpura
      '#EC4899', // Rosa
      '#14B8A6', // Teal
      '#F97316', // Naranja
    ];
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }
}
