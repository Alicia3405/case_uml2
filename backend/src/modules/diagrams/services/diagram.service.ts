import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { DiagramRepository } from '../repositories/diagram.repository';
import { DiagramSnapshotRepository } from '../repositories/diagram-snapshot.repository';
import { ProjectRepository } from '../../projects/repositories/project.repository';
import { ProjectMemberRepository } from '../../projects/repositories/project-member.repository';
import { UserRepository } from '../../auth/repositories/user.repository';
import { AuthorEventRepository } from '../../projects/repositories/author-event.repository';
import { SessionRepository } from '../../projects/repositories/session.repository';
import { Diagram } from '../entities/diagram.entity';
import { UmlNode } from '../entities/uml-node.entity';
import { UmlConnection } from '../entities/uml-connection.entity';
import { AiAnnotationItem, AiAnnotationStatus } from '../entities/ai-annotation.entity';
import { CreateDiagramDto } from '../dtos/create-diagram.dto';
import { UpdateDiagramDto } from '../dtos/update-diagram.dto';
import { SaveDiagramAstDto } from '../dtos/save-diagram-ast.dto';
import { DiagramResponseDto } from '../dtos/diagram-response.dto';
import { DiagramSnapshot } from '../entities/diagram-snapshot.entity';
import { ProjectRole } from '../../projects/entities/project-role.enum';
import { getUtcDateKey } from '../../../common/utils/mongoose-entity.util';

export interface SaveAstOptions {
  actorType?: 'human' | 'ai';
  actorName?: string;
  recordEvent?: boolean;
  actionLabel?: string;
}

@Injectable()
export class DiagramService {
  constructor(
    private readonly diagramRepository: DiagramRepository,
    @Inject(forwardRef(() => ProjectRepository))
    private readonly projectRepository: ProjectRepository,
    @Inject(forwardRef(() => ProjectMemberRepository))
    private readonly projectMemberRepository: ProjectMemberRepository,
    @Optional()
    private readonly snapshotRepository?: DiagramSnapshotRepository,
    @Optional()
    private readonly userRepository?: UserRepository,
    @Optional()
    @Inject(forwardRef(() => AuthorEventRepository))
    private readonly authorEventRepository?: AuthorEventRepository,
    @Optional()
    @Inject(forwardRef(() => SessionRepository))
    private readonly sessionRepository?: SessionRepository,
  ) {}

  private async checkProjectAccess(
    projectId: string,
    userId: string,
    requireWrite = false,
  ): Promise<void> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundException('El proyecto asociado no existe');
    }

    const role = await this.projectMemberRepository.findRole(projectId, userId);
    const isOwnerOrCreator = role === ProjectRole.OWNER || project.createdBy === userId;
    const isEditor = role === ProjectRole.EDITOR;

    if (!role && !isOwnerOrCreator) {
      throw new ForbiddenException('No tienes acceso a este proyecto ni a sus diagramas');
    }

    if (requireWrite && !isOwnerOrCreator && !isEditor) {
      throw new ForbiddenException('Solo los editores y propietarios pueden modificar diagramas');
    }
  }

  async create(dto: CreateDiagramDto, userId: string): Promise<DiagramResponseDto> {
    await this.checkProjectAccess(dto.projectId, userId, true);

    const actor = this.userRepository ? await this.userRepository.findById(userId) : null;
    const diagramEntity = this.diagramRepository.create({
      projectId: dto.projectId,
      name: dto.name.trim(),
      version: dto.version || '1.0.0',
      defaultLineStyle: dto.defaultLineStyle || 'segment',
      nodes: [],
      connections: [],
      aiAnnotations: [],
      lastModifiedByUserId: userId,
      lastModifiedByName: actor?.fullName || null,
      lastModifiedAt: new Date(),
      revisionCount: 0,
    });

    const saved = await this.diagramRepository.save(diagramEntity);
    const fullDiagram = await this.diagramRepository.findById(saved.id);
    return DiagramResponseDto.fromEntity(fullDiagram || saved);
  }

  async findAllByProjectId(projectId: string, userId: string): Promise<DiagramResponseDto[]> {
    await this.checkProjectAccess(projectId, userId, false);
    const diagrams = await this.diagramRepository.findAllByProjectId(projectId);
    return diagrams.map((d) => DiagramResponseDto.fromEntity(d));
  }

  async findOne(id: string, userId: string): Promise<DiagramResponseDto> {
    const diagram = await this.diagramRepository.findById(id);
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    if (diagram.projectId) {
      await this.checkProjectAccess(diagram.projectId, userId, false);
    }

    return DiagramResponseDto.fromEntity(diagram);
  }

  async update(id: string, dto: UpdateDiagramDto, userId: string): Promise<DiagramResponseDto> {
    const diagram = await this.diagramRepository.findById(id);
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    if (diagram.projectId) {
      await this.checkProjectAccess(diagram.projectId, userId, true);
    }

    await this.diagramRepository.update(id, {
      ...(dto.name && { name: dto.name.trim() }),
      ...(dto.version && { version: dto.version }),
      ...(dto.defaultLineStyle && { defaultLineStyle: dto.defaultLineStyle }),
    });

    const updated = await this.diagramRepository.findById(id);
    return DiagramResponseDto.fromEntity(updated!);
  }

  async saveAst(
    id: string,
    astDto: SaveDiagramAstDto,
    userId?: string,
    options?: SaveAstOptions,
  ): Promise<DiagramResponseDto> {
    const diagram = await this.diagramRepository.findById(id);
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    if (diagram.projectId && userId) {
      await this.checkProjectAccess(diagram.projectId, userId, true);
    }

    const now = new Date();
    let actorName = options?.actorName || null;
    if (!actorName && userId && this.userRepository) {
      const actorUser = await this.userRepository.findById(userId);
      actorName = actorUser?.fullName || actorUser?.email || null;
    }

    const previousNodeMap = new Map((diagram.nodes || []).map((n) => [n.id, n]));

    const nextNodes: UmlNode[] = (astDto.nodes || []).map((nodeDto) => {
      const elementType = this.normalizeElementType(nodeDto.elementType, nodeDto.assocMainConnId);
      const defaultName = nodeDto.isAnchor ? '' : elementType === 'NOTE' ? 'Nota' : 'ClassName';
      const prevNode = previousNodeMap.get(nodeDto.id);

      const attributes = (nodeDto.attributes || []).map((attr, index) => {
        const isPrimaryKey = Boolean(attr.isPrimaryKey);
        return {
          name: attr.name,
          type: attr.type,
          visibility: this.normalizeVisibility(attr.visibility, '-'),
          isPrimaryKey,
          isNullable: isPrimaryKey ? false : (attr.isNullable ?? true),
          orderIndex: attr.orderIndex !== undefined ? attr.orderIndex : index,
        };
      });

      const methods = (nodeDto.methods || []).map((method, index) => ({
        name: method.name,
        parameters: method.parameters || '',
        returnType: method.returnType,
        visibility: this.normalizeVisibility(method.visibility, '+'),
        orderIndex: method.orderIndex !== undefined ? method.orderIndex : index,
      }));

      const nodeChanged = !prevNode || this.hasNodeSemanticChanged(prevNode, {
        name: nodeDto.name !== undefined ? nodeDto.name : defaultName,
        elementType,
        noteContent: nodeDto.noteContent ?? null,
        attributes,
        methods,
      });

      return {
        id: nodeDto.id,
        diagramId: id,
        name: nodeDto.name !== undefined ? nodeDto.name : defaultName,
        elementType,
        stereotype: nodeDto.stereotype ?? null,
        noteContent: nodeDto.noteContent ?? null,
        positionX: nodeDto.positionX,
        positionY: nodeDto.positionY,
        width: nodeDto.width !== undefined ? nodeDto.width : nodeDto.isAnchor ? 0 : 220,
        height: nodeDto.height || null,
        isAnchor: nodeDto.isAnchor || false,
        assocMainConnId: nodeDto.assocMainConnId || null,
        attributes,
        methods,
        createdByUserId: prevNode?.createdByUserId ?? userId ?? null,
        createdByName: prevNode?.createdByName ?? actorName ?? null,
        lastModifiedByUserId: nodeChanged ? (userId ?? prevNode?.lastModifiedByUserId ?? null) : (prevNode?.lastModifiedByUserId ?? null),
        lastModifiedByName: nodeChanged ? (actorName ?? prevNode?.lastModifiedByName ?? null) : (prevNode?.lastModifiedByName ?? null),
        lastModifiedAt: nodeChanged ? now : (prevNode?.lastModifiedAt ?? now),
      };
    });

    const nextConnections: UmlConnection[] = (astDto.connections || []).map((connDto) => ({
      id: connDto.id,
      diagramId: id,
      sourceNodeId: connDto.sourceNodeId,
      targetNodeId: connDto.targetNodeId,
      sourceId: connDto.sourceId,
      targetId: connDto.targetId,
      type: connDto.type,
      lineStyle: connDto.lineStyle || 'segment',
      name: connDto.name || null,
      sourceMultiplicity: connDto.sourceMultiplicity || '1',
      targetMultiplicity: connDto.targetMultiplicity || '0..*',
      assocAnchorNodeId: connDto.assocAnchorNodeId || null,
    }));

    const updatedDiagram = await this.diagramRepository.saveAstAtomic(id, {
      defaultLineStyle: astDto.defaultLineStyle,
      nodes: nextNodes,
      connections: nextConnections,
      lastModifiedByUserId: userId ?? diagram.lastModifiedByUserId ?? null,
      lastModifiedByName: actorName ?? diagram.lastModifiedByName ?? null,
      lastModifiedAt: now,
    });

    const finalDiagram = updatedDiagram || (await this.diagramRepository.findById(id));

    if (options?.recordEvent !== false && userId && this.authorEventRepository) {
      const diff = this.computeAstDiff(diagram.nodes || [], diagram.connections || [], nextNodes, nextConnections);
      const hasStructuralDiff =
        (diff.addedClasses?.length || 0) > 0 ||
        (diff.removedClasses?.length || 0) > 0 ||
        (diff.modifiedClasses?.length || 0) > 0 ||
        (diff.addedRelations || 0) > 0 ||
        (diff.removedRelations || 0) > 0;

      if (hasStructuralDiff) {
        const activeSession = this.sessionRepository
          ? await this.sessionRepository.findActiveByDiagramId(id)
          : null;
        const summaryParts: string[] = [];
        if (diff.addedClasses?.length) summaryParts.push(`+Clases: ${diff.addedClasses.join(', ')}`);
        if (diff.modifiedClasses?.length) summaryParts.push(`~Editadas: ${diff.modifiedClasses.join(', ')}`);
        if (diff.removedClasses?.length) summaryParts.push(`-Eliminadas: ${diff.removedClasses.join(', ')}`);
        if (diff.addedRelations) summaryParts.push(`+${diff.addedRelations} relación(es)`);
        if (diff.removedRelations) summaryParts.push(`-${diff.removedRelations} relación(es)`);

        const detailText = summaryParts.join(' • ');
        await this.authorEventRepository.createAndSave({
          diagramId: id,
          roomCode: activeSession?.roomCode ?? null,
          sessionId: activeSession?.id ?? null,
          sessionNumber: activeSession?.sessionNumber ?? 1,
          sessionDate: getUtcDateKey(now),
          actorType: options?.actorType || 'human',
          userId,
          userName: actorName || 'Colaborador',
          category: options?.actorType === 'ai' ? 'ai' : 'uml',
          action: options?.actionLabel || `Guardó cambios en "${finalDiagram?.name || diagram.name}"`,
          detail: detailText,
          affectedClasses: Array.from(
            new Set([
              ...(diff.addedClasses || []),
              ...(diff.modifiedClasses || []),
              ...(diff.removedClasses || []),
            ]),
          ),
          diffSummary: diff,
        });

        if (activeSession && this.sessionRepository) {
          await this.sessionRepository.update(activeSession.id, {
            resumeSummary: `${actorName || 'Equipo'} (${getUtcDateKey(now)}): ${detailText || 'Actualizó el diagrama'}`,
            lastActivityAt: now,
          });
        }
      }
    }

    return DiagramResponseDto.fromEntity(finalDiagram!);
  }

  async addAiAnnotation(
    diagramId: string,
    annotation: Omit<AiAnnotationItem, 'id' | 'createdAt' | 'status'> & {
      id?: string;
      status?: AiAnnotationStatus;
    },
  ): Promise<DiagramResponseDto> {
    const diagram = await this.diagramRepository.findById(diagramId);
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    const nextItem: AiAnnotationItem = {
      id: annotation.id || `ai_note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      targetNodeId: annotation.targetNodeId ?? null,
      targetClassName: annotation.targetClassName ?? null,
      severity: annotation.severity || 'idea',
      title: annotation.title,
      message: annotation.message,
      authorName: annotation.authorName || 'Copilot IA',
      requestedByUserName: annotation.requestedByUserName ?? null,
      suggestedAction: annotation.suggestedAction ?? null,
      status: annotation.status || 'open',
      createdAt: new Date(),
      resolvedAt: null,
      resolvedByUserName: null,
    };

    const existing = (diagram.aiAnnotations || []).slice(-39);
    const updated = await this.diagramRepository.updateAiAnnotations(diagramId, [
      ...existing,
      nextItem,
    ]);
    return DiagramResponseDto.fromEntity(updated!);
  }

  async updateAiAnnotationStatus(
    diagramId: string,
    annotationId: string,
    status: AiAnnotationStatus,
    userId: string,
  ): Promise<DiagramResponseDto> {
    const diagram = await this.diagramRepository.findById(diagramId);
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }
    if (diagram.projectId) {
      await this.checkProjectAccess(diagram.projectId, userId, true);
    }

    const actor = this.userRepository ? await this.userRepository.findById(userId) : null;
    const nextAnnotations = (diagram.aiAnnotations || []).map((a) =>
      a.id === annotationId
        ? {
            ...a,
            status,
            resolvedAt: new Date(),
            resolvedByUserName: actor?.fullName || 'Colaborador',
          }
        : a,
    );

    const updated = await this.diagramRepository.updateAiAnnotations(diagramId, nextAnnotations);
    return DiagramResponseDto.fromEntity(updated!);
  }

  async createSnapshot(
    diagramId: string,
    userId: string,
    label?: string,
  ): Promise<DiagramSnapshot> {
    const diagram = await this.diagramRepository.findById(diagramId);
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }
    if (diagram.projectId) {
      await this.checkProjectAccess(diagram.projectId, userId, true);
    }
    if (!this.snapshotRepository) {
      throw new Error('DiagramSnapshotRepository no disponible');
    }

    const actor = this.userRepository ? await this.userRepository.findById(userId) : null;
    const activeSession = this.sessionRepository
      ? await this.sessionRepository.findActiveByDiagramId(diagramId)
      : null;

    const now = new Date();
    const classCount = (diagram.nodes || []).filter((n) => !n.isAnchor && n.elementType !== 'NOTE').length;
    const relCount = (diagram.connections || []).length;
    const sessionNumber = activeSession?.sessionNumber ?? 1;

    return this.snapshotRepository.createAndSave({
      diagramId,
      sessionId: activeSession?.id ?? null,
      sessionNumber,
      sessionDate: getUtcDateKey(now),
      label: (label || `Avance Sesión #${sessionNumber} (${getUtcDateKey(now)})`).trim(),
      summary: `${classCount} clases, ${relCount} relaciones • Guardado por ${actor?.fullName || 'Colaborador'}`,
      savedByUserId: userId,
      savedByName: actor?.fullName || 'Colaborador',
      nodes: diagram.nodes || [],
      connections: diagram.connections || [],
      aiAnnotations: diagram.aiAnnotations || [],
      createdAt: now,
    });
  }

  async listSnapshots(diagramId: string, userId: string): Promise<DiagramSnapshot[]> {
    const diagram = await this.diagramRepository.findById(diagramId);
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }
    if (diagram.projectId) {
      await this.checkProjectAccess(diagram.projectId, userId, false);
    }
    if (!this.snapshotRepository) return [];
    return this.snapshotRepository.findByDiagramId(diagramId, 30);
  }

  async restoreSnapshot(
    diagramId: string,
    snapshotId: string,
    userId: string,
  ): Promise<DiagramResponseDto> {
    const diagram = await this.diagramRepository.findById(diagramId);
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }
    if (diagram.projectId) {
      await this.checkProjectAccess(diagram.projectId, userId, true);
    }
    if (!this.snapshotRepository) {
      throw new NotFoundException('Snapshot no encontrado');
    }

    const snapshot = await this.snapshotRepository.findById(snapshotId);
    if (!snapshot || snapshot.diagramId !== diagramId) {
      throw new NotFoundException('Checkpoint/Snapshot no encontrado para este diagrama');
    }

    return this.saveAst(
      diagramId,
      {
        defaultLineStyle: diagram.defaultLineStyle,
        nodes: (snapshot.nodes || []).map((n) => ({
          id: n.id,
          name: n.name,
          elementType: n.elementType,
          stereotype: n.stereotype,
          noteContent: n.noteContent,
          positionX: n.positionX,
          positionY: n.positionY,
          width: n.width,
          height: n.height,
          isAnchor: n.isAnchor,
          assocMainConnId: n.assocMainConnId,
          attributes: n.attributes,
          methods: n.methods,
        })),
        connections: (snapshot.connections || []).map((c) => ({
          id: c.id,
          sourceNodeId: c.sourceNodeId,
          targetNodeId: c.targetNodeId,
          sourceId: c.sourceId,
          targetId: c.targetId,
          type: c.type,
          lineStyle: c.lineStyle,
          name: c.name,
          sourceMultiplicity: c.sourceMultiplicity,
          targetMultiplicity: c.targetMultiplicity,
          assocAnchorNodeId: c.assocAnchorNodeId,
        })),
      },
      userId,
      {
        recordEvent: true,
        actionLabel: `Restauró checkpoint "${snapshot.label}"`,
      },
    );
  }

  async remove(id: string, userId: string): Promise<{ success: boolean; message: string }> {
    const diagram = await this.diagramRepository.findById(id);
    if (!diagram) {
      throw new NotFoundException('Diagrama no encontrado');
    }

    if (diagram.projectId) {
      await this.checkProjectAccess(diagram.projectId, userId, true);
    }

    await this.snapshotRepository?.deleteByDiagramIds([id]);
    await this.diagramRepository.delete(id);
    return { success: true, message: 'Diagrama eliminado exitosamente' };
  }

  private hasNodeSemanticChanged(
    prev: UmlNode,
    next: { name: string; elementType: string; noteContent: string | null; attributes: any[]; methods: any[] },
  ): boolean {
    if (prev.name !== next.name || (prev.elementType || 'CLASS') !== next.elementType) {
      return true;
    }
    if ((prev.noteContent || null) !== next.noteContent) return true;
    const prevAttrs = (prev.attributes || []).map((a) => `${a.visibility}:${a.name}:${a.type}:${Boolean(a.isPrimaryKey)}`).join('|');
    const nextAttrs = (next.attributes || []).map((a) => `${a.visibility}:${a.name}:${a.type}:${Boolean(a.isPrimaryKey)}`).join('|');
    if (prevAttrs !== nextAttrs) return true;

    const prevMethods = (prev.methods || []).map((m) => `${m.visibility}:${m.name}(${m.parameters}):${m.returnType}`).join('|');
    const nextMethods = (next.methods || []).map((m) => `${m.visibility}:${m.name}(${m.parameters}):${m.returnType}`).join('|');
    return prevMethods !== nextMethods;
  }

  private computeAstDiff(
    prevNodes: UmlNode[],
    prevConns: UmlConnection[],
    nextNodes: UmlNode[],
    nextConns: UmlConnection[],
  ) {
    const prevVisible = new Map(
      prevNodes.filter((n) => !n.isAnchor).map((n) => [n.id, n]),
    );
    const nextVisible = new Map(
      nextNodes.filter((n) => !n.isAnchor).map((n) => [n.id, n]),
    );

    const addedClasses: string[] = [];
    const modifiedClasses: string[] = [];
    const removedClasses: string[] = [];

    for (const [id, nextNode] of nextVisible.entries()) {
      const prevNode = prevVisible.get(id);
      if (!prevNode) {
        addedClasses.push(nextNode.name);
      } else if (
        this.hasNodeSemanticChanged(prevNode, {
          name: nextNode.name,
          elementType: nextNode.elementType,
          noteContent: nextNode.noteContent ?? null,
          attributes: nextNode.attributes || [],
          methods: nextNode.methods || [],
        })
      ) {
        modifiedClasses.push(nextNode.name);
      }
    }

    for (const [id, prevNode] of prevVisible.entries()) {
      if (!nextVisible.has(id)) {
        removedClasses.push(prevNode.name);
      }
    }

    const prevConnIds = new Set(prevConns.map((c) => c.id));
    const nextConnIds = new Set(nextConns.map((c) => c.id));
    let addedRelations = 0;
    let removedRelations = 0;
    for (const id of nextConnIds) if (!prevConnIds.has(id)) addedRelations++;
    for (const id of prevConnIds) if (!nextConnIds.has(id)) removedRelations++;

    return {
      addedClasses,
      removedClasses,
      modifiedClasses,
      addedRelations,
      removedRelations,
    };
  }

  private normalizeVisibility(raw: string | undefined, fallback: '+' | '-' | '#' | '~' = '-'): '+' | '-' | '#' | '~' {
    const val = (raw || '').trim().toLowerCase();
    if (val === '+' || val === 'public') return '+';
    if (val === '-' || val === 'private') return '-';
    if (val === '#' || val === 'protected') return '#';
    if (val === '~' || val === 'package') return '~';
    return fallback;
  }

  private normalizeElementType(raw: string | undefined, assocMainConnId?: string | null): string {
    const upper = (raw || '').trim().toUpperCase();
    if (
      upper === 'INTERFACE' ||
      upper === 'ENUM' ||
      upper === 'NOTE' ||
      upper === 'ASSOCIATION_CLASS' ||
      upper === 'CLASS'
    ) {
      return upper;
    }
    return assocMainConnId ? 'ASSOCIATION_CLASS' : 'CLASS';
  }
}
