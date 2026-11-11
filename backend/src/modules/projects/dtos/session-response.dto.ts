import { ApiProperty } from '@nestjs/swagger';
import { CollaborationSession } from '../entities/collaboration-session.entity';
import { SessionParticipant } from '../entities/session-participant.entity';

export class SessionParticipantResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-40a2-9e8c-529a3a9df80f' })
  id: string;

  @ApiProperty({ example: 'd3b07384-d113-40a2-9e8c-529a3a9df80f' })
  userId: string;

  @ApiProperty({ example: 'Evert' })
  fullName: string;

  @ApiProperty({ example: 'evert@uagrm.edu.bo' })
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

  @ApiProperty({ example: 'ROOM-B2F891' })
  roomCode: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2026-08-28T23:00:00.000Z' })
  startedAt: Date;

  @ApiProperty({ type: [SessionParticipantResponseDto] })
  participants: SessionParticipantResponseDto[];

  static fromEntity(entity: CollaborationSession): SessionResponseDto {
    const dto = new SessionResponseDto();
    dto.id = entity.id;
    dto.diagramId = entity.diagramId;
    dto.roomCode = entity.roomCode;
    dto.isActive = entity.isActive;
    dto.startedAt = entity.startedAt;
    dto.participants = (entity.participants || []).map((p) =>
      SessionParticipantResponseDto.fromEntity(p),
    );
    return dto;
  }
}
