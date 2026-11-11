import { Test, TestingModule } from '@nestjs/testing';
import { YjsSyncService } from './yjs-sync.service';
import { SessionRepository } from '../repositories/session.repository';
import { SessionParticipantRepository } from '../repositories/session-participant.repository';
import { NotFoundException } from '@nestjs/common';

describe('YjsSyncService', () => {
  let service: YjsSyncService;
  let sessionRepository: jest.Mocked<Partial<SessionRepository>>;
  let participantRepository: jest.Mocked<Partial<SessionParticipantRepository>>;

  const mockSession: any = {
    id: 'sess-123',
    diagramId: 'diag-123',
    roomCode: 'ROOM-TEST1',
    isActive: true,
    startedAt: new Date(),
    participants: [
      {
        id: 'part-1',
        userId: 'user-1',
        sessionId: 'sess-123',
        cursorColor: '#007ACC',
        isConnected: true,
        lastSeenAt: new Date(),
        user: { fullName: 'Evert User', email: 'evert@uagrm.edu.bo' },
      },
    ],
  };

  beforeEach(async () => {
    sessionRepository = {
      create: jest.fn().mockImplementation((data) => ({ ...data, id: 'sess-123' })),
      save: jest.fn().mockResolvedValue(mockSession),
      findById: jest.fn().mockResolvedValue(mockSession),
      findActiveByDiagramId: jest.fn().mockResolvedValue(mockSession),
      findByRoomCode: jest.fn().mockResolvedValue(mockSession),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    participantRepository = {
      create: jest.fn().mockImplementation((data) => ({ ...data, id: 'part-1' })),
      save: jest.fn().mockResolvedValue(mockSession.participants[0]),
      findBySessionAndUser: jest.fn().mockResolvedValue(mockSession.participants[0]),
      findBySessionId: jest.fn().mockResolvedValue(mockSession.participants),
      updateBySessionAndUser: jest.fn().mockResolvedValue(undefined),
      updateBySessionId: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YjsSyncService,
        {
          provide: SessionRepository,
          useValue: sessionRepository,
        },
        {
          provide: SessionParticipantRepository,
          useValue: participantRepository,
        },
      ],
    }).compile();

    service = module.get<YjsSyncService>(YjsSyncService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('joinOrCreateSession', () => {
    it('should create or join active session and register participant', async () => {
      const result = await service.joinOrCreateSession(
        { diagramId: 'diag-123', cursorColor: '#FF0000' },
        'user-1',
      );

      expect(sessionRepository.findActiveByDiagramId).toHaveBeenCalledWith('diag-123');
      expect(participantRepository.findBySessionAndUser).toHaveBeenCalledWith('sess-123', 'user-1');
      expect(participantRepository.save).toHaveBeenCalled();
      expect(result.id).toBe('sess-123');
      expect(result.roomCode).toBe('ROOM-TEST1');
      expect(result.participants.length).toBe(1);
    });

    it('should generate room and save session if no active session exists', async () => {
      sessionRepository.findActiveByDiagramId!.mockResolvedValueOnce(null);
      participantRepository.findBySessionAndUser!.mockResolvedValueOnce(null);

      const result = await service.joinOrCreateSession(
        { diagramId: 'diag-456' },
        'user-2',
      );

      expect(sessionRepository.create).toHaveBeenCalled();
      expect(sessionRepository.save).toHaveBeenCalled();
      expect(participantRepository.create).toHaveBeenCalled();
      expect(participantRepository.save).toHaveBeenCalled();
      expect(result.id).toBe('sess-123');
    });
  });

  describe('getSessionById', () => {
    it('should return session if found', async () => {
      const result = await service.getSessionById('sess-123');
      expect(result.id).toBe('sess-123');
    });

    it('should throw NotFoundException if session not found', async () => {
      sessionRepository.findById!.mockResolvedValueOnce(null);
      await expect(service.getSessionById('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getActiveSessionByDiagram', () => {
    it('should return active session for diagram', async () => {
      const result = await service.getActiveSessionByDiagram('diag-123');
      expect(result).not.toBeNull();
      expect(result?.diagramId).toBe('diag-123');
    });

    it('should return null if no active session', async () => {
      sessionRepository.findActiveByDiagramId!.mockResolvedValueOnce(null);
      const result = await service.getActiveSessionByDiagram('diag-999');
      expect(result).toBeNull();
    });
  });

  describe('leaveSession', () => {
    it('should mark participant as disconnected', async () => {
      await service.leaveSession('sess-123', 'user-1');
      expect(participantRepository.updateBySessionAndUser).toHaveBeenCalledWith(
        'sess-123',
        'user-1',
        expect.objectContaining({ isConnected: false }),
      );
    });
  });

  describe('closeSession', () => {
    it('should close active session and mark participants disconnected', async () => {
      const result = await service.closeSession('sess-123');
      expect(sessionRepository.update).toHaveBeenCalledWith('sess-123', { isActive: false });
      expect(participantRepository.updateBySessionId).toHaveBeenCalledWith(
        'sess-123',
        expect.objectContaining({ isConnected: false }),
      );
      expect(result.success).toBe(true);
    });
  });
});
