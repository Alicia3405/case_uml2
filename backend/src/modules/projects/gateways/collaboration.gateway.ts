import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { YjsSyncService } from '../services/yjs-sync.service';
import { getAllowedCorsOrigins } from '../../../config/cors.config';

interface ClientMetadata {
  userId: string;
  userName: string;
  diagramId: string;
  roomCode: string;
  sessionId?: string;
  color: string;
}

export interface NodeLockInfo {
  nodeId: string;
  userId: string;
  userName: string;
  color: string;
  diagramId: string;
  lockedAt: number;
}

export interface ChatMessageRecord {
  id: string;
  userId: string;
  userName: string;
  message: string;
  color?: string;
  timestamp: string;
}

export interface ActivityLogRecord {
  id: string;
  userId: string;
  userName: string;
  action: string;
  detail?: string;
  category: 'uml' | 'ai' | 'voice' | 'permission' | 'system';
  color?: string;
  timestamp: string;
}

const MAX_ROOM_HISTORY = 50;

@WebSocketGateway({
  namespace: '/collaboration',
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      const allowedOrigins = getAllowedCorsOrigins();
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  },
})
export class CollaborationGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CollaborationGateway.name);
  private readonly clientMap = new Map<string, ClientMetadata>();
  // Mapa de bloqueo de nodos por exclusión mutua: `${diagramId}_${nodeId}` => NodeLockInfo
  private readonly nodeLocks = new Map<string, NodeLockInfo>();
  // Historial acotado en memoria por sala/diagrama para chat y bitácora de auditoría en vivo
  private readonly roomChatHistory = new Map<string, ChatMessageRecord[]>();
  private readonly roomActivityHistory = new Map<string, ActivityLogRecord[]>();

  constructor(private readonly yjsSyncService: YjsSyncService) { }

  private getRoomTargets(diagramId?: string, roomCode?: string): string[] {
    return Array.from(
      new Set([diagramId ? `diagram_${diagramId}` : '', roomCode || ''].filter(Boolean)),
    );
  }

  private getHistoryKey(diagramId?: string, roomCode?: string): string | null {
    return diagramId || roomCode || null;
  }

  private appendBoundedHistory<T>(map: Map<string, T[]>, key: string | null, item: T): void {
    if (!key) return;
    const list = map.get(key) ?? [];
    list.push(item);
    if (list.length > MAX_ROOM_HISTORY) {
      list.splice(0, list.length - MAX_ROOM_HISTORY);
    }
    map.set(key, list);
  }

  handleConnection(client: Socket): void {
    this.logger.log(`[WebSocket] Cliente conectado: ${client.id}`);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const meta = this.clientMap.get(client.id);
    if (meta) {
      this.logger.log(
        `[WebSocket] Cliente ${meta.userName} (${meta.userId}) desconectado de sala ${meta.roomCode}`,
      );

      if (meta.sessionId) {
        await this.yjsSyncService.leaveSession(meta.sessionId, meta.userId);
      }

      const targets = this.getRoomTargets(meta.diagramId, meta.roomCode);

      // Liberar cualquier bloqueo de tabla que tuviera este usuario
      const locksToRelease: string[] = [];
      for (const [lockKey, lockInfo] of this.nodeLocks.entries()) {
        if (lockInfo.userId === meta.userId && lockInfo.diagramId === meta.diagramId) {
          locksToRelease.push(lockKey);
          if (targets.length > 0) {
            this.server.to(targets).emit('node_unlocked', {
              nodeId: lockInfo.nodeId,
              userId: meta.userId,
            });
          }
        }
      }
      for (const key of locksToRelease) {
        this.nodeLocks.delete(key);
      }

      this.clientMap.delete(client.id);

      // Calcular lista actualizada de participantes activos para este diagrama
      const connectedClients = Array.from(this.clientMap.values()).filter(
        (c) => c.diagramId === meta.diagramId || c.roomCode === meta.roomCode,
      );

      const uniqueParticipants = Array.from(
        new Map(connectedClients.map((c) => [c.userId, {
          userId: c.userId,
          userName: c.userName,
          color: c.color,
          isConnected: true,
        }])).values()
      );

      if (targets.length > 0) {
        this.server.to(targets).emit('user_left', {
          userId: meta.userId,
          userName: meta.userName,
          socketId: client.id,
        });

        this.server.to(targets).emit('room_participants_updated', {
          diagramId: meta.diagramId,
          roomCode: meta.roomCode,
          participants: uniqueParticipants,
        });
      }
    } else {
      this.clientMap.delete(client.id);
    }
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @MessageBody()
    data: {
      diagramId: string;
      roomCode?: string;
      userId: string;
      userName: string;
      color?: string;
    },
    @ConnectedSocket() client: Socket,
  ): Promise<{
    success: boolean;
    session: any;
    participants: any[];
    activeLocks: any[];
    recentChatMessages: ChatMessageRecord[];
    recentActivityLogs: ActivityLogRecord[];
  }> {
    try {
      // Validar que el diagramId sea un UUID válido antes de consultar la BD
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!data.diagramId || !uuidRegex.test(data.diagramId)) {
        this.logger.warn(`[WebSocket] join_room ignorado: diagramId inválido "${data.diagramId}" (no es UUID)`);
        return {
          success: false,
          session: null,
          participants: [],
          activeLocks: [],
          recentChatMessages: [],
          recentActivityLogs: [],
        };
      }

      this.logger.log(
        `[WebSocket] join_room recibido de ${data.userName} (${data.userId}) para diagrama ${data.diagramId}`,
      );

      const session = await this.yjsSyncService.joinOrCreateSession(
        {
          diagramId: data.diagramId,
          roomCode: data.roomCode,
          cursorColor: data.color,
        },
        data.userId,
      );

      const targetRoom = session.roomCode;
      const diagramRoom = `diagram_${data.diagramId}`;
      const targets = this.getRoomTargets(data.diagramId, targetRoom);

      // Unir socket a ambas salas (código de sala y diagrama)
      await client.join(targetRoom);
      await client.join(diagramRoom);

      const color = data.color || '#007ACC';

      this.clientMap.set(client.id, {
        userId: data.userId,
        userName: data.userName,
        diagramId: data.diagramId,
        roomCode: targetRoom,
        sessionId: session.id,
        color,
      });

      // Obtener participantes únicos conectados
      const connectedClients = Array.from(this.clientMap.values()).filter(
        (c) => c.diagramId === data.diagramId || c.roomCode === targetRoom,
      );

      const uniqueParticipants = Array.from(
        new Map(connectedClients.map((c) => [c.userId, {
          userId: c.userId,
          userName: c.userName,
          color: c.color,
          isConnected: true,
        }])).values()
      );

      // Obtener bloqueos activos en este diagrama
      const currentLocks = Array.from(this.nodeLocks.values())
        .filter((l) => l.diagramId === data.diagramId)
        .map((l) => ({
          nodeId: l.nodeId,
          userId: l.userId,
          userName: l.userName,
          color: l.color,
        }));

      // Notificar a todos los miembros de la sala sin duplicar entregas
      this.server.to(targets).emit('room_participants_updated', {
        diagramId: data.diagramId,
        roomCode: targetRoom,
        participants: uniqueParticipants,
      });

      client.to(targets).emit('user_joined', {
        userId: data.userId,
        userName: data.userName,
        color,
        socketId: client.id,
      });

      const historyKey = this.getHistoryKey(data.diagramId, targetRoom);
      const recentChatMessages = historyKey ? [...(this.roomChatHistory.get(historyKey) ?? [])] : [];
      const recentActivityLogs = historyKey ? [...(this.roomActivityHistory.get(historyKey) ?? [])] : [];

      return {
        success: true,
        session,
        participants: uniqueParticipants,
        activeLocks: currentLocks,
        recentChatMessages,
        recentActivityLogs,
      };
    } catch (err) {
      this.logger.error(`Error en handleJoinRoom: ${err}`);
      return {
        success: false,
        session: null,
        participants: [],
        activeLocks: [],
        recentChatMessages: [],
        recentActivityLogs: [],
      };
    }
  }

  @SubscribeMessage('lock_node')
  handleLockNode(
    @MessageBody()
    data: {
      diagramId: string;
      roomCode?: string;
      nodeId: string;
      userId: string;
      userName: string;
      color?: string;
    },
    @ConnectedSocket() client: Socket,
  ): void {
    const lockKey = `${data.diagramId}_${data.nodeId}`;
    const existing = this.nodeLocks.get(lockKey);

    if (existing && existing.userId !== data.userId) {
      this.logger.warn(
        `[WebSocket] Rechazado bloqueo en nodo ${data.nodeId}: ya bloqueado por ${existing.userName}`,
      );
      client.emit('node_lock_rejected', {
        nodeId: data.nodeId,
        lockedBy: {
          userId: existing.userId,
          userName: existing.userName,
          color: existing.color,
        },
      });
      return;
    }

    const lockInfo: NodeLockInfo = {
      nodeId: data.nodeId,
      userId: data.userId,
      userName: data.userName,
      color: data.color || '#007ACC',
      diagramId: data.diagramId,
      lockedAt: Date.now(),
    };

    this.nodeLocks.set(lockKey, lockInfo);
    this.logger.log(
      `[WebSocket] Nodo ${data.nodeId} bloqueado con exclusión mutua por ${data.userName}`,
    );

    const broadcastPayload = {
      nodeId: data.nodeId,
      userId: data.userId,
      userName: data.userName,
      color: lockInfo.color,
    };

    const targets = this.getRoomTargets(data.diagramId, data.roomCode);
    if (targets.length > 0) {
      client.to(targets).emit('node_locked', broadcastPayload);
    }
  }

  @SubscribeMessage('unlock_node')
  handleUnlockNode(
    @MessageBody()
    data: {
      diagramId: string;
      roomCode?: string;
      nodeId: string;
      userId: string;
    },
    @ConnectedSocket() _client: Socket,
  ): void {
    const lockKey = `${data.diagramId}_${data.nodeId}`;
    this.nodeLocks.delete(lockKey);

    this.logger.log(`[WebSocket] Nodo ${data.nodeId} desbloqueado`);

    const broadcastPayload = {
      nodeId: data.nodeId,
      userId: data.userId,
    };

    const targets = this.getRoomTargets(data.diagramId, data.roomCode);
    if (targets.length > 0) {
      this.server.to(targets).emit('node_unlocked', broadcastPayload);
    }
  }

  // --- MÉTODOS PÚBLICOS DE BLOQUEO PARA COPILOT IA ---
  lockNodeForAi(
    diagramId: string,
    roomCode: string | undefined,
    nodeId: string,
    userName = '✨ Copilot IA',
    color = '#8B5CF6',
  ): void {
    try {
      if (!this.server) return;
      const lockKey = `${diagramId}_${nodeId}`;
      const lockInfo: NodeLockInfo = {
        nodeId,
        userId: 'ai_copilot_vertex',
        userName,
        color,
        diagramId,
        lockedAt: Date.now(),
      };
      this.nodeLocks.set(lockKey, lockInfo);

      const broadcastPayload = {
        nodeId,
        userId: 'ai_copilot_vertex',
        userName,
        color,
      };

      const targets = this.getRoomTargets(diagramId, roomCode);
      if (targets.length > 0) {
        this.server.to(targets).emit('node_locked', broadcastPayload);
      }
    } catch (e) {
      this.logger.warn(`No se pudo bloquear nodo para IA: ${e}`);
    }
  }

  unlockNodeForAi(
    diagramId: string,
    roomCode: string | undefined,
    nodeId: string,
  ): void {
    try {
      if (!this.server) return;
      const lockKey = `${diagramId}_${nodeId}`;
      this.nodeLocks.delete(lockKey);

      const broadcastPayload = {
        nodeId,
        userId: 'ai_copilot_vertex',
      };

      const targets = this.getRoomTargets(diagramId, roomCode);
      if (targets.length > 0) {
        this.server.to(targets).emit('node_unlocked', broadcastPayload);
      }
    } catch (e) {
      this.logger.warn(`No se pudo desbloquear nodo para IA: ${e}`);
    }
  }

  emitProjectPermissionsUpdated(
    diagramIds: string[],
    payload: {
      projectId: string;
      userId: string;
      role?: string;
      canDownloadCode?: boolean;
      removed?: boolean;
    },
  ): void {
    try {
      if (!this.server || !diagramIds.length) return;
      const targets = Array.from(
        new Set(diagramIds.filter(Boolean).map((id) => `diagram_${id}`)),
      );
      if (targets.length > 0) {
        this.server.to(targets).emit('project_permissions_updated', {
          ...payload,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e) {
      this.logger.warn(`No se pudo emitir actualización de permisos: ${e}`);
    }
  }

  @SubscribeMessage('leave_room')
  async handleLeaveRoom(
    @MessageBody() data: { diagramId?: string; roomCode?: string; userId: string; sessionId?: string },
    @ConnectedSocket() client: Socket,
  ): Promise<{ success: boolean }> {
    if (data.roomCode) client.leave(data.roomCode);
    if (data.diagramId) client.leave(`diagram_${data.diagramId}`);

    if (data.sessionId && data.userId) {
      await this.yjsSyncService.leaveSession(data.sessionId, data.userId);
    }

    this.clientMap.delete(client.id);
    return { success: true };
  }

  @SubscribeMessage('cursor_move')
  handleCursorMove(
    @MessageBody()
    data: {
      diagramId?: string;
      roomCode?: string;
      userId: string;
      userName: string;
      x: number;
      y: number;
      color?: string;
    },
    @ConnectedSocket() client: Socket,
  ): void {
    const payload = {
      userId: data.userId,
      userName: data.userName,
      x: data.x,
      y: data.y,
      color: data.color || '#007ACC',
    };

    const targets = this.getRoomTargets(data.diagramId, data.roomCode);
    if (targets.length > 0) {
      client.to(targets).emit('cursor_moved', payload);
    }
  }

  @SubscribeMessage('node_drag')
  handleNodeDrag(
    @MessageBody()
    data: {
      diagramId?: string;
      roomCode?: string;
      nodeId: string;
      position: { x: number; y: number };
      userId: string;
    },
    @ConnectedSocket() client: Socket,
  ): void {
    const payload = {
      nodeId: data.nodeId,
      position: data.position,
      userId: data.userId,
    };

    const targets = this.getRoomTargets(data.diagramId, data.roomCode);
    if (targets.length > 0) {
      client.to(targets).emit('node_dragged', payload);
    }
  }

  @SubscribeMessage('diagram_sync')
  handleDiagramSync(
    @MessageBody()
    data: {
      diagramId?: string;
      roomCode?: string;
      nodes: any[];
      connections: any[];
      userId: string;
      action?: string;
    },
    @ConnectedSocket() client: Socket,
  ): void {
    const payload = {
      nodes: data.nodes,
      connections: data.connections,
      userId: data.userId,
      action: data.action || 'update',
    };

    const targets = this.getRoomTargets(data.diagramId, data.roomCode);
    if (targets.length > 0) {
      client.to(targets).emit('diagram_synced', payload);
    }
  }

  @SubscribeMessage('chat_message')
  handleChatMessage(
    @MessageBody()
    data: {
      diagramId?: string;
      roomCode?: string;
      userId: string;
      userName: string;
      message: string;
      color?: string;
    },
  ): void {
    const cleanMessage = data.message?.trim();
    if (!cleanMessage) return;

    const payload: ChatMessageRecord = {
      id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: data.userId,
      userName: data.userName,
      message: cleanMessage,
      color: data.color,
      timestamp: new Date().toISOString(),
    };

    this.appendBoundedHistory(
      this.roomChatHistory,
      this.getHistoryKey(data.diagramId, data.roomCode),
      payload,
    );

    const targets = this.getRoomTargets(data.diagramId, data.roomCode);
    if (targets.length > 0) {
      this.server.to(targets).emit('chat_message_received', payload);
    }
  }

  @SubscribeMessage('activity_log')
  handleActivityLog(
    @MessageBody()
    data: {
      diagramId?: string;
      roomCode?: string;
      userId: string;
      userName: string;
      action: string;
      detail?: string;
      category?: ActivityLogRecord['category'];
      color?: string;
    },
  ): void {
    const cleanAction = data.action?.trim();
    if (!cleanAction) return;

    const payload: ActivityLogRecord = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: data.userId,
      userName: data.userName,
      action: cleanAction,
      detail: data.detail,
      category: data.category || 'uml',
      color: data.color,
      timestamp: new Date().toISOString(),
    };

    this.appendBoundedHistory(
      this.roomActivityHistory,
      this.getHistoryKey(data.diagramId, data.roomCode),
      payload,
    );

    const targets = this.getRoomTargets(data.diagramId, data.roomCode);
    if (targets.length > 0) {
      this.server.to(targets).emit('activity_logged', payload);
    }
  }
}
