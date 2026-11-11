import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { SessionRepository } from '../repositories/session.repository';
import { SessionParticipantRepository } from '../repositories/session-participant.repository';
import { RoomMessageRepository } from '../repositories/room-message.repository';
import {
  AuthorEventRepository,
  ContributorStatsItem,
} from '../repositories/author-event.repository';
import { NotificationRecordRepository } from '../repositories/notification-record.repository';
import { ProjectRepository } from '../repositories/project.repository';
import { ProjectMemberRepository } from '../repositories/project-member.repository';
import { DiagramRepository } from '../../diagrams/repositories/diagram.repository';
import { DiagramSnapshotRepository } from '../../diagrams/repositories/diagram-snapshot.repository';
import { UserRepository } from '../../auth/repositories/user.repository';
import { SessionResponseDto } from '../dtos/session-response.dto';
import { JoinRoomDto } from '../dtos/join-room.dto';
import { ProjectRole } from '../entities/project-role.enum';
import {
  AiInteractionMode,
  RoomMessage,
  RoomSenderType,
} from '../entities/room-message.entity';
import { AuthorEvent, AuthorEventCategory } from '../entities/author-event.entity';
import {
  NotificationRecord,
  NotificationSeverity,
} from '../entities/notification-record.entity';
import { DiagramSnapshot } from '../../diagrams/entities/diagram-snapshot.entity';
import { getUtcDateKey, isValidUuid } from '../../../common/utils/mongoose-entity.util';

export interface HostTransferResult {
  transferred: boolean;
  sessionId: string;
  diagramId: string;
  roomCode: string;
  previousHostUserId?: string | null;
  newHostUserId?: string | null;
  newHostUserName?: string | null;
}

@Injectable()
export class YjsSyncService {
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly participantRepo: SessionParticipantRepository,
    @Optional() private readonly userRepo?: UserRepository,
    @Optional() private readonly roomMessageRepo?: RoomMessageRepository,
    @Optional() private readonly authorEventRepo?: AuthorEventRepository,
    @Optional() private readonly notificationRepo?: NotificationRecordRepository,
    @Optional() private readonly projectRepo?: ProjectRepository,
    @Optional() private readonly projectMemberRepo?: ProjectMemberRepository,
    @Optional()
    @Inject(forwardRef(() => DiagramRepository))
    private readonly diagramRepo?: DiagramRepository,
    @Optional()
    @Inject(forwardRef(() => DiagramSnapshotRepository))
    private readonly snapshotRepo?: DiagramSnapshotRepository,
  ) {}

  async joinOrCreateSession(
    dto: JoinRoomDto,
    userId: string,
  ): Promise<SessionResponseDto> {
    const today = getUtcDateKey();
    const joiningUser =
      this.userRepo && isValidUuid(userId) ? await this.userRepo.findById(userId) : null;
    const diagram = this.diagramRepo ? await this.diagramRepo.findById(dto.diagramId) : null;

    let session = await this.sessionRepo.findActiveByDiagramId(dto.diagramId);

    if (!session) {
      const previousSession =
        typeof this.sessionRepo.findLatestByDiagramId === 'function'
          ? await this.sessionRepo.findLatestByDiagramId(dto.diagramId)
          : null;

      if (previousSession) {
        const nextDates = Array.from(
          new Set([...(previousSession.activeDateKeys || []), today]),
        );
        const nextNumber = (previousSession.sessionNumber || 1) + 1;
        await this.sessionRepo.update(previousSession.id, {
          isActive: true,
          projectId: previousSession.projectId ?? diagram?.projectId ?? null,
          hostUserId: previousSession.hostUserId || userId,
          hostUserName:
            previousSession.hostUserName || joiningUser?.fullName || null,
          sessionNumber: nextNumber,
          activeDateKeys: nextDates,
          lastActiveDay: today,
          lastActivityAt: new Date(),
        });
        session = await this.sessionRepo.findById(previousSession.id);
      } else {
        const roomCode =
          dto.roomCode ||
          `ROOM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        const newSession = this.sessionRepo.create({
          diagramId: dto.diagramId,
          projectId: diagram?.projectId ?? null,
          roomCode,
          isActive: true,
          hostUserId: userId,
          hostUserName: joiningUser?.fullName || null,
          sessionNumber: 1,
          activeDateKeys: [today],
          lastActiveDay: today,
          resumeSummary: '',
        });

        session = await this.sessionRepo.save(newSession);
      }
    } else {
      // Continuidad multi-día: si cambia el día calendario UTC o no hay anfitrión activo, actualizamos sesión
      const updates: Record<string, any> = {};
      if (session.lastActiveDay && session.lastActiveDay !== today) {
        updates.sessionNumber = (session.sessionNumber || 1) + 1;
        updates.lastActiveDay = today;
        updates.activeDateKeys = Array.from(
          new Set([...(session.activeDateKeys || []), today]),
        );
      }
      if (!session.hostUserId) {
        updates.hostUserId = userId;
        if (joiningUser?.fullName) {
          updates.hostUserName = joiningUser.fullName;
        }
      }
      if (!session.projectId && diagram?.projectId) {
        updates.projectId = diagram.projectId;
      }
      if (Object.keys(updates).length > 0 && typeof this.sessionRepo.update === 'function') {
        await this.sessionRepo.update(session.id, updates);
      }
    }

    const activeSessionId = session!.id;
    const cursorColor = dto.cursorColor || this.getRandomColor(userId);
    let participant = await this.participantRepo.findBySessionAndUser(
      activeSessionId,
      userId,
    );

    if (!participant) {
      participant = this.participantRepo.create({
        sessionId: activeSessionId,
        userId,
        cursorColor,
        isConnected: true,
        lastSeenAt: new Date(),
      });
    } else {
      participant.isConnected = true;
      if (cursorColor) {
        participant.cursorColor = cursorColor;
      }
      participant.lastSeenAt = new Date();
    }

    await this.participantRepo.save(participant);

    const updatedSession = await this.sessionRepo.findById(activeSessionId);
    return SessionResponseDto.fromEntity(updatedSession!);
  }

  async getSessionById(sessionId: string): Promise<SessionResponseDto> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundException('Sesión de colaboración no encontrada');
    }
    return SessionResponseDto.fromEntity(session);
  }

  async getActiveSessionByDiagram(diagramId: string): Promise<SessionResponseDto | null> {
    const session = await this.sessionRepo.findActiveByDiagramId(diagramId);
    if (!session) {
      return null;
    }
    return SessionResponseDto.fromEntity(session);
  }

  async leaveSession(sessionId: string, userId: string): Promise<void> {
    await this.participantRepo.updateBySessionAndUser(sessionId, userId, {
      isConnected: false,
      lastSeenAt: new Date(),
    });
  }

  async closeSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    await this.sessionRepo.update(sessionId, { isActive: false });
    await this.participantRepo.updateBySessionId(sessionId, {
      isConnected: false,
      lastSeenAt: new Date(),
    });

    return { success: true, message: 'Sesión de colaboración finalizada' };
  }

  async handleHostDisconnectOrTransfer(
    sessionId: string,
    disconnectedUserId: string,
    remainingConnectedUserIds: string[],
  ): Promise<HostTransferResult | null> {
    await this.leaveSession(sessionId, disconnectedUserId);

    const session = await this.sessionRepo.findById(sessionId);
    if (!session || session.hostUserId !== disconnectedUserId) {
      return null;
    }

    const candidates = Array.from(
      new Set(
        remainingConnectedUserIds.filter(
          (id) => id && id !== disconnectedUserId && isValidUuid(id),
        ),
      ),
    );

    if (candidates.length === 0) {
      await this.sessionRepo.update(sessionId, {
        hostUserId: null,
        hostUserName: null,
      });
      return {
        transferred: false,
        sessionId,
        diagramId: session.diagramId,
        roomCode: session.roomCode,
        previousHostUserId: disconnectedUserId,
        newHostUserId: null,
        newHostUserName: null,
      };
    }

    let chosenUserId = candidates[0];
    if (session.projectId && this.projectMemberRepo) {
      const members = await this.projectMemberRepo.findByProjectId(session.projectId);
      const rolePriority: Record<string, number> = {
        [ProjectRole.OWNER]: 3,
        [ProjectRole.EDITOR]: 2,
        [ProjectRole.VIEWER]: 1,
      };
      const sorted = [...candidates].sort((a, b) => {
        const ra = rolePriority[members.find((m) => m.userId === a)?.role || ''] || 0;
        const rb = rolePriority[members.find((m) => m.userId === b)?.role || ''] || 0;
        return rb - ra;
      });
      chosenUserId = sorted[0];
    }

    const nextHost = this.userRepo ? await this.userRepo.findById(chosenUserId) : null;
    const nextHostName = nextHost?.fullName || 'Colaborador Activo';

    await this.sessionRepo.update(sessionId, {
      hostUserId: chosenUserId,
      hostUserName: nextHostName,
    });

    await this.recordAuthorEvent({
      diagramId: session.diagramId,
      roomCode: session.roomCode,
      sessionId: session.id,
      sessionNumber: session.sessionNumber,
      actorType: 'human',
      userId: chosenUserId,
      userName: nextHostName,
      category: 'system',
      action: `Asumió anfitrión de sala tras salida del anfitrión anterior`,
      detail: `Continuidad automática para mantener la sala ${session.roomCode} activa`,
    });

    return {
      transferred: true,
      sessionId,
      diagramId: session.diagramId,
      roomCode: session.roomCode,
      previousHostUserId: disconnectedUserId,
      newHostUserId: chosenUserId,
      newHostUserName: nextHostName,
    };
  }

  async transferHostManually(
    sessionId: string,
    requesterUserId: string,
    targetUserId: string,
  ): Promise<HostTransferResult> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundException('Sesión no encontrada');
    }

    const projectId = session.projectId || session.diagram?.projectId;
    let isOwner = false;
    if (projectId && this.projectMemberRepo && this.projectRepo) {
      const project = await this.projectRepo.findById(projectId);
      const role = await this.projectMemberRepo.findRole(projectId, requesterUserId);
      isOwner = role === ProjectRole.OWNER || project?.createdBy === requesterUserId;
    }

    if (session.hostUserId && session.hostUserId !== requesterUserId && !isOwner) {
      throw new ForbiddenException(
        'Solo el anfitrión actual o el propietario del proyecto puede transferir la sala',
      );
    }

    const targetUser = this.userRepo ? await this.userRepo.findById(targetUserId) : null;
    if (!targetUser) {
      throw new NotFoundException('Colaborador destino no encontrado');
    }

    await this.sessionRepo.update(sessionId, {
      hostUserId: targetUser.id,
      hostUserName: targetUser.fullName,
    });

    await this.recordAuthorEvent({
      diagramId: session.diagramId,
      roomCode: session.roomCode,
      sessionId: session.id,
      sessionNumber: session.sessionNumber,
      actorType: 'human',
      userId: targetUser.id,
      userName: targetUser.fullName,
      category: 'system',
      action: `Recibió traspaso de anfitrión de sala`,
      detail: `Sala ${session.roomCode}`,
    });

    return {
      transferred: true,
      sessionId: session.id,
      diagramId: session.diagramId,
      roomCode: session.roomCode,
      previousHostUserId: requesterUserId,
      newHostUserId: targetUser.id,
      newHostUserName: targetUser.fullName,
    };
  }

  async recordChatMessage(params: {
    diagramId?: string;
    roomCode?: string;
    senderType?: RoomSenderType;
    userId: string;
    userName: string;
    message: string;
    color?: string;
    aiMode?: AiInteractionMode;
    requestedByUserId?: string;
    requestedByUserName?: string;
    targetNodes?: string[];
    mutatedDiagram?: boolean;
    providerUsed?: string;
    modelUsed?: string;
  }): Promise<{ savedMessage: RoomMessage | null; notifications: NotificationRecord[] }> {
    const cleanMessage = params.message?.trim();
    if (!cleanMessage || !params.diagramId || !this.roomMessageRepo) {
      return { savedMessage: null, notifications: [] };
    }

    const session = await this.sessionRepo.findActiveByDiagramId(params.diagramId);
    const now = new Date();
    const savedMessage = await this.roomMessageRepo.createAndSave({
      diagramId: params.diagramId,
      roomCode: params.roomCode || session?.roomCode || null,
      sessionId: session?.id || null,
      sessionNumber: session?.sessionNumber || 1,
      sessionDate: getUtcDateKey(now),
      senderType: params.senderType || 'human',
      userId: params.userId,
      userName: params.userName,
      color: params.color || null,
      message: cleanMessage,
      aiMode: params.aiMode || null,
      requestedByUserId: params.requestedByUserId || null,
      requestedByUserName: params.requestedByUserName || null,
      targetNodes: params.targetNodes || [],
      mutatedDiagram: Boolean(params.mutatedDiagram),
      providerUsed: params.providerUsed || null,
      modelUsed: params.modelUsed || null,
      createdAt: now,
    });

    const notifications: NotificationRecord[] = [];
    if (this.notificationRepo && (params.senderType || 'human') === 'human') {
      const diagram = this.diagramRepo
        ? await this.diagramRepo.findById(params.diagramId)
        : null;
      const projectId = session?.projectId || diagram?.projectId || null;

      // Detectar menciones @equipo / @todos o @NombreDeMiembro (excluyendo invocaciones @ia / @copilot)
      const lowerMsg = cleanMessage.toLowerCase();
      if (lowerMsg.includes('@todos') || lowerMsg.includes('@equipo')) {
        const n = await this.notificationRepo.createAndSave({
          projectId,
          diagramId: params.diagramId,
          roomCode: savedMessage.roomCode || null,
          recipientUserId: 'ROOM',
          severity: 'mention',
          title: `${params.userName} mencionó a todo el equipo`,
          body: cleanMessage.slice(0, 220),
          actorUserId: params.userId,
          actorName: params.userName,
          targetNodeIds: params.targetNodes || [],
          readByUserIds: [params.userId],
        });
        notifications.push(n);
      } else if (projectId && this.projectMemberRepo && lowerMsg.includes('@')) {
        const msgWithoutAiTag = lowerMsg.replace(/(?:^|\s)@(?:ia|copilot)\b/gi, ' ');
        const members = msgWithoutAiTag.includes('@')
          ? await this.projectMemberRepo.findByProjectId(projectId)
          : [];
        for (const m of members) {
          if (m.userId === params.userId) continue;
          const firstName = (m.user?.fullName || '').trim().split(/\s+/)[0]?.toLowerCase();
          const emailPrefix = (m.user?.email || '').split('@')[0]?.toLowerCase();
          if (
            (firstName && firstName.length >= 2 && msgWithoutAiTag.includes(`@${firstName}`)) ||
            (emailPrefix && msgWithoutAiTag.includes(`@${emailPrefix}`))
          ) {
            const n = await this.notificationRepo.createAndSave({
              projectId,
              diagramId: params.diagramId,
              roomCode: savedMessage.roomCode || null,
              recipientUserId: m.userId,
              severity: 'mention',
              title: `${params.userName} te mencionó en la sala`,
              body: cleanMessage.slice(0, 220),
              actorUserId: params.userId,
              actorName: params.userName,
              targetNodeIds: params.targetNodes || [],
              readByUserIds: [params.userId],
            });
            notifications.push(n);
          }
        }
      }
    }

    return { savedMessage, notifications };
  }

  async recordAuthorEvent(params: {
    diagramId?: string;
    roomCode?: string | null;
    sessionId?: string | null;
    sessionNumber?: number;
    actorType?: 'human' | 'ai';
    userId: string;
    userName: string;
    category?: AuthorEventCategory;
    action: string;
    detail?: string | null;
    affectedClasses?: string[];
    color?: string | null;
  }): Promise<AuthorEvent | null> {
    if (!params.diagramId || !this.authorEventRepo) return null;
    const now = new Date();
    const session = !params.sessionId
      ? await this.sessionRepo.findActiveByDiagramId(params.diagramId)
      : null;

    const event = await this.authorEventRepo.createAndSave({
      diagramId: params.diagramId,
      roomCode: params.roomCode ?? session?.roomCode ?? null,
      sessionId: params.sessionId ?? session?.id ?? null,
      sessionNumber: params.sessionNumber ?? session?.sessionNumber ?? 1,
      sessionDate: getUtcDateKey(now),
      actorType: params.actorType || 'human',
      userId: params.userId,
      userName: params.userName,
      category: params.category || 'uml',
      action: params.action,
      detail: params.detail ?? null,
      affectedClasses: params.affectedClasses || [],
      color: params.color ?? null,
      createdAt: now,
    });

    const targetSessionId = params.sessionId ?? session?.id;
    if (
      targetSessionId &&
      (params.category === 'uml' || params.category === 'ai' || params.category === 'voice')
    ) {
      await this.sessionRepo.update(targetSessionId, {
        resumeSummary: `${params.userName} (${getUtcDateKey(now)}): ${params.action}${params.detail ? ` — ${params.detail}` : ''}`,
        lastActivityAt: now,
      });
    }

    return event;
  }

  async createNotification(params: {
    projectId?: string | null;
    diagramId: string;
    roomCode?: string | null;
    recipientUserId?: string;
    severity?: NotificationSeverity;
    title: string;
    body: string;
    actorUserId?: string | null;
    actorName: string;
    targetNodeIds?: string[];
  }): Promise<NotificationRecord | null> {
    if (!this.notificationRepo) return null;
    return this.notificationRepo.createAndSave({
      projectId: params.projectId ?? null,
      diagramId: params.diagramId,
      roomCode: params.roomCode ?? null,
      recipientUserId: params.recipientUserId || 'ROOM',
      severity: params.severity || 'info',
      title: params.title,
      body: params.body,
      actorUserId: params.actorUserId ?? null,
      actorName: params.actorName,
      targetNodeIds: params.targetNodeIds || [],
      readByUserIds: params.actorUserId ? [params.actorUserId] : [],
    });
  }

  async getRoomHistory(
    diagramId: string,
    limit = 60,
  ): Promise<{ recentChatMessages: any[]; recentActivityLogs: any[] }> {
    const [messages, events] = await Promise.all([
      this.roomMessageRepo
        ? this.roomMessageRepo.findRecentByDiagramId(diagramId, limit)
        : Promise.resolve([]),
      this.authorEventRepo
        ? this.authorEventRepo.findRecentByDiagramId(diagramId, limit)
        : Promise.resolve([]),
    ]);

    return {
      recentChatMessages: messages.map((m) => ({
        id: m.id,
        userId: m.userId,
        userName: m.userName,
        message: m.message,
        color: m.color || undefined,
        timestamp: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
        senderType: m.senderType,
        aiMode: m.aiMode,
        requestedByUserName: m.requestedByUserName,
        targetNodes: m.targetNodes,
        mutatedDiagram: m.mutatedDiagram,
        providerUsed: m.providerUsed,
        modelUsed: m.modelUsed,
        sessionNumber: m.sessionNumber,
        sessionDate: m.sessionDate,
      })),
      recentActivityLogs: events.map((e) => ({
        id: e.id,
        userId: e.userId,
        userName: e.userName,
        action: e.action,
        detail: e.detail || undefined,
        category: e.category,
        color: e.color || undefined,
        timestamp: e.createdAt ? new Date(e.createdAt).toISOString() : new Date().toISOString(),
        actorType: e.actorType,
        affectedClasses: e.affectedClasses,
        sessionNumber: e.sessionNumber,
        sessionDate: e.sessionDate,
      })),
    };
  }

  async getResumeBundle(diagramId: string, userId: string): Promise<{
    diagram: {
      id: string;
      projectId: string | null;
      name: string;
      revisionCount: number;
      lastModifiedByName: string | null;
      lastModifiedAt: Date | null;
      classCount: number;
      connectionCount: number;
      openAiAnnotationsCount: number;
    };
    session: SessionResponseDto | null;
    sinceLastVisit: {
      lastContributedAt: string | null;
      changesCount: number;
      contributors: string[];
      touchedClasses: string[];
      highlights: string[];
    };
    contributorStats: ContributorStatsItem[];
    snapshots: DiagramSnapshot[];
    unreadNotifications: NotificationRecord[];
    recentMessages: RoomMessage[];
    recentEvents: AuthorEvent[];
  }> {
    const diagram = await this.ensureDiagramReadAccess(diagramId, userId);

    const [latestSession, recentMessages, recentEvents, contributorStats, snapshots, unreadNotifications, userEvents] =
      await Promise.all([
        this.sessionRepo.findLatestByDiagramId(diagramId),
        this.roomMessageRepo
          ? this.roomMessageRepo.findRecentByDiagramId(diagramId, 60)
          : Promise.resolve([]),
        this.authorEventRepo
          ? this.authorEventRepo.findRecentByDiagramId(diagramId, 80)
          : Promise.resolve([]),
        this.authorEventRepo
          ? this.authorEventRepo.getContributionStatsByDiagram(diagramId)
          : Promise.resolve([]),
        this.snapshotRepo
          ? this.snapshotRepo.findByDiagramId(diagramId, 15)
          : Promise.resolve([]),
        this.notificationRepo
          ? this.notificationRepo.findForUserAndDiagrams({
              diagramIds: [diagramId],
              userId,
              unreadOnly: true,
              limit: 20,
            })
          : Promise.resolve([]),
        this.authorEventRepo
          ? this.authorEventRepo.findByUserAndDiagram(diagramId, userId, 5)
          : Promise.resolve([]),
      ]);

    const lastUserEvent = userEvents[userEvents.length - 1];
    const cutoffMs = lastUserEvent?.createdAt ? new Date(lastUserEvent.createdAt).getTime() : 0;
    const subsequentChanges = recentEvents.filter((ev) => {
      const evMs = ev.createdAt ? new Date(ev.createdAt).getTime() : 0;
      return ev.userId !== userId && evMs > cutoffMs;
    });

    const visibleNodes = (diagram.nodes || []).filter((n) => !n.isAnchor && n.elementType !== 'NOTE');
    const openAnnotations = (diagram.aiAnnotations || []).filter((a) => a.status === 'open');

    return {
      diagram: {
        id: diagram.id,
        projectId: diagram.projectId ?? null,
        name: diagram.name,
        revisionCount: diagram.revisionCount ?? 0,
        lastModifiedByName: diagram.lastModifiedByName ?? null,
        lastModifiedAt: diagram.lastModifiedAt ?? diagram.updatedAt ?? null,
        classCount: visibleNodes.length,
        connectionCount: (diagram.connections || []).length,
        openAiAnnotationsCount: openAnnotations.length,
      },
      session: latestSession ? SessionResponseDto.fromEntity(latestSession) : null,
      sinceLastVisit: {
        lastContributedAt: lastUserEvent?.createdAt
          ? new Date(lastUserEvent.createdAt).toISOString()
          : null,
        changesCount: subsequentChanges.length,
        contributors: Array.from(new Set(subsequentChanges.map((e) => e.userName))),
        touchedClasses: Array.from(
          new Set(subsequentChanges.flatMap((e) => e.affectedClasses || [])),
        ),
        highlights: subsequentChanges
          .slice(-6)
          .reverse()
          .map((e) => `${e.userName}: ${e.action}${e.detail ? ` (${e.detail})` : ''}`),
      },
      contributorStats,
      snapshots,
      unreadNotifications,
      recentMessages,
      recentEvents,
    };
  }

  async getContributionReport(diagramId: string, userId: string): Promise<{
    diagramId: string;
    contributorStats: ContributorStatsItem[];
    nodeAttribution: Array<{
      nodeId: string;
      name: string;
      elementType: string;
      createdByName: string | null;
      lastModifiedByName: string | null;
      lastModifiedAt: Date | null;
    }>;
  }> {
    const diagram = await this.ensureDiagramReadAccess(diagramId, userId);
    const contributorStats = this.authorEventRepo
      ? await this.authorEventRepo.getContributionStatsByDiagram(diagramId)
      : [];

    const nodeAttribution = (diagram.nodes || [])
      .filter((n) => !n.isAnchor)
      .map((n) => ({
        nodeId: n.id,
        name: n.name,
        elementType: n.elementType || 'CLASS',
        createdByName: n.createdByName ?? null,
        lastModifiedByName: n.lastModifiedByName ?? null,
        lastModifiedAt: n.lastModifiedAt ?? null,
      }));

    return {
      diagramId,
      contributorStats,
      nodeAttribution,
    };
  }

  async listNotificationsForUser(
    userId: string,
    diagramId?: string,
    unreadOnly = false,
  ): Promise<NotificationRecord[]> {
    if (!this.notificationRepo) return [];
    let diagramIds: string[] = [];

    if (diagramId) {
      await this.ensureDiagramReadAccess(diagramId, userId);
      diagramIds = [diagramId];
    } else if (this.projectRepo && this.diagramRepo) {
      const projects = await this.projectRepo.findAllForUser(userId);
      const nested = await Promise.all(
        projects.map((p) => this.diagramRepo!.findIdsByProjectId(p.id)),
      );
      diagramIds = nested.flat();
    }

    return this.notificationRepo.findForUserAndDiagrams({
      diagramIds,
      userId,
      unreadOnly,
      limit: 50,
    });
  }

  async markNotificationRead(
    notificationId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    if (this.notificationRepo) {
      await this.notificationRepo.markAsRead(notificationId, userId);
    }
    return { success: true };
  }

  async markAllNotificationsRead(
    diagramId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    await this.ensureDiagramReadAccess(diagramId, userId);
    if (this.notificationRepo) {
      await this.notificationRepo.markAllAsRead([diagramId], userId);
    }
    return { success: true };
  }

  private async ensureDiagramReadAccess(diagramId: string, userId: string) {
    if (!this.diagramRepo) {
      throw new NotFoundException('DiagramRepository no disponible');
    }
    const diagram = await this.diagramRepo.findById(diagramId);
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    if (diagram.projectId && this.projectRepo && this.projectMemberRepo) {
      const project = await this.projectRepo.findById(diagram.projectId);
      const role = await this.projectMemberRepo.findRole(diagram.projectId, userId);
      if (!role && project?.createdBy !== userId) {
        throw new ForbiddenException('No tienes permisos para acceder a este diagrama');
      }
    }

    return diagram;
  }

  private getRandomColor(seed: string): string {
    const colors = [
      '#EF4444', // Rojo
      '#F59E0B', // Ámbar
      '#10B981', // Verde esmeralda
      '#3B82F6', // Azul
      '#6366F1', // Índigo
      '#8B5CF6', // Púrpura
      '#EC4899', // Rosa
      '#14B8A6', // Teal
      '#F97316', // Naranja
    ];
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }
}
