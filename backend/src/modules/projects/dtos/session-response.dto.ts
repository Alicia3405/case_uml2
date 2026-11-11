import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CollaborationSession } from '../entities/collaboration-session.entity';
import { SessionParticipant } from '../entities/session-participant.entity';

export class SessionParticipantResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-40a2-9e8c-529a3a9df80f' })
  id: string;

  @ApiProperty({ example: 'd3b07384-d113-40a2-9e8c-529a3a9df80f' })
  userId: string;

  @ApiProperty({ example: 'Cesar Quispe Delgado' })
  fullName: string;

  @ApiProperty({ example: 'cesar@uagrm.edu.bo' })
  email: string;

  @ApiProperty({ example: '#007ACC' })
  cursorColor: string;

  @ApiProperty({ example: true })
  isConnected: boolean;

  @ApiProperty({ example: '2026-08-28T23:00:00.000Z' })
  lastSeenAt: Date;

  static fromEntity(entity: SessionParticipant): SessionParticipantResponseDto {
    const dto = new SessionParticipantResponseDto();
    dto.id = entity.id;
    dto.userId = entity.userId;
    dto.fullName = entity.user?.fullName || 'Usuario';
    dto.email = entity.user?.email || '';
    dto.cursorColor = entity.cursorColor;
    dto.isConnected = entity.isConnected;
    dto.lastSeenAt = entity.lastSeenAt;
    return dto;
  }
}

export class SessionResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-40a2-9e8c-529a3a9df80f' })
  id: string;

  @ApiProperty({ example: 'd3b07384-d113-40a2-9e8c-529a3a9df80f' })
  diagramId: string;

  @ApiPropertyOptional({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  projectId?: string | null;

  @ApiProperty({ example: 'ROOM-B2F891' })
  roomCode: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiPropertyOptional({ example: 'd3b07384-d113-40a2-9e8c-529a3a9df80f' })
  hostUserId?: string | null;

  @ApiPropertyOptional({ example: 'Cesar Quispe Delgado' })
  hostUserName?: string | null;

  @ApiProperty({ example: 1 })
  sessionNumber: number;

  @ApiPropertyOptional({ type: [String], example: ['2026-11-11'] })
  activeDateKeys?: string[];

  @ApiPropertyOptional({ example: '2026-11-11' })
  lastActiveDay?: string;

  @ApiPropertyOptional({ example: 'Día 1: 5 clases modeladas, última edición por Ana.' })
  resumeSummary?: string;

  @ApiProperty({ example: '2026-08-28T23:00:00.000Z' })
  startedAt: Date;

  @ApiPropertyOptional({ example: '2026-11-11T04:00:00.000Z' })
  lastActivityAt?: Date;

  @ApiProperty({ type: [SessionParticipantResponseDto] })
  participants: SessionParticipantResponseDto[];

  static fromEntity(entity: CollaborationSession): SessionResponseDto {
    const dto = new SessionResponseDto();
    dto.id = entity.id;
    dto.diagramId = entity.diagramId;
    dto.projectId = entity.projectId ?? entity.diagram?.projectId ?? null;
    dto.roomCode = entity.roomCode;
    dto.isActive = entity.isActive;
    dto.hostUserId = entity.hostUserId ?? null;
    dto.hostUserName = entity.hostUserName ?? null;
    dto.sessionNumber = entity.sessionNumber ?? 1;
    dto.activeDateKeys = entity.activeDateKeys || [];
    dto.lastActiveDay = entity.lastActiveDay;
    dto.resumeSummary = entity.resumeSummary || '';
    dto.startedAt = entity.startedAt;
    dto.lastActivityAt = entity.lastActivityAt;
    dto.participants = (entity.participants || []).map((p) =>
      SessionParticipantResponseDto.fromEntity(p),
    );
    return dto;
  }
}
