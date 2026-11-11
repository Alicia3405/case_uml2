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

  constructor(private readonly yjsSyncService: YjsSyncService) { }

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

      // Liberar cualquier bloqueo de tabla que tuviera este usuario
      const locksToRelease: string[] = [];
      for (const [lockKey, lockInfo] of this.nodeLocks.entries()) {
        if (lockInfo.userId === meta.userId && lockInfo.diagramId === meta.diagramId) {
          locksToRelease.push(lockKey);
          this.server
            .to(meta.roomCode)
            .to(`diagram_${meta.diagramId}`)
            .emit('node_unlocked', {
              nodeId: lockInfo.nodeId,
              userId: meta.userId,
            });
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

      this.server.to(meta.roomCode).to(`diagram_${meta.diagramId}`).emit('user_left', {
        userId: meta.userId,
        userName: meta.userName,
        socketId: client.id,
      });

      this.server.to(meta.roomCode).to(`diagram_${meta.diagramId}`).emit('room_participants_updated', {
        diagramId: meta.diagramId,
        roomCode: meta.roomCode,
        participants: uniqueParticipants,
      });
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
  ): Promise<{ success: boolean; session: any; participants: any[]; activeLocks: any[] }> {
    try {
      // Validar que el diagramId sea un UUID válido antes de consultar la BD
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!data.diagramId || !uuidRegex.test(data.diagramId)) {
        this.logger.warn(`[WebSocket] join_room ignorado: diagramId inválido "${data.diagramId}" (no es UUID)`);
        return { success: false, session: null, participants: [], activeLocks: [] };
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

      // Notificar a todos los miembros de la sala
      this.server.to(targetRoom).to(diagramRoom).emit('room_participants_updated', {
        diagramId: data.diagramId,
        roomCode: targetRoom,
        participants: uniqueParticipants,
      });

      client.to(targetRoom).to(diagramRoom).emit('user_joined', {
        userId: data.userId,
        userName: data.userName,
        color,
        socketId: client.id,
      });

      return {
        success: true,
        session,
        participants: uniqueParticipants,
        activeLocks: currentLocks,
      };
    } catch (err) {
      this.logger.error(`Error en handleJoinRoom: ${err}`);
      return {
        success: false,
        session: null,
        participants: [],
        activeLocks: [],
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

    if (data.diagramId) {
      client.to(`diagram_${data.diagramId}`).emit('node_locked', broadcastPayload);
    }
    if (data.roomCode) {
      client.to(data.roomCode).emit('node_locked', broadcastPayload);
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
    @ConnectedSocket() client: Socket,
  ): void {
    const lockKey = `${data.diagramId}_${data.nodeId}`;
    this.nodeLocks.delete(lockKey);

    this.logger.log(`[WebSocket] Nodo ${data.nodeId} desbloqueado`);

    const broadcastPayload = {
      nodeId: data.nodeId,
      userId: data.userId,
    };

    if (data.diagramId) {
      this.server.to(`diagram_${data.diagramId}`).emit('node_unlocked', broadcastPayload);
    }
    if (data.roomCode) {
      this.server.to(data.roomCode).emit('node_unlocked', broadcastPayload);
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

      if (diagramId) {
        this.server.to(`diagram_${diagramId}`).emit('node_locked', broadcastPayload);
      }
      if (roomCode) {
        this.server.to(roomCode).emit('node_locked', broadcastPayload);
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

      if (diagramId) {
        this.server.to(`diagram_${diagramId}`).emit('node_unlocked', broadcastPayload);
      }
      if (roomCode) {
        this.server.to(roomCode).emit('node_unlocked', broadcastPayload);
      }
    } catch (e) {
      this.logger.warn(`No se pudo desbloquear nodo para IA: ${e}`);
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

    if (data.diagramId) {
      client.to(`diagram_${data.diagramId}`).emit('cursor_moved', payload);
    }
    if (data.roomCode) {
      client.to(data.roomCode).emit('cursor_moved', payload);
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

    if (data.diagramId) {
      client.to(`diagram_${data.diagramId}`).emit('node_dragged', payload);
    }
    if (data.roomCode) {
      client.to(data.roomCode).emit('node_dragged', payload);
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

    if (data.diagramId) {
      client.to(`diagram_${data.diagramId}`).emit('diagram_synced', payload);
    }
    if (data.roomCode) {
      client.to(data.roomCode).emit('diagram_synced', payload);
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
    },
  ): void {
    const payload = {
      userId: data.userId,
      userName: data.userName,
      message: data.message,
      timestamp: new Date().toISOString(),
    };

    if (data.diagramId) {
      this.server.to(`diagram_${data.diagramId}`).emit('chat_message_received', payload);
    }
    if (data.roomCode) {
      this.server.to(data.roomCode).emit('chat_message_received', payload);
    }
  }
}
