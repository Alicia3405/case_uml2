import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service';
import { CollaborationService, ProjectPermissionsUpdatedEvent } from './collaboration.service';

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
            session: { roomCode: 'ROOM-1' },
            participants: [{ userId: 'u1', userName: 'Alice', color: '#3B82F6', isConnected: true }],
            activeLocks: [{ nodeId: 'n1', userId: 'u2', userName: 'Bob', color: '#10B981' }],
            recentChatMessages: [
              { id: 'c_hist_1', userId: 'u2', userName: 'Bob', message: 'Hola', timestamp: '2026-01-01T00:00:00Z' },
            ],
            recentActivityLogs: [
              {
                id: 'a_hist_1',
                userId: 'u2',
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
  let injector: EnvironmentInjector;

  beforeEach(() => {
    socketState.handlers.clear();
    socketState.emitMock.mockReset();
    socketState.connectMock.mockReset();
    socketState.disconnectMock.mockReset();
    socketState.connected = false;

    const mockAuth = {
      currentUser: () => ({ id: 'u1', fullName: 'Alice Tester', email: 'alice@test.com' }),
    };

    injector = createEnvironmentInjector(
      [{ provide: AuthService, useValue: mockAuth }],
      null as any,
    );
    runInInjectionContext(injector, () => {
      service = new CollaborationService();
    });
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
      userId: 'u1',
      userName: 'Alice Tester',
      message: 'Mensaje local de prueba',
    });

    expect(service.activityLogs()).toHaveLength(1);
    expect(service.activityLogs()[0]).toMatchObject({
      userId: 'u1',
      action: 'Creó clase Venta',
      detail: 'Por comando de voz',
      category: 'voice',
    });
  });

  it('debe hidratar historial al entrar a la sala y limpiar al cambiar de diagrama', () => {
    service.joinRoom('diag-1');

    expect(service.activeRoomCode()).toBe('ROOM-1');
    expect(service.collaborators()).toHaveLength(1);
    expect(service.activeNodeLocks().get('n1')?.userName).toBe('Bob');
    expect(service.chatMessages()).toHaveLength(1);
    expect(service.activityLogs()).toHaveLength(1);

    // Emitir mensaje no leído de otro usuario y verificar reset al cambiar de sala
    const chatHandler = socketState.handlers.get('chat_message_received');
    chatHandler?.({ id: 'c2', userId: 'u2', userName: 'Bob', message: 'Ping', timestamp: '2026-01-01T00:01:00Z' });
    expect(service.unreadChatCount()).toBe(1);

    service.joinRoom('diag-2');
    expect(service.currentDiagramId()).toBe('diag-2');
    expect(service.unreadChatCount()).toBe(0);
  });

  it('debe deduplicar chat/bitácora por id, gestionar no leídos y reenviar cambios de permisos en vivo', () => {
    service.connect();

    const chatHandler = socketState.handlers.get('chat_message_received')!;
    const actHandler = socketState.handlers.get('activity_logged')!;
    const permHandler = socketState.handlers.get('project_permissions_updated')!;

    // Panel oculto: mensaje propio no incrementa, mensaje remoto sí, duplicado por id se ignora
    service.setChatPanelVisible(false);
    chatHandler({ id: 'm1', userId: 'u1', userName: 'Alice', message: 'Mío', timestamp: 't1' });
    expect(service.unreadChatCount()).toBe(0);

    chatHandler({ id: 'm2', userId: 'u2', userName: 'Bob', message: 'Remoto', timestamp: 't2' });
    chatHandler({ id: 'm2', userId: 'u2', userName: 'Bob', message: 'Remoto', timestamp: 't2' });
    expect(service.chatMessages()).toHaveLength(2);
    expect(service.unreadChatCount()).toBe(1);

    // Mostrar panel limpia el contador y nuevos mensajes ya no incrementan no leídos
    service.setChatPanelVisible(true);
    expect(service.unreadChatCount()).toBe(0);
    chatHandler({ id: 'm3', userId: 'u2', userName: 'Bob', message: 'Leído en vivo', timestamp: 't3' });
    expect(service.unreadChatCount()).toBe(0);

    // Bitácora: deduplicación por id y límite máximo de 100
    actHandler({ id: 'a1', userId: 'u2', userName: 'Bob', action: 'A1', category: 'uml', timestamp: 't1' });
    actHandler({ id: 'a1', userId: 'u2', userName: 'Bob', action: 'A1', category: 'uml', timestamp: 't1' });
    expect(service.activityLogs()).toHaveLength(1);

    for (let i = 0; i < 105; i++) {
      actHandler({ id: `bulk_${i}`, userId: 'u2', userName: 'Bob', action: `Act ${i}`, category: 'uml', timestamp: 't' });
    }
    expect(service.activityLogs()).toHaveLength(100);
    expect(service.activityLogs()[99].id).toBe('bulk_104');

    // Permisos en vivo
    const receivedPermEvents: ProjectPermissionsUpdatedEvent[] = [];
    service.projectPermissionsUpdated$.subscribe((ev) => receivedPermEvents.push(ev));
    permHandler({ projectId: 'p1', userId: 'u1', role: 'VIEWER', canDownloadCode: false });

    expect(receivedPermEvents).toHaveLength(1);
    expect(receivedPermEvents[0]).toMatchObject({
      projectId: 'p1',
      userId: 'u1',
      role: 'VIEWER',
      canDownloadCode: false,
    });
  });
});

