import { Test, TestingModule } from '@nestjs/testing';
import { CollaborationController } from './collaboration.controller';
import { YjsSyncService } from '../services/yjs-sync.service';

describe('CollaborationController', () => {
  let controller: CollaborationController;
  let service: jest.Mocked<YjsSyncService>;

  const mockSessionResponse: any = {
    id: 'sess-123',
    diagramId: 'diag-123',
    roomCode: 'ROOM-TEST1',
    isActive: true,
    startedAt: new Date(),
    participants: [],
  };

  const mockUser: any = {
    id: 'user-1',
    email: 'evert@uagrm.edu.bo',
    fullName: 'Evert User',
  };

  beforeEach(async () => {
    const mockService = {
      joinOrCreateSession: jest.fn().mockResolvedValue(mockSessionResponse),
      getSessionById: jest.fn().mockResolvedValue(mockSessionResponse),
      getActiveSessionByDiagram: jest.fn().mockResolvedValue(mockSessionResponse),
      closeSession: jest.fn().mockResolvedValue({ success: true, message: 'Sesión finalizada' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CollaborationController],
      providers: [
        {
          provide: YjsSyncService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<CollaborationController>(CollaborationController);
    service = module.get(YjsSyncService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should join or create session', async () => {
    const dto = { diagramId: 'diag-123' };
    const result = await controller.joinSession(dto, mockUser);
    expect(service.joinOrCreateSession).toHaveBeenCalledWith(dto, mockUser.id);
    expect(result.id).toBe('sess-123');
  });

  it('should get active session by diagram id', async () => {
    const result = await controller.getByDiagram('diag-123');
    expect(service.getActiveSessionByDiagram).toHaveBeenCalledWith('diag-123');
    expect(result?.id).toBe('sess-123');
  });

  it('should get session by id', async () => {
    const result = await controller.getById('sess-123');
    expect(service.getSessionById).toHaveBeenCalledWith('sess-123');
    expect(result.id).toBe('sess-123');
  });

  it('should close session', async () => {
    const result = await controller.closeSession('sess-123');
    expect(service.closeSession).toHaveBeenCalledWith('sess-123');
    expect(result.success).toBe(true);
  });
});
