import { Injectable, signal, inject, effect, untracked } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { UmlClassNode, UmlConnection } from '../models/diagram.model';
import { User } from '../models/user.model';
import { environment } from '../../../environments/environment';

export interface RemoteCursor {
  userId: string;
  userName: string;
  x: number;
  y: number;
  color: string;
}

export interface Collaborator {
  userId: string;
  userName: string;
  color: string;
  isConnected: boolean;
}

export interface NodeLock {
  nodeId: string;
  userId: string;
  userName: string;
  color: string;
}

export interface ChatMessage {
  id?: string;
  userId: string;
  userName: string;
  message: string;
  color?: string;
  timestamp: string;
  senderType?: 'human' | 'ai' | 'system';
  aiMode?: 'MUTATE' | 'ADVISE' | 'REVIEW' | 'DISCIPLINE' | 'RECAP' | null;
  requestedByUserName?: string | null;
  targetNodes?: string[];
  mutatedDiagram?: boolean;
  providerUsed?: string | null;
  modelUsed?: string | null;
  sessionNumber?: number;
  sessionDate?: string;
}

export type ActivityCategory = 'uml' | 'ai' | 'voice' | 'permission' | 'system';

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  detail?: string;
  category: ActivityCategory;
  color?: string;
  timestamp: string;
  actorType?: 'human' | 'ai';
  affectedClasses?: string[];
  sessionNumber?: number;
  sessionDate?: string;
}

export interface SessionContinuityMeta {
  id: string;
  diagramId: string;
  roomCode: string;
  hostUserId?: string | null;
  hostUserName?: string | null;
  sessionNumber?: number;
  activeDateKeys?: string[];
  lastActiveDay?: string;
  resumeSummary?: string;
  lastActivityAt?: string;
}

export interface ProjectPermissionsUpdatedEvent {
  projectId: string;
  userId: string;
  role?: string;
  canDownloadCode?: boolean;
  removed?: boolean;
  timestamp?: string;
}

@Injectable({
  providedIn: 'root',
})
export class CollaborationService {
  private readonly authService = inject(AuthService);
  private socket: Socket | null = null;
  private readonly socketUrl = environment.socketUrl;
  private readonly uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  private pendingJoin: { diagramId: string; customRoomCode?: string } | null = null;

  readonly isConnected = signal<boolean>(false);
  readonly activeRoomCode = signal<string | null>(null);
  readonly sessionMeta = signal<SessionContinuityMeta | null>(null);
  readonly currentDiagramId = signal<string | null>(null);
  readonly myColor = signal<string>('#3B82F6');
  readonly collaborators = signal<Collaborator[]>([]);
  readonly remoteCursors = signal<RemoteCursor[]>([]);
  readonly activeNodeLocks = signal<Map<string, NodeLock>>(new Map());
  readonly chatMessages = signal<ChatMessage[]>([]);
  readonly activityLogs = signal<ActivityLog[]>([]);
  readonly unreadChatCount = signal<number>(0);
  readonly isChatPanelVisible = signal<boolean>(false);
  readonly notifications = signal<any[]>([]);

  // Observables para cambios remotos
  readonly remoteNodeDrag$ = new Subject<{ nodeId: string; position: { x: number; y: number }; userId: string }>();
  readonly remoteDiagramSync$ = new Subject<{ nodes: UmlClassNode[]; connections: UmlConnection[]; userId: string; action: string; aiAnnotations?: any[] }>();
  readonly nodeLockRejected$ = new Subject<{ nodeId: string; lockedBy: NodeLock }>();
  readonly projectPermissionsUpdated$ = new Subject<ProjectPermissionsUpdatedEvent>();
  readonly hostTransferred$ = new Subject<any>();
  readonly aiAnnotationsUpdated$ = new Subject<{ diagramId: string; aiAnnotations: any[] }>();
  readonly notificationReceived$ = new Subject<any>();

  private readonly MAX_CLIENT_HISTORY = 100;

  // Control de frecuencia de cursores
  private lastCursorSent = 0;

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      if (user?.id && this.uuidRegex.test(user.id)) {
        untracked(() => {
          if (this.pendingJoin && this.socket?.connected) {
            const { diagramId, customRoomCode } = this.pendingJoin;
            this.pendingJoin = null;
            this.emitJoinRoom(diagramId, customRoomCode);
          }
        });
      }
    });
  }

  private getCurrentUser(): User | null {
    const fromAuth = this.authService.currentUser();
    if (fromAuth) return fromAuth;

    try {
      const stored = localStorage.getItem('uml_studio_user');
      if (stored) return JSON.parse(stored);
    } catch {}
    return null;
  }

  connect(): void {
    if (this.socket) {
      if (!this.socket.connected) {
        this.socket.connect();
      }
      return;
    }

    this.socket = io(this.socketUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      this.isConnected.set(true);
      const diagramId = this.currentDiagramId();
      if (diagramId) {
        this.emitJoinRoom(diagramId);
      }
    });

    this.socket.on('disconnect', () => {
      this.isConnected.set(false);
      this.remoteCursors.set([]);
      this.activeNodeLocks.set(new Map());
    });

    this.socket.on('room_participants_updated', (data: { diagramId?: string; roomCode?: string; participants: Collaborator[] }) => {
      if (data && data.participants) {
        this.collaborators.set(data.participants);
      }
      if (data && data.roomCode) {
        this.activeRoomCode.set(data.roomCode);
      }
    });

    this.socket.on('user_joined', (data: { userId: string; userName: string; color: string }) => {
      this.collaborators.update((list) => {
        if (!list.some((c) => c.userId === data.userId)) {
          return [...list, { userId: data.userId, userName: data.userName, color: data.color, isConnected: true }];
        }
        return list;
      });
    });

    this.socket.on('user_left', (data: { userId: string; userName?: string }) => {
      this.collaborators.update((list) => list.filter((c) => c.userId !== data.userId));
      this.remoteCursors.update((cursors) => cursors.filter((c) => c.userId !== data.userId));
      
      // Limpiar bloqueos de este usuario si quedaron
      this.activeNodeLocks.update((map) => {
        const next = new Map(map);
        for (const [nodeId, lock] of next.entries()) {
          if (lock.userId === data.userId) {
            next.delete(nodeId);
          }
        }
        return next;
      });
    });

    this.socket.on('node_locked', (lock: NodeLock) => {
      this.activeNodeLocks.update((map) => {
        const next = new Map(map);
        next.set(lock.nodeId, lock);
        return next;
      });
    });

    this.socket.on('node_lock_rejected', (data: { nodeId: string; lockedBy: NodeLock }) => {
      this.activeNodeLocks.update((map) => {
        const next = new Map(map);
        next.set(data.nodeId, data.lockedBy);
        return next;
      });
      this.nodeLockRejected$.next(data);
    });

    this.socket.on('node_unlocked', (data: { nodeId: string; userId: string }) => {
      this.activeNodeLocks.update((map) => {
        const next = new Map(map);
        next.delete(data.nodeId);
        return next;
      });
    });

    this.socket.on('cursor_moved', (data: RemoteCursor) => {
      const currentUserId = this.getCurrentUser()?.id;
      if (data.userId === currentUserId) return;

      this.remoteCursors.update((cursors) => {
        const index = cursors.findIndex((c) => c.userId === data.userId);
        if (index >= 0) {
          const updated = [...cursors];
          updated[index] = data;
          return updated;
        }
        return [...cursors, data];
      });
    });

    this.socket.on('node_dragged', (data: { nodeId: string; position: { x: number; y: number }; userId: string }) => {
      const currentUserId = this.getCurrentUser()?.id;
      if (data.userId === currentUserId) return;
      this.remoteNodeDrag$.next(data);
    });

    this.socket.on('diagram_synced', (data: { nodes: UmlClassNode[]; connections: UmlConnection[]; userId: string; action: string; aiAnnotations?: any[] }) => {
      const currentUserId = this.getCurrentUser()?.id;
      if (data.userId === currentUserId) return;
      this.remoteDiagramSync$.next(data);
    });

    this.socket.on('host_transferred', (transfer: any) => {
      if (!transfer) return;
      this.sessionMeta.update((prev) =>
        prev
          ? {
              ...prev,
              hostUserId: transfer.newHostUserId ?? null,
              hostUserName: transfer.newHostUserName ?? null,
            }
          : prev,
      );
      this.hostTransferred$.next(transfer);
    });

    this.socket.on('ai_annotations_updated', (payload: { diagramId: string; aiAnnotations: any[] }) => {
      if (payload?.diagramId) {
        this.aiAnnotationsUpdated$.next(payload);
      }
    });

    this.socket.on('notification_created', (notif: any) => {
      if (!notif) return;
      this.notifications.update((list) => {
        if (notif.id && list.some((n) => n.id === notif.id)) return list;
        return [notif, ...list].slice(0, 50);
      });
      this.notificationReceived$.next(notif);
    });

    this.socket.on('chat_message_received', (msg: ChatMessage) => {
      if (!msg || !msg.message) return;
      if (msg.id && this.chatMessages().some((m) => m.id === msg.id)) {
        return;
      }
      this.chatMessages.update((list) => {
        if (msg.id && list.some((m) => m.id === msg.id)) {
          return list;
        }
        const next = [...list, msg];
        return next.length > this.MAX_CLIENT_HISTORY
          ? next.slice(next.length - this.MAX_CLIENT_HISTORY)
          : next;
      });
      const currentUserId = this.getCurrentUser()?.id;
      if (!this.isChatPanelVisible() && msg.userId !== currentUserId) {
        this.unreadChatCount.update((c) => c + 1);
      }
    });

    this.socket.on('activity_logged', (entry: ActivityLog) => {
      if (!entry || !entry.action) return;
      this.activityLogs.update((list) => {
        if (entry.id && list.some((a) => a.id === entry.id)) {
          return list;
        }
        const next = [...list, entry];
        return next.length > this.MAX_CLIENT_HISTORY
          ? next.slice(next.length - this.MAX_CLIENT_HISTORY)
          : next;
      });
    });

    this.socket.on('project_permissions_updated', (event: ProjectPermissionsUpdatedEvent) => {
      if (event && event.projectId && event.userId) {
        this.projectPermissionsUpdated$.next(event);
      }
    });
  }

  joinRoom(diagramId: string, customRoomCode?: string): void {
    const previousId = this.currentDiagramId();
    if (previousId && previousId !== diagramId) {
      this.chatMessages.set([]);
      this.activityLogs.set([]);
      this.unreadChatCount.set(0);
      this.remoteCursors.set([]);
      this.activeNodeLocks.set(new Map());
    }
    this.currentDiagramId.set(diagramId);
    this.connect();

    if (this.socket && this.socket.connected) {
      this.emitJoinRoom(diagramId, customRoomCode);
    }
  }

  private emitJoinRoom(diagramId: string, customRoomCode?: string): void {
    const user = this.getCurrentUser();
    if (!user?.id || !this.uuidRegex.test(user.id) || !this.uuidRegex.test(diagramId)) {
      this.pendingJoin = { diagramId, customRoomCode };
      return;
    }
    this.pendingJoin = null;

    const userId = user.id;
    const userName = user.fullName || user.email || 'Colaborador';

    const assignedColor = this.generateUserColor(userName + userId);
    this.myColor.set(assignedColor);

    this.socket?.emit(
      'join_room',
      {
        diagramId,
        roomCode: customRoomCode,
        userId,
        userName,
        color: assignedColor,
      },
      (res: {
        success: boolean;
        session: any;
        participants?: Collaborator[];
        activeLocks?: NodeLock[];
        recentChatMessages?: ChatMessage[];
        recentActivityLogs?: ActivityLog[];
      }) => {
        if (res && res.success && res.session) {
          this.activeRoomCode.set(res.session.roomCode);
          this.sessionMeta.set(res.session);
          if (res.participants) {
            this.collaborators.set(res.participants);
          }
          if (res.activeLocks) {
            const map = new Map<string, NodeLock>();
            for (const lock of res.activeLocks) {
              map.set(lock.nodeId, lock);
            }
            this.activeNodeLocks.set(map);
          }
          if (res.recentChatMessages) {
            this.chatMessages.set(res.recentChatMessages);
          }
          if (res.recentActivityLogs) {
            this.activityLogs.set(res.recentActivityLogs);
          }
        }
      },
    );
  }

  leaveRoom(): void {
    this.pendingJoin = null;
    const user = this.getCurrentUser();
    const roomCode = this.activeRoomCode();
    const diagramId = this.currentDiagramId();
    if (this.socket && user) {
      this.socket.emit('leave_room', {
        roomCode,
        diagramId,
        userId: user.id,
      });
    }
    this.activeRoomCode.set(null);
    this.sessionMeta.set(null);
    this.remoteCursors.set([]);
    this.collaborators.set([]);
    this.activeNodeLocks.set(new Map());
    this.chatMessages.set([]);
    this.activityLogs.set([]);
    this.unreadChatCount.set(0);
  }

  requestNodeLock(nodeId: string): void {
    const user = this.getCurrentUser();
    const diagramId = this.currentDiagramId();
    const roomCode = this.activeRoomCode();

    const currentLock: NodeLock = {
      nodeId,
      userId: user?.id || 'anon',
      userName: user?.fullName || user?.email || 'Usuario',
      color: this.myColor(),
    };

    this.activeNodeLocks.update((map) => {
      const next = new Map(map);
      next.set(nodeId, currentLock);
      return next;
    });

    if (!this.socket || !diagramId || !user) return;

    this.socket.emit('lock_node', {
      diagramId,
      roomCode,
      nodeId,
      userId: user.id,
      userName: user.fullName || user.email || 'Usuario',
      color: this.myColor(),
    });
  }

  releaseNodeLock(nodeId: string): void {
    const user = this.getCurrentUser();
    const diagramId = this.currentDiagramId();
    const roomCode = this.activeRoomCode();

    this.activeNodeLocks.update((map) => {
      const next = new Map(map);
      next.delete(nodeId);
      return next;
    });

    if (!this.socket || !diagramId || !user) return;

    this.socket.emit('unlock_node', {
      diagramId,
      roomCode,
      nodeId,
      userId: user.id,
    });
  }

  sendCursorPosition(x: number, y: number): void {
    const now = Date.now();
    if (now - this.lastCursorSent < 25) return; // ~40 fps
    this.lastCursorSent = now;

    const user = this.getCurrentUser();
    const diagramId = this.currentDiagramId();
    const roomCode = this.activeRoomCode();
    if (!this.socket || !diagramId) return;

    this.socket.emit('cursor_move', {
      diagramId,
      roomCode,
      userId: user?.id || 'anon',
      userName: user?.fullName || user?.email || 'Usuario',
      color: this.myColor(),
      x: Math.round(x),
      y: Math.round(y),
    });
  }

  sendNodeDrag(nodeId: string, position: { x: number; y: number }): void {
    const user = this.getCurrentUser();
    const diagramId = this.currentDiagramId();
    const roomCode = this.activeRoomCode();
    if (!this.socket || !diagramId) return;

    this.socket.emit('node_drag', {
      diagramId,
      roomCode,
      nodeId,
      position,
      userId: user?.id || 'anon',
    });
  }

  sendDiagramSync(nodes: UmlClassNode[], connections: UmlConnection[], action = 'update'): void {
    const user = this.getCurrentUser();
    const diagramId = this.currentDiagramId();
    const roomCode = this.activeRoomCode();
    if (!this.socket || !diagramId) return;

    this.socket.emit('diagram_sync', {
      diagramId,
      roomCode,
      nodes,
      connections,
      userId: user?.id || 'anon',
      action,
    });
  }

  setChatPanelVisible(visible: boolean): void {
    this.isChatPanelVisible.set(visible);
    if (visible) {
      this.unreadChatCount.set(0);
    }
  }

  markChatAsRead(): void {
    this.unreadChatCount.set(0);
  }

  sendChatMessage(message: string): void {
    const clean = message.trim();
    if (!clean) return;

    const user = this.getCurrentUser();
    const diagramId = this.currentDiagramId();
    const roomCode = this.activeRoomCode();
    if (!this.socket || !this.isConnected() || !diagramId) {
      this.chatMessages.update((list) => {
        const next = [
          ...list,
          {
            id: `local_chat_${Date.now()}`,
            userId: user?.id || 'local',
            userName: user?.fullName || user?.email || 'Usuario',
            message: clean,
            color: this.myColor(),
            timestamp: new Date().toISOString(),
          },
        ];
        return next.length > this.MAX_CLIENT_HISTORY
          ? next.slice(next.length - this.MAX_CLIENT_HISTORY)
          : next;
      });
      return;
    }

    this.socket.emit('chat_message', {
      diagramId,
      roomCode,
      userId: user?.id || 'anon',
      userName: user?.fullName || user?.email || 'Usuario',
      message: clean,
      color: this.myColor(),
    });
  }

  sendActivityLog(action: string, detail?: string, category: ActivityCategory = 'uml'): void {
    const cleanAction = action.trim();
    if (!cleanAction) return;

    const user = this.getCurrentUser();
    const diagramId = this.currentDiagramId();
    const roomCode = this.activeRoomCode();
    const userId = user?.id || 'local';
    const userName = user?.fullName || user?.email || 'Usuario';

    if (!this.socket || !this.isConnected() || !diagramId) {
      const localEntry: ActivityLog = {
        id: `local_act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId,
        userName,
        action: cleanAction,
        detail,
        category,
        color: this.myColor(),
        timestamp: new Date().toISOString(),
      };
      this.activityLogs.update((list) => {
        const next = [...list, localEntry];
        return next.length > this.MAX_CLIENT_HISTORY
          ? next.slice(next.length - this.MAX_CLIENT_HISTORY)
          : next;
      });
      return;
    }

    this.socket.emit('activity_log', {
      diagramId,
      roomCode,
      userId,
      userName,
      action: cleanAction,
      detail,
      category,
      color: this.myColor(),
    });
  }

  disconnect(): void {
    this.leaveRoom();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected.set(false);
  }

  private generateUserColor(seed: string): string {
    const palette = [
      '#EF4444', // Rojo Coral
      '#F59E0B', // Ámbar Oro
      '#10B981', // Verde Esmeralda
      '#3B82F6', // Azul Cobalto
      '#6366F1', // Índigo Real
      '#8B5CF6', // Púrpura Eléctrico
      '#EC4899', // Rosa Magenta
      '#06B6D4', // Cian Neón
      '#F97316', // Naranja Fuego
    ];
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % palette.length;
    return palette[index];
  }
}
