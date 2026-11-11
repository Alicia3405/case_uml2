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
import { Inject, Logger, Optional } from '@nestjs/common';
import { YjsSyncService } from '../services/yjs-sync.service';
import { DiagramRepository } from '../../diagrams/repositories/diagram.repository';
import type { AiAssistantService } from '../../ai-assistant/services/ai-assistant.service';
import { getAllowedCorsOrigins } from '../../../config/cors.config';
import { isValidUuid } from '../../../common/utils/mongoose-entity.util';
import { AiInteractionMode, RoomSenderType } from '../entities/room-message.entity';

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
  senderType?: RoomSenderType;
  aiMode?: AiInteractionMode | null;
  requestedByUserName?: string | null;
  targetNodes?: string[];
  mutatedDiagram?: boolean;
  providerUsed?: string | null;
  modelUsed?: string | null;
  sessionNumber?: number;
  sessionDate?: string;
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
  actorType?: 'human' | 'ai';
  affectedClasses?: string[];
  sessionNumber?: number;
  sessionDate?: string;
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

  constructor(
    private readonly yjsSyncService: YjsSyncService,
    @Optional()
    @Inject('AI_ASSISTANT_SERVICE')
    private readonly aiAssistantService?: AiAssistantService,
    @Optional()
    private readonly diagramRepository?: DiagramRepository,
  ) {}

  private getRoomTargets(diagramId?: string, roomCode?: string): string[] {
    return Array.from(
      new Set([diagramId ? `diagram_${diagramId}` : '', roomCode || ''].filter(Boolean)),
    );
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

      const targets = this.getRoomTargets(meta.diagramId, meta.roomCode);

      // Liberar cualquier bloqueo de tabla que tuviera este usuario
      const locksToRelease: string[] = [];
      for (const [lockKey, lockInfo] of this.nodeLocks.entries()) {
        if (lockInfo.userId === meta.userId && lockInfo.diagramId === meta.diagramId) {
          locksToRelease.push(lockKey);
          if (targets.length > 0 && this.server) {
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
        new Map(
          connectedClients.map((c) => [
            c.userId,
            {
              userId: c.userId,
              userName: c.userName,
              color: c.color,
              isConnected: true,
            },
          ]),
        ).values(),
      );

      if (meta.sessionId) {
        try {
          const transfer = await this.yjsSyncService.handleHostDisconnectOrTransfer(
            meta.sessionId,
            meta.userId,
            uniqueParticipants.map((p) => p.userId),
          );
          if (transfer?.transferred && targets.length > 0 && this.server) {
            this.server.to(targets).emit('host_transferred', transfer);
          }
        } catch (err: any) {
          this.logger.warn(`No se pudo evaluar traspaso de anfitrión: ${err?.message || err}`);
        }
      }

      if (targets.length > 0 && this.server) {
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
      // Validar tanto diagramId como userId como UUID reales para evitar errores con IDs anónimos (ej. anon_xxx)
      if (!isValidUuid(data?.diagramId)) {
        this.logger.warn(
          `[WebSocket] join_room ignorado: diagramId inválido "${data?.diagramId}" (no es UUID)`,
        );
        return {
          success: false,
          session: null,
          participants: [],
          activeLocks: [],
          recentChatMessages: [],
          recentActivityLogs: [],
        };
      }

      if (!isValidUuid(data?.userId)) {
        this.logger.warn(
          `[WebSocket] join_room rechazado: userId inválido "${data?.userId}" (sesión no autenticada)`,
        );
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

      const connectedClients = Array.from(this.clientMap.values()).filter(
        (c) => c.diagramId === data.diagramId || c.roomCode === targetRoom,
      );

      const uniqueParticipants = Array.from(
        new Map(
          connectedClients.map((c) => [
            c.userId,
            {
              userId: c.userId,
              userName: c.userName,
              color: c.color,
              isConnected: true,
            },
          ]),
        ).values(),
      );

      const currentLocks = Array.from(this.nodeLocks.values())
        .filter((l) => l.diagramId === data.diagramId)
        .map((l) => ({
          nodeId: l.nodeId,
          userId: l.userId,
          userName: l.userName,
          color: l.color,
        }));

      this.server?.to(targets).emit('room_participants_updated', {
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

      // Hidratar historial persistente desde MongoDB (continuidad entre sesiones/días)
      const persistedHistory = await this.yjsSyncService.getRoomHistory(data.diagramId, 80);

      return {
        success: true,
        session,
        participants: uniqueParticipants,
        activeLocks: currentLocks,
        recentChatMessages: persistedHistory.recentChatMessages,
        recentActivityLogs: persistedHistory.recentActivityLogs,
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
    if (targets.length > 0 && this.server) {
      this.server.to(targets).emit('node_unlocked', broadcastPayload);
    }
  }

  // --- MÉTODOS PÚBLICOS PARA COPILOT IA Y EVENTOS DEL BACKEND ---
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

  async broadcastAiGroupMessage(
    diagramId: string,
    roomCode: string | undefined,
    params: {
      message: string;
      aiMode?: AiInteractionMode;
      requestedByUserId?: string;
      requestedByUserName?: string;
      targetNodes?: string[];
      mutatedDiagram?: boolean;
      providerUsed?: string;
      modelUsed?: string;
      userName?: string;
      color?: string;
    },
  ): Promise<ChatMessageRecord> {
    const cleanMessage = params.message?.trim() || '';
    const { savedMessage } = await this.yjsSyncService.recordChatMessage({
      diagramId,
      roomCode,
      senderType: 'ai',
      userId: 'ai_copilot_partner',
      userName: params.userName || '✨ Copilot IA',
      message: cleanMessage,
      color: params.color || '#8B5CF6',
      aiMode: params.aiMode,
      requestedByUserId: params.requestedByUserId,
      requestedByUserName: params.requestedByUserName,
      targetNodes: params.targetNodes,
      mutatedDiagram: params.mutatedDiagram,
      providerUsed: params.providerUsed,
      modelUsed: params.modelUsed,
    });

    const payload: ChatMessageRecord = {
      id: savedMessage?.id || `ai_msg_${Date.now()}`,
      userId: 'ai_copilot_partner',
      userName: params.userName || '✨ Copilot IA',
      message: cleanMessage,
      color: params.color || '#8B5CF6',
      timestamp: savedMessage?.createdAt
        ? new Date(savedMessage.createdAt).toISOString()
        : new Date().toISOString(),
      senderType: 'ai',
      aiMode: params.aiMode || 'ADVISE',
      requestedByUserName: params.requestedByUserName ?? null,
      targetNodes: params.targetNodes || [],
      mutatedDiagram: Boolean(params.mutatedDiagram),
      providerUsed: params.providerUsed ?? null,
      modelUsed: params.modelUsed ?? null,
      sessionNumber: savedMessage?.sessionNumber,
      sessionDate: savedMessage?.sessionDate,
    };

    const targets = this.getRoomTargets(diagramId, roomCode);
    if (targets.length > 0 && this.server) {
      this.server.to(targets).emit('chat_message_received', payload);
    }

    return payload;
  }

  broadcastActivityRecord(
    diagramId: string,
    roomCode: string | undefined,
    payload: ActivityLogRecord,
  ): void {
    try {
      const targets = this.getRoomTargets(diagramId, roomCode);
      if (targets.length > 0 && this.server) {
        this.server.to(targets).emit('activity_logged', payload);
      }
    } catch (e) {
      this.logger.warn(`No se pudo emitir activity_logged: ${e}`);
    }
  }

  broadcastNotification(
    diagramId: string,
    roomCode: string | undefined,
    notification: any,
  ): void {
    try {
      const targets = this.getRoomTargets(diagramId, roomCode);
      if (targets.length > 0 && this.server && notification) {
        this.server.to(targets).emit('notification_created', notification);
      }
    } catch (e) {
      this.logger.warn(`No se pudo emitir notification_created: ${e}`);
    }
  }

  broadcastAiAnnotationsUpdated(
    diagramId: string,
    roomCode: string | undefined,
    aiAnnotations: any[],
  ): void {
    try {
      const targets = this.getRoomTargets(diagramId, roomCode);
      if (targets.length > 0 && this.server) {
        this.server.to(targets).emit('ai_annotations_updated', {
          diagramId,
          aiAnnotations,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e) {
      this.logger.warn(`No se pudo emitir ai_annotations_updated: ${e}`);
    }
  }

  emitDiagramSynced(
    diagramId: string,
    roomCode: string | undefined,
    payload: {
      nodes: any[];
      connections: any[];
      userId: string;
      action?: string;
      aiAnnotations?: any[];
    },
  ): void {
    try {
      const targets = this.getRoomTargets(diagramId, roomCode);
      if (targets.length > 0 && this.server) {
        this.server.to(targets).emit('diagram_synced', payload);
      }
    } catch (e) {
      this.logger.warn(`No se pudo emitir diagram_synced: ${e}`);
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
    @MessageBody()
    data: { diagramId?: string; roomCode?: string; userId: string; sessionId?: string },
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
  async handleChatMessage(
    @MessageBody()
    data: {
      diagramId?: string;
      roomCode?: string;
      userId: string;
      userName: string;
      message: string;
      color?: string;
      currentNodes?: any[];
      currentConnections?: any[];
    },
  ): Promise<void> {
    const cleanMessage = data.message?.trim();
    if (!cleanMessage) return;

    const { savedMessage, notifications } = await this.yjsSyncService.recordChatMessage({
      diagramId: data.diagramId,
      roomCode: data.roomCode,
      senderType: 'human',
      userId: data.userId,
      userName: data.userName,
      message: cleanMessage,
      color: data.color,
    });

    const payload: ChatMessageRecord = {
      id: savedMessage?.id || `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: data.userId,
      userName: data.userName,
      message: cleanMessage,
      color: data.color,
      timestamp: savedMessage?.createdAt
        ? new Date(savedMessage.createdAt).toISOString()
        : new Date().toISOString(),
      senderType: 'human',
      sessionNumber: savedMessage?.sessionNumber,
      sessionDate: savedMessage?.sessionDate,
    };

    const targets = this.getRoomTargets(data.diagramId, data.roomCode);
    if (targets.length > 0 && this.server) {
      this.server.to(targets).emit('chat_message_received', payload);
      for (const notif of notifications) {
        this.server.to(targets).emit('notification_created', notif);
      }
    }

    // Si alguien menciona @IA o @copilot en el chat grupal, el compañero Copilot responde a toda la sala
    const mentionsCopilot = /(?:^|\s)@(?:ia|copilot)\b/i.test(cleanMessage);
    if (
      mentionsCopilot &&
      !data.userId.startsWith('ai_') &&
      data.diagramId &&
      isValidUuid(data.diagramId) &&
      this.aiAssistantService
    ) {
      const cleanPrompt =
        cleanMessage.replace(/(?:^|\s)@(?:ia|copilot)[:,]?\s*/gi, ' ').trim() ||
        'Revisa el diagrama actual y aporta observaciones para el equipo.';
      try {
        const hasClientNodes = Array.isArray(data.currentNodes);
        const hasClientConns = Array.isArray(data.currentConnections);
        const diagram = (!hasClientNodes || !hasClientConns) && this.diagramRepository
          ? await this.diagramRepository.findById(data.diagramId)
          : null;
        const currentNodes = hasClientNodes
          ? data.currentNodes!
          : (diagram?.nodes || []).map((n) => ({
              id: n.id,
              name: n.name,
              elementType: n.elementType,
              stereotype: n.stereotype,
              noteContent: n.noteContent,
              position: { x: Number(n.positionX) || 0, y: Number(n.positionY) || 0 },
              width: n.width,
              height: n.height ?? undefined,
              isAnchor: n.isAnchor,
              assocMainConnId: n.assocMainConnId ?? undefined,
              createdByName: n.createdByName ?? null,
              lastModifiedByName: n.lastModifiedByName ?? null,
              attributes: (n.attributes || []).map((a) => ({
                name: a.name,
                type: a.type,
                visibility: a.visibility,
                isPrimaryKey: a.isPrimaryKey,
                isNullable: a.isNullable,
              })),
              methods: (n.methods || []).map((m) => ({
                name: m.name,
                parameters: m.parameters,
                returnType: m.returnType,
                visibility: m.visibility,
              })),
            }));
        const currentConnections = hasClientConns
          ? data.currentConnections!
          : (diagram?.connections || []).map((c) => ({
              id: c.id,
              sourceNodeId: c.sourceNodeId,
              targetNodeId: c.targetNodeId,
              sourceId: c.sourceId,
              targetId: c.targetId,
              type: c.type,
              lineStyle: c.lineStyle,
              name: c.name ?? undefined,
              sourceMultiplicity: c.sourceMultiplicity,
              targetMultiplicity: c.targetMultiplicity,
              assocAnchorNodeId: c.assocAnchorNodeId ?? undefined,
            }));

        await this.aiAssistantService.processTextPrompt({
          prompt: cleanPrompt,
          diagramId: data.diagramId,
          roomCode: data.roomCode || savedMessage?.roomCode || undefined,
          authorUserId: isValidUuid(data.userId) ? data.userId : undefined,
          authorUserName: data.userName,
          currentNodes,
          currentConnections,
          broadcastToRoom: true,
          createWhiteboardNotes: true,
          persistChanges: true,
        });
      } catch (err: any) {
        this.logger.warn(
          `[WebSocket] No se pudo responder a @IA en chat grupal: ${err?.message || err}`,
        );
      }
    }
  }

  @SubscribeMessage('activity_log')
  async handleActivityLog(
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
      affectedClasses?: string[];
    },
  ): Promise<void> {
    const cleanAction = data.action?.trim();
    if (!cleanAction) return;

    const saved = await this.yjsSyncService.recordAuthorEvent({
      diagramId: data.diagramId,
      roomCode: data.roomCode,
      actorType: data.userId.startsWith('ai_') ? 'ai' : 'human',
      userId: data.userId,
      userName: data.userName,
      action: cleanAction,
      detail: data.detail,
      category: data.category || 'uml',
      color: data.color,
      affectedClasses: data.affectedClasses,
    });

    const payload: ActivityLogRecord = {
      id: saved?.id || `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: data.userId,
      userName: data.userName,
      action: cleanAction,
      detail: data.detail,
      category: data.category || 'uml',
      color: data.color,
      timestamp: saved?.createdAt
        ? new Date(saved.createdAt).toISOString()
        : new Date().toISOString(),
      actorType: saved?.actorType || (data.userId.startsWith('ai_') ? 'ai' : 'human'),
      affectedClasses: saved?.affectedClasses || data.affectedClasses || [],
      sessionNumber: saved?.sessionNumber,
      sessionDate: saved?.sessionDate,
    };

    const targets = this.getRoomTargets(data.diagramId, data.roomCode);
    if (targets.length > 0 && this.server) {
      this.server.to(targets).emit('activity_logged', payload);
    }
  }
}
