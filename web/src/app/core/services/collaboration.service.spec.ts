import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { AuthService } from './auth.service';
import {
  CollaborationService,
  CollabNotificationItem,
  ProjectPermissionsUpdatedEvent,
  ResumeBundleDto,
} from './collaboration.service';
import { AiAnnotationItem } from '../models/diagram.model';

const USER_1_ID = '00000000-0000-4000-8000-000000000001';
const USER_2_ID = '00000000-0000-4000-8000-000000000002';
const DIAG_1_ID = '11111111-1111-4111-8111-111111111111';
const DIAG_2_ID = '22222222-2222-4222-8222-222222222222';

type EventHandler = (...args: any[]) => void;

const socketState = vi.hoisted(() => ({
  handlers: new Map<string, EventHandler>(),
  connected: false,
  emitMock: vi.fn(),
  connectMock: vi.fn(),
  disconnectMock: vi.fn(),
}));

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    socketState.connected = true;
    const mockSocket: any = {
      get connected() {
        return socketState.connected;
      },
      on: (event: string, cb: EventHandler) => {
        socketState.handlers.set(event, cb);
        return mockSocket;
      },
      emit: (event: string, ...args: any[]) => {
        socketState.emitMock(event, ...args);
        if (event === 'join_room' && typeof args[1] === 'function') {
          args[1]({
            success: true,
            session: {
              id: 'sess-1',
              diagramId: args[0]?.diagramId,
              roomCode: 'ROOM-1',
              hostUserId: '00000000-0000-4000-8000-000000000001',
              hostUserName: 'Alice Tester',
              sessionNumber: 3,
              activeDateKeys: ['2026-11-09', '2026-11-10', '2026-11-11'],
            },
            participants: [
              {
                userId: '00000000-0000-4000-8000-000000000001',
                userName: 'Alice',
                color: '#3B82F6',
                isConnected: true,
              },
            ],
            activeLocks: [
              {
                nodeId: 'n1',
                userId: '00000000-0000-4000-8000-000000000002',
                userName: 'Bob',
                color: '#10B981',
              },
            ],
            recentChatMessages: [
              {
                id: 'c_hist_1',
                userId: '00000000-0000-4000-8000-000000000002',
                userName: 'Bob',
                message: 'Hola',
                timestamp: '2026-01-01T00:00:00Z',
              },
            ],
            recentActivityLogs: [
              {
                id: 'a_hist_1',
                userId: '00000000-0000-4000-8000-000000000002',
                userName: 'Bob',
                action: 'Creó clase Cliente',
                category: 'uml',
                timestamp: '2026-01-01T00:00:00Z',
              },
            ],
          });
        }
        return mockSocket;
      },
      connect: () => {
        socketState.connected = true;
        socketState.connectMock();
      },
      disconnect: () => {
        socketState.connected = false;
        socketState.disconnectMock();
      },
    };
    return mockSocket;
  }),
}));

describe('CollaborationService', () => {
  let service: CollaborationService;
  let mockHttpClient: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    socketState.handlers.clear();
    socketState.emitMock.mockReset();
    socketState.connectMock.mockReset();
    socketState.disconnectMock.mockReset();
    socketState.connected = false;

    mockHttpClient = {
      get: vi.fn().mockReturnValue(of({ data: [] })),
      post: vi.fn().mockReturnValue(of({ data: {} })),
      patch: vi.fn().mockReturnValue(of({ data: null })),
    };

    const mockAuth = {
      currentUser: () => ({ id: USER_1_ID, fullName: 'Alice Tester', email: 'alice@test.com' }),
    };

    TestBed.configureTestingModule({
      providers: [
        CollaborationService,
        { provide: AuthService, useValue: mockAuth },
        { provide: HttpClient, useValue: mockHttpClient },
      ],
    });
    service = TestBed.inject(CollaborationService);
  });

  it('debe soportar fallback local offline en chat y bitácora sin socket conectado', () => {
    service.sendChatMessage('   ');
    service.sendActivityLog('   ');
    expect(service.chatMessages()).toHaveLength(0);
    expect(service.activityLogs()).toHaveLength(0);

    service.sendChatMessage('Mensaje local de prueba');
    service.sendActivityLog('Creó clase Venta', 'Por comando de voz', 'voice');

    expect(service.chatMessages()).toHaveLength(1);
    expect(service.chatMessages()[0]).toMatchObject({
      userId: USER_1_ID,
      userName: 'Alice Tester',
      message: 'Mensaje local de prueba',
    });

    expect(service.activityLogs()).toHaveLength(1);
    expect(service.activityLogs()[0]).toMatchObject({
      userId: USER_1_ID,
      action: 'Creó clase Venta',
      detail: 'Por comando de voz',
      category: 'voice',
    });
  });

  it('debe hidratar historial al entrar a la sala y limpiar al cambiar de diagrama', () => {
    service.joinRoom(DIAG_1_ID);

    expect(service.activeRoomCode()).toBe('ROOM-1');
    expect(service.sessionMeta()?.sessionNumber).toBe(3);
    expect(service.collaborators()).toHaveLength(1);
    expect(service.activeNodeLocks().get('n1')?.userName).toBe('Bob');
    expect(service.chatMessages()).toHaveLength(1);
    expect(service.activityLogs()).toHaveLength(1);

    // Emitir mensaje no leído de otro usuario y verificar reset al cambiar de sala
    const chatHandler = socketState.handlers.get('chat_message_received');
    chatHandler?.({ id: 'c2', userId: USER_2_ID, userName: 'Bob', message: 'Ping', timestamp: '2026-01-01T00:01:00Z' });
    expect(service.unreadChatCount()).toBe(1);

    service.joinRoom(DIAG_2_ID);
    expect(service.currentDiagramId()).toBe(DIAG_2_ID);
    expect(service.unreadChatCount()).toBe(0);
  });

  it('debe deduplicar chat/bitácora por id, gestionar no leídos y reenviar cambios de permisos en vivo', () => {
    service.connect();

    const chatHandler = socketState.handlers.get('chat_message_received')!;
    const actHandler = socketState.handlers.get('activity_logged')!;
    const permHandler = socketState.handlers.get('project_permissions_updated')!;

    // Panel oculto: mensaje propio no incrementa, mensaje remoto sí, duplicado por id se ignora
    service.setChatPanelVisible(false);
    chatHandler({ id: 'm1', userId: USER_1_ID, userName: 'Alice', message: 'Mío', timestamp: 't1' });
    expect(service.unreadChatCount()).toBe(0);

    chatHandler({ id: 'm2', userId: USER_2_ID, userName: 'Bob', message: 'Remoto', timestamp: 't2' });
    chatHandler({ id: 'm2', userId: USER_2_ID, userName: 'Bob', message: 'Remoto', timestamp: 't2' });
    expect(service.chatMessages()).toHaveLength(2);
    expect(service.unreadChatCount()).toBe(1);

    // Mostrar panel limpia el contador y nuevos mensajes ya no incrementan no leídos
    service.setChatPanelVisible(true);
    expect(service.unreadChatCount()).toBe(0);
    chatHandler({
      id: 'm3_ai',
      userId: 'ai-copilot',
      userName: 'Copilot IA',
      message: 'Recomiendo normalizar Cliente y Pedido',
      senderType: 'ai',
      aiMode: 'ADVISE',
      timestamp: 't3',
    });
    expect(service.unreadChatCount()).toBe(0);
    expect(service.chatMessages()[2].senderType).toBe('ai');

    // Bitácora: deduplicación por id y límite máximo de 100
    actHandler({ id: 'a1', userId: USER_2_ID, userName: 'Bob', action: 'A1', category: 'uml', timestamp: 't1' });
    actHandler({ id: 'a1', userId: USER_2_ID, userName: 'Bob', action: 'A1', category: 'uml', timestamp: 't1' });
    expect(service.activityLogs()).toHaveLength(1);

    for (let i = 0; i < 105; i++) {
      actHandler({ id: `bulk_${i}`, userId: USER_2_ID, userName: 'Bob', action: `Act ${i}`, category: 'uml', timestamp: 't' });
    }
    expect(service.activityLogs()).toHaveLength(100);
    expect(service.activityLogs()[99].id).toBe('bulk_104');

    // Permisos en vivo
    const receivedPermEvents: ProjectPermissionsUpdatedEvent[] = [];
    service.projectPermissionsUpdated$.subscribe((ev) => receivedPermEvents.push(ev));
    permHandler({ projectId: 'p1', userId: USER_1_ID, role: 'VIEWER', canDownloadCode: false });

    expect(receivedPermEvents).toHaveLength(1);
    expect(receivedPermEvents[0]).toMatchObject({
      projectId: 'p1',
      userId: USER_1_ID,
      role: 'VIEWER',
      canDownloadCode: false,
    });
  });

  it('debe gestionar notificaciones persistidas, resumen de continuidad, transferencia de anfitrión y anotaciones IA', () => {
    service.joinRoom(DIAG_1_ID);

    const sampleNotif: CollabNotificationItem = {
      id: 'notif-1',
      diagramId: DIAG_1_ID,
      recipientUserId: USER_1_ID,
      severity: 'mention',
      title: 'Copilot IA mencionó tu diseño',
      body: 'Falta llave primaria en Pedido',
      actorName: 'Copilot IA',
      targetNodeIds: ['n1'],
      readByUserIds: [],
      createdAt: '2026-11-11T10:00:00Z',
    };

    mockHttpClient.get.mockReturnValueOnce(of({ data: [sampleNotif] }));
    service.loadNotifications(DIAG_1_ID).subscribe((items) => {
      expect(items).toHaveLength(1);
    });
    expect(service.unreadNotificationCount()).toBe(1);

    // Evento WebSocket en vivo: deduplica si llega repetido
    const notifHandler = socketState.handlers.get('notification_created')!;
    const receivedNotifs: CollabNotificationItem[] = [];
    service.notificationReceived$.subscribe((n) => receivedNotifs.push(n));

    notifHandler(sampleNotif);
    expect(service.notifications()).toHaveLength(1);
    expect(receivedNotifs).toHaveLength(1);

    notifHandler({ ...sampleNotif, id: 'notif-2', title: 'Segundo aviso' });
    expect(service.unreadNotificationCount()).toBe(2);

    // Marcar leída individual y todas leídas
    mockHttpClient.patch.mockReturnValueOnce(of({ data: null }));
    service.markNotificationRead('notif-1').subscribe();
    expect(service.unreadNotificationCount()).toBe(1);

    mockHttpClient.post.mockReturnValueOnce(of({ data: { updatedCount: 1 } }));
    service.markAllNotificationsRead(DIAG_1_ID).subscribe();
    expect(service.unreadNotificationCount()).toBe(0);

    // Transferir anfitrión vía HTTP y vía WebSocket
    mockHttpClient.post.mockReturnValueOnce(
      of({
        data: {
          id: 'sess-1',
          diagramId: DIAG_1_ID,
          roomCode: 'ROOM-1',
          hostUserId: USER_2_ID,
          hostUserName: 'Bob',
          sessionNumber: 3,
        },
      }),
    );
    service.transferHost('sess-1', USER_2_ID).subscribe();
    expect(service.sessionMeta()?.hostUserId).toBe(USER_2_ID);

    const hostHandler = socketState.handlers.get('host_transferred')!;
    hostHandler({ newHostUserId: USER_1_ID, newHostUserName: 'Alice Tester' });
    expect(service.sessionMeta()?.hostUserId).toBe(USER_1_ID);

    // Resume bundle
    const mockBundle: ResumeBundleDto = {
      diagram: {
        id: DIAG_1_ID,
        projectId: 'p1',
        name: 'VentasUML',
        revisionCount: 4,
        lastModifiedByName: 'Bob',
        lastModifiedAt: '2026-11-11T09:00:00Z',
        classCount: 3,
        connectionCount: 2,
        openAiAnnotationsCount: 1,
      },
      session: null,
      sinceLastVisit: {
        lastContributedAt: null,
        changesCount: 2,
        contributors: ['Bob'],
        touchedClasses: ['Pedido'],
        highlights: ['Bob agregó atributo total a Pedido'],
      },
      contributorStats: [],
      snapshots: [],
      unreadNotifications: [],
      recentMessages: [],
      recentEvents: [],
    };
    mockHttpClient.get.mockReturnValueOnce(of({ data: mockBundle }));
    service.getResumeBundle(DIAG_1_ID).subscribe((res) => {
      expect(res.sinceLastVisit.changesCount).toBe(2);
      expect(res.diagram.revisionCount).toBe(4);
    });

    // Anotaciones IA vía WebSocket y sendDiagramSync con anotaciones
    const sampleAnnotations: AiAnnotationItem[] = [
      {
        id: 'ann-1',
        authorName: 'Copilot IA',
        severity: 'discipline',
        title: 'PK faltante',
        message: 'Agrega id [PK] a Pedido',
        status: 'open',
      },
    ];
    const annUpdates: any[] = [];
    service.aiAnnotationsUpdated$.subscribe((ev) => annUpdates.push(ev));
    socketState.handlers.get('ai_annotations_updated')?.({
      diagramId: DIAG_1_ID,
      aiAnnotations: sampleAnnotations,
    });
    expect(annUpdates).toHaveLength(1);
    expect(annUpdates[0].aiAnnotations[0].id).toBe('ann-1');

    service.sendDiagramSync([], [], 'update_annotations', sampleAnnotations);
    expect(socketState.emitMock).toHaveBeenCalledWith(
      'diagram_sync',
      expect.objectContaining({
        diagramId: DIAG_1_ID,
        action: 'update_annotations',
        aiAnnotations: sampleAnnotations,
      }),
    );
  });
});
