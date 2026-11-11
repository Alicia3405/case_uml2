import {
  Component,
  signal,
  ViewChild,
  ElementRef,
  OnInit,
  OnDestroy,
  HostListener,
  inject,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  FFlowModule,
  FCreateConnectionEvent,
  FReassignConnectionEvent,
  FDragStartedEvent,
  FCanvasComponent,
  FZoomDirective,
  FCanvasChangeEvent,
  FTriggerEvent,
} from '@foblex/flow';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroMagnifyingGlassPlus,
  heroMagnifyingGlassMinus,
  heroArrowsPointingOut,
  heroDocumentText,
  heroArrowDownTray,
  heroArrowUpTray,
  heroTrash,
  heroPlus,
  heroXMark,
  heroClipboardDocument,
  heroCheck,
  heroCursorArrowRays,
  heroChevronRight,
  heroChevronDown,
  heroSquares2x2,
  heroCube,
  heroArrowsRightLeft,
  heroArrowRightOnRectangle,
  heroUserCircle,
  heroFolder,
  heroCloudArrowUp,
  heroUserGroup,
  heroSparkles,
  heroBolt,
  heroCommandLine,
  heroCpuChip,
  heroArrowPath,
  heroEye,
  heroLockClosed,
  heroLockOpen,
  heroBars3,
  heroBars3CenterLeft,
  heroChevronLeft,
  heroRectangleStack,
  heroHome,
  heroKey,
  heroCodeBracket,
  heroQueueList,
  heroChatBubbleBottomCenterText,
} from '@ng-icons/heroicons/outline';

import { AuthService } from '../../../core/services/auth.service';
import { DiagramService } from '../../../core/services/diagram.service';
import { ProjectService } from '../../../core/services/project.service';
import { CollaborationService, NodeLock } from '../../../core/services/collaboration.service';
import { AiAssistantService } from '../../../core/services/ai-assistant.service';
import { XmiService } from '../../../core/services/xmi.service';
import { XmiClientParser } from '../../../core/services/xmi-client-parser';
import { XmiClientSerializer } from '../../../core/services/xmi-client-serializer';
import { BmpExportService } from '../../../core/services/bmp-export.service';
import { VoiceCommandService, ParsedVoiceCommand } from '../../../core/services/voice-command.service';
import { ProjectMember } from '../../../core/models/project.model';
import {
  UmlRelationshipType,
  UmlLineStyle,
  UmlVisibility,
  UmlElementType,
  UmlAttribute,
  UmlMethod,
  UmlClassNode,
  UmlConnection,
  SaveDiagramAstRequest,
  UML_RELATION_TYPES,
  UML_LINE_STYLES,
  UML_VISIBILITY_OPTIONS,
} from '../../../core/models/diagram.model';

import { DiagramAppbarComponent } from './components/diagram-appbar/diagram-appbar.component';
import { DiagramToolboxComponent } from './components/diagram-toolbox/diagram-toolbox.component';
import { AiAssistantPanelComponent } from './components/ai-assistant-panel/ai-assistant-panel.component';
import { UserProfileModalComponent } from './components/user-profile-modal/user-profile-modal.component';
import { SpringBootModalComponent } from './components/spring-boot-modal/spring-boot-modal.component';
import { UmlAuditModalComponent } from './components/uml-audit-modal/uml-audit-modal.component';
import { SqlDdlModalComponent } from './components/sql-ddl-modal/sql-ddl-modal.component';
import { XmiValidatorModalComponent } from './components/xmi-validator-modal/xmi-validator-modal.component';
import { UmlVoiceDockComponent } from './components/uml-voice-dock/uml-voice-dock.component';
import { CollaborationPanelComponent } from './components/collaboration-panel/collaboration-panel.component';
import { TranslatePipe } from '../../../core/i18n';

export interface UmlDiagramProject {
  version: string;
  name: string;
  createdDate: string;
  defaultLineStyle: UmlLineStyle;
  nodes: UmlClassNode[];
  connections: UmlConnection[];
}

interface DiagramSnapshot {
  nodes: UmlClassNode[];
  connections: UmlConnection[];
  defaultLineStyle: UmlLineStyle;
}

@Component({
  standalone: true,
  selector: 'app-diagram-editor',
  imports: [
    CommonModule,
    FormsModule,
    FFlowModule,
    NgIconComponent,
    DiagramAppbarComponent,
    DiagramToolboxComponent,
    AiAssistantPanelComponent,
    UserProfileModalComponent,
    SpringBootModalComponent,
    UmlAuditModalComponent,
    SqlDdlModalComponent,
    XmiValidatorModalComponent,
    UmlVoiceDockComponent,
    CollaborationPanelComponent,
    TranslatePipe,
  ],
  providers: [
    provideIcons({
      heroMagnifyingGlassPlus,
      heroMagnifyingGlassMinus,
      heroArrowsPointingOut,
      heroDocumentText,
      heroArrowDownTray,
      heroArrowUpTray,
      heroTrash,
      heroPlus,
      heroXMark,
      heroClipboardDocument,
      heroCheck,
      heroCursorArrowRays,
      heroChevronRight,
      heroChevronDown,
      heroSquares2x2,
      heroCube,
      heroArrowsRightLeft,
      heroArrowRightOnRectangle,
      heroUserCircle,
      heroFolder,
      heroCloudArrowUp,
      heroUserGroup,
      heroSparkles,
      heroBolt,
      heroCommandLine,
      heroCpuChip,
      heroArrowPath,
      heroEye,
      heroLockClosed,
      heroLockOpen,
      heroBars3,
      heroBars3CenterLeft,
      heroChevronLeft,
      heroRectangleStack,
      heroHome,
      heroKey,
      heroCodeBracket,
      heroQueueList,
      heroChatBubbleBottomCenterText,
    }),
  ],
  templateUrl: './diagram-editor.component.html',
  styleUrl: './diagram-editor.component.css',
})
export class DiagramEditorComponent implements OnInit, OnDestroy {
  readonly authService = inject(AuthService);
  readonly diagramService = inject(DiagramService);
  readonly projectService = inject(ProjectService);
  readonly collaborationService = inject(CollaborationService);
  readonly aiAssistantService = inject(AiAssistantService);
  readonly xmiService = inject(XmiService);
  readonly xmiClientSerializer = inject(XmiClientSerializer);
  readonly bmpExportService = inject(BmpExportService);
  readonly voiceCommandService = inject(VoiceCommandService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  @ViewChild(FCanvasComponent) canvas?: FCanvasComponent;
  @ViewChild(FZoomDirective) fZoom?: FZoomDirective;
  @ViewChild('flowContainer') flowContainerRef?: ElementRef<HTMLElement>;

  // Contexto del diagrama y proyecto
  currentDiagramId = signal<string | null>(null);
  currentProjectId = signal<string | null>(null);
  currentDiagramName = signal<string>('Diagrama UML');
  saveSuccessMessage = signal<boolean>(false);
  hasUnsavedChanges = signal<boolean>(false);
  zoomLevel = signal<number>(100);

  markAsUnsaved(): void {
    if (!this.isReadOnly()) {
      this.hasUnsavedChanges.set(true);
    }
  }

  // Rol y permisos granulares del usuario actual en el proyecto
  currentUserRole = signal<string>('EDITOR');
  currentUserCanDownloadCode = signal<boolean>(true);
  projectMembers = signal<ProjectMember[]>([]);
  projectCreatedBy = signal<string | null>(null);
  permissionToast = signal<string | null>(null);
  readonly isReadOnly = computed(() => this.currentUserRole() === 'VIEWER');

  // Modo Seleccionar / Mover o Crear Relación
  selectedRelationType = signal<UmlRelationshipType | null>(null);
  selectedSourceNodeId = signal<string | null>(null);
  selectedNodeId = signal<string | null>(null);
  defaultLineStyle = signal<UmlLineStyle>('segment');
  mouseCanvasPos = signal<{ x: number; y: number }>({ x: 0, y: 0 });

  // Control de movimiento del lienzo (deshabilita el paneo con clic primario al crear relaciones)
  canvasMoveTrigger = (event: FTriggerEvent): boolean => {
    if (this.selectedRelationType() !== null) {
      if (event instanceof MouseEvent && (event.buttons === 4 || event.button === 1)) {
        return true;
      }
      return false;
    }
    return true;
  };

  // Paneles laterales
  isToolboxOpen = signal<boolean>(true);
  isAiPanelOpen = signal<boolean>(true);
  isCollabPanelOpen = signal<boolean>(false);
  isExportDropdownOpen = signal<boolean>(false);
  isImportDropdownOpen = signal<boolean>(false);

  // Opciones de multiplicidad estándar
  readonly multiplicityOptions: string[] = ['1', '0..1', '1..*', '0..*', '*', 'n', 'm'];

  // Tipos de datos predefinidos
  readonly predefinedTypes: string[] = [
    'UUID', 'String', 'Integer', 'Long', 'Boolean', 'Double',
    'Float', 'BigDecimal', 'LocalDate', 'LocalDateTime', 'Date', 'Text', 'byte[]'
  ];

  // Tipos de retorno predefinidos
  readonly predefinedReturnTypes: string[] = [
    'void', 'UUID', 'String', 'Integer', 'Long', 'Boolean',
    'Double', 'BigDecimal', 'LocalDate', 'LocalDateTime', 'List<Object>', 'Object'
  ];

  // Lista de relaciones (reutilizadas en modal de conexión)
  readonly relationTypes = UML_RELATION_TYPES;

  // Estilos de línea Enterprise Architect y Visibilidad UML
  readonly lineStyles = UML_LINE_STYLES;
  readonly visibilityOptions = UML_VISIBILITY_OPTIONS;

  // Modales de edición
  isEditNodeModalOpen = signal<boolean>(false);
  isEditConnModalOpen = signal<boolean>(false);
  editingNode = signal<UmlClassNode | null>(null);
  editingConnection = signal<UmlConnection | null>(null);

  // Modal JSON
  showJsonModal = signal<boolean>(false);
  jsonContent = signal<string>('');
  jsonModalMode = signal<'import' | 'export'>('export');

  // Modal Perfil y Modales CASE Bloque 1
  isProfileModalOpen = signal<boolean>(false);
  showSpringBootModal = signal<boolean>(false);
  showAuditModal = signal<boolean>(false);
  showSqlModal = signal<boolean>(false);
  showXmiModal = signal<boolean>(false);

  // Nodos y Conexiones del Diagrama
  nodes = signal<UmlClassNode[]>([]);
  connections = signal<UmlConnection[]>([]);

  // Historial Undo / Redo (AST Completo)
  private readonly MAX_HISTORY = 40;
  private undoStack: DiagramSnapshot[] = [];
  private redoStack: DiagramSnapshot[] = [];
  private pendingDragSnapshot: DiagramSnapshot | null = null;
  private dragMovedDuringSession = false;
  canUndo = signal<boolean>(false);
  canRedo = signal<boolean>(false);
  undoCount = signal<number>(0);
  redoCount = signal<number>(0);

  private animationTimers: any[] = [];
  private permissionToastTimer: any = null;
  private readonly subs = new Subscription();

  ngOnInit(): void {
    this.subs.add(
      this.collaborationService.remoteNodeDrag$.subscribe((data) => {
        this.nodes.update((list) =>
          list.map((n) => (n.id === data.nodeId ? { ...n, position: data.position } : n)),
        );
        this.updateConnectionEndpoints();
      }),
    );

    this.subs.add(
      this.collaborationService.remoteDiagramSync$.subscribe((data) => {
        if (data.action === 'ai_mutation' && data.nodes) {
          this.applyAiMutationWithAnimation(data.nodes, data.connections || []);
        } else if (data.nodes) {
          const cleanNodes = this.applyAiNodesMutation(data.nodes);
          this.nodes.set(cleanNodes);
          const cleanConns = this.sanitizeClientConnections(data.connections || [], cleanNodes);
          this.connections.set(cleanConns);
          this.updateConnectionEndpoints();
          setTimeout(() => this.updateConnectionEndpoints(), 60);
        }
      }),
    );

    this.subs.add(
      this.collaborationService.nodeLockRejected$.subscribe((data) => {
        if (this.editingNode()?.id === data.nodeId) {
          this.isEditNodeModalOpen.set(false);
          this.editingNode.set(null);
          alert(`🔒 La tabla está siendo editada por ${data.lockedBy.userName}. Por favor espera.`);
        }
      }),
    );

    this.subs.add(
      this.collaborationService.projectPermissionsUpdated$.subscribe((event) => {
        const pid = this.currentProjectId();
        if (!pid || event.projectId !== pid) return;

        const currentUserId = this.authService.currentUser()?.id;
        if (currentUserId && event.userId === currentUserId) {
          if (event.removed) {
            this.collaborationService.leaveRoom();
            alert('Has sido removido de este proyecto por el propietario.');
            this.router.navigate(['/projects']);
            return;
          }

          if (event.role) {
            this.currentUserRole.set(event.role);
            if (event.role === 'VIEWER') {
              this.setPointerMode();
              this.closeEditNodeModal();
              this.closeEditConnModal();
              if (this.voiceCommandService.isListening()) {
                this.voiceCommandService.stopListening();
              }
            }
          }

          if (event.canDownloadCode !== undefined) {
            this.currentUserCanDownloadCode.set(event.canDownloadCode);
          }

          this.showPermissionToast(
            `Tus permisos fueron actualizados → Rol: ${this.currentUserRole()} • ZIP: ${this.currentUserCanDownloadCode() ? 'Permitido' : 'Restringido'}`,
          );
        }

        this.refreshProjectPermissions(pid);
      }),
    );

    this.subs.add(
      this.voiceCommandService.commandDetected$.subscribe((cmd) => {
        this.executeVoiceCommand(cmd);
      }),
    );

    this.subs.add(
      this.route.queryParams.subscribe((params) => {
        const diagramId = params['diagramId'];
        const projectId = params['projectId'];
        const projectName = params['projectName'];

        if (projectId) {
          this.currentProjectId.set(projectId);
          this.refreshProjectPermissions(projectId);
        }

        if (projectName) {
          this.currentDiagramName.set(projectName);
        }

        if (diagramId) {
          this.currentDiagramId.set(diagramId);
          this.loadDiagramFromBackend(diagramId);
        } else if (projectId) {
          this.diagramService.loadDiagramsByProject(projectId).subscribe((diagrams) => {
            if (diagrams && diagrams.length > 0) {
              const first = diagrams[0];
              this.currentDiagramId.set(first.id);
              this.currentDiagramName.set(first.name);
              this.loadDiagramFromBackend(first.id);
            }
          });
        }
      }),
    );

    this.updateConnectionEndpoints();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (this.voiceCommandService.isListening()) {
      this.voiceCommandService.stopListening();
    }
    if (this.permissionToastTimer) {
      clearTimeout(this.permissionToastTimer);
      this.permissionToastTimer = null;
    }
    if (this.editingNode()) {
      this.collaborationService.releaseNodeLock(this.editingNode()!.id);
    }
    this.animationTimers.forEach((t) => clearTimeout(t));
    this.animationTimers = [];
    this.collaborationService.leaveRoom();
  }

  refreshProjectPermissions(explicitProjectId?: string | null): void {
    const projectId = explicitProjectId ?? this.currentProjectId();
    if (!projectId) return;

    this.projectService.getProject(projectId).subscribe({
      next: (project) => {
        const user = this.authService.currentUser();
        this.projectCreatedBy.set(project.createdBy || null);
        this.projectMembers.set(project.members || []);

        if (user && project) {
          let resolvedRole = project.userRole;
          if (!resolvedRole) {
            if (project.createdBy === user.id) {
              resolvedRole = 'OWNER';
            } else {
              const myMember = project.members?.find((m) => m.userId === user.id);
              if (myMember) {
                resolvedRole = myMember.role;
              }
            }
          }
          if (resolvedRole) {
            this.currentUserRole.set(resolvedRole);
          }

          if (project.userCanDownloadCode !== undefined) {
            this.currentUserCanDownloadCode.set(project.userCanDownloadCode);
          } else if (project.createdBy === user.id || resolvedRole === 'OWNER') {
            this.currentUserCanDownloadCode.set(true);
          } else {
            const myMember = project.members?.find((m) => m.userId === user.id);
            if (myMember && myMember.canDownloadCode !== undefined) {
              this.currentUserCanDownloadCode.set(myMember.canDownloadCode);
            }
          }
        }
      },
      error: () => {},
    });
  }

  private showPermissionToast(msg: string): void {
    this.permissionToast.set(msg);
    if (this.permissionToastTimer) {
      clearTimeout(this.permissionToastTimer);
    }
    this.permissionToastTimer = setTimeout(() => {
      this.permissionToast.set(null);
      this.permissionToastTimer = null;
    }, 4500);
  }

  toggleCollabPanel(): void {
    const next = !this.isCollabPanelOpen();
    this.isCollabPanelOpen.set(next);
    if (next && typeof window !== 'undefined' && window.innerWidth < 1500) {
      this.isAiPanelOpen.set(false);
    }
  }

  openAiPanel(): void {
    this.isAiPanelOpen.set(true);
    if (typeof window !== 'undefined' && window.innerWidth < 1500) {
      this.isCollabPanelOpen.set(false);
    }
  }

  private createSnapshot(): DiagramSnapshot {
    return {
      nodes: JSON.parse(JSON.stringify(this.nodes())),
      connections: JSON.parse(JSON.stringify(this.connections())),
      defaultLineStyle: this.defaultLineStyle(),
    };
  }

  private applySnapshot(snapshot: DiagramSnapshot): void {
    this.nodes.set(JSON.parse(JSON.stringify(snapshot.nodes)));
    this.connections.set(JSON.parse(JSON.stringify(snapshot.connections)));
    this.defaultLineStyle.set(this.normalizeLineStyle(snapshot.defaultLineStyle));

    const selId = this.selectedNodeId();
    if (selId && !this.nodes().some((n) => n.id === selId)) {
      this.selectedNodeId.set(null);
    }
    this.setPointerMode();
    this.markAsUnsaved();
    this.updateConnectionEndpoints();
    setTimeout(() => this.updateConnectionEndpoints(), 40);
  }

  private syncHistorySignals(): void {
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
    this.undoCount.set(this.undoStack.length);
    this.redoCount.set(this.redoStack.length);
  }

  pushUndoSnapshot(): void {
    if (this.isReadOnly()) return;
    this.undoStack.push(this.createSnapshot());
    if (this.undoStack.length > this.MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.syncHistorySignals();
  }

  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.pendingDragSnapshot = null;
    this.dragMovedDuringSession = false;
    this.syncHistorySignals();
  }

  undo(): void {
    if (this.isReadOnly() || this.undoStack.length === 0) return;
    const prev = this.undoStack.pop()!;
    this.redoStack.push(this.createSnapshot());
    this.applySnapshot(prev);
    this.syncHistorySignals();
    this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'undo');
  }

  redo(): void {
    if (this.isReadOnly() || this.redoStack.length === 0) return;
    const next = this.redoStack.pop()!;
    this.undoStack.push(this.createSnapshot());
    if (this.undoStack.length > this.MAX_HISTORY) {
      this.undoStack.shift();
    }
    this.applySnapshot(next);
    this.syncHistorySignals();
    this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'redo');
  }

  onFlowDragStarted(event: FDragStartedEvent): void {
    if (this.isReadOnly()) return;
    if (event.kind === 'drag-node' || event.fEventType === 'move-node') {
      this.pendingDragSnapshot = this.createSnapshot();
      this.dragMovedDuringSession = false;
    }
  }

  onFlowDragEnded(): void {
    if (this.pendingDragSnapshot && this.dragMovedDuringSession && !this.isReadOnly()) {
      this.undoStack.push(this.pendingDragSnapshot);
      if (this.undoStack.length > this.MAX_HISTORY) {
        this.undoStack.shift();
      }
      this.redoStack = [];
      this.syncHistorySignals();
    }
    this.pendingDragSnapshot = null;
    this.dragMovedDuringSession = false;
  }

  loadDiagramFromBackend(diagramId: string): void {
    this.diagramService.loadDiagram(diagramId).subscribe((diagram) => {
      this.currentDiagramName.set(diagram.name);
      this.defaultLineStyle.set(this.normalizeLineStyle(diagram.defaultLineStyle));

      const rawNodes = diagram.nodes || [];
      const customTypeNames = rawNodes
        .filter((n) => !n.isAnchor && n.name)
        .map((n) => n.name.trim());

      this.nodes.set(
        rawNodes.map((n) => {
          const elementType = this.normalizeElementType(n.elementType);
          return {
            id: n.id,
            name: n.name,
            elementType,
            stereotype: n.stereotype || undefined,
            noteContent: n.noteContent ?? undefined,
            position: { x: n.positionX, y: n.positionY },
            width: n.width || 220,
            height: n.height || undefined,
            isAnchor: n.isAnchor,
            assocMainConnId: n.assocMainConnId || undefined,
            attributes: (n.attributes || []).map((a, idx) => ({
              name: a.name,
              type: elementType === 'ENUM' ? 'EnumLiteral' : this.normalizeDataType(a.type, customTypeNames),
              visibility: this.normalizeVisibility(a.visibility, elementType === 'ENUM' ? '+' : '-'),
              isPrimaryKey: Boolean(a.isPrimaryKey),
              isNullable: a.isNullable !== undefined ? Boolean(a.isNullable) : !a.isPrimaryKey,
              orderIndex: a.orderIndex ?? idx,
            })),
            methods: (n.methods || []).map((m, idx) => ({
              name: m.name,
              parameters: m.parameters || '',
              returnType: this.normalizeReturnType(m.returnType, customTypeNames),
              visibility: this.normalizeVisibility(m.visibility, '+'),
              orderIndex: m.orderIndex ?? idx,
            })),
          };
        }),
      );

      this.connections.set(
        (diagram.connections || []).map((c) => ({
          id: c.id,
          sourceNodeId: c.sourceNodeId || undefined,
          targetNodeId: c.targetNodeId || undefined,
          sourceId: c.sourceId,
          targetId: c.targetId,
          type: c.type as UmlRelationshipType,
          lineStyle: this.normalizeLineStyle(c.lineStyle),
          name: c.name || undefined,
          sourceMultiplicity: c.sourceMultiplicity || '',
          targetMultiplicity: c.targetMultiplicity || '',
          assocAnchorNodeId: c.assocAnchorNodeId || undefined,
        })),
      );

      this.collaborationService.joinRoom(diagramId);

      this.clearHistory();
      this.hasUnsavedChanges.set(false);
      setTimeout(() => {
        this.updateConnectionEndpoints();
      }, 50);
    });
  }

  normalizeElementType(type: unknown): UmlElementType {
    const t = String(type || 'CLASS').trim().toUpperCase();
    if (t === 'INTERFACE' || t === 'ENUM' || t === 'NOTE' || t === 'ASSOCIATION_CLASS') {
      return t;
    }
    return 'CLASS';
  }

  normalizeLineStyle(style: unknown): UmlLineStyle {
    const s = String(style || 'segment').trim();
    if (s === 'segment' || s === 'straight' || s === 'bezier' || s === 'adaptive-curve') {
      return s;
    }
    return 'segment';
  }

  normalizeVisibility(visibility: unknown, fallback: UmlVisibility = '-'): UmlVisibility {
    const v = String(visibility || '').trim().toLowerCase();
    if (v === '+' || v === 'public') return '+';
    if (v === '-' || v === 'private') return '-';
    if (v === '#' || v === 'protected') return '#';
    if (v === '~' || v === 'package') return '~';
    return fallback;
  }

  normalizeDataType(type: string, customTypeNames: string[] = []): string {
    if (!type || !type.trim()) return 'String';
    const trimmed = type.trim();
    const lower = trimmed.toLowerCase();
    if (lower === 'enumliteral') return 'EnumLiteral';

    const predefined = this.predefinedTypes.find((t) => t.toLowerCase() === lower);
    if (predefined) return predefined;

    if (lower === 'varchar' || lower === 'char' || lower === 'nvarchar') return 'String';
    if (lower === 'int' || lower === 'smallint' || lower === 'serial') return 'Integer';
    if (lower === 'bigint' || lower === 'int8' || lower === 'bigserial') return 'Long';
    if (lower === 'bool') return 'Boolean';
    if (lower === 'decimal' || lower === 'numeric') return 'BigDecimal';
    if (lower === 'timestamp' || lower === 'datetime') return 'LocalDateTime';

    const custom = customTypeNames.find((ct) => ct.toLowerCase() === lower);
    if (custom) return custom;

    return trimmed;
  }

  normalizeReturnType(type: string, customTypeNames: string[] = []): string {
    if (!type || !type.trim()) return 'void';
    const trimmed = type.trim();
    const lower = trimmed.toLowerCase();

    const predefined = this.predefinedReturnTypes.find((rt) => rt.toLowerCase() === lower);
    if (predefined) return predefined;

    const custom = customTypeNames.find((ct) => ct.toLowerCase() === lower);
    if (custom) return custom;

    return trimmed;
  }

  getNodeLock(nodeId: string): NodeLock | undefined {
    return this.collaborationService.activeNodeLocks().get(nodeId);
  }

  isNodeLockedByOther(nodeId: string): boolean {
    const lock = this.collaborationService.activeNodeLocks().get(nodeId);
    const currentUserId = this.authService.currentUser()?.id;
    return !!lock && lock.userId !== currentUserId;
  }

  private hasAnyModalOpen(): boolean {
    return (
      this.isEditNodeModalOpen() ||
      this.isEditConnModalOpen() ||
      this.showJsonModal() ||
      this.showSpringBootModal() ||
      this.isProfileModalOpen() ||
      this.showAuditModal() ||
      this.showSqlModal() ||
      this.showXmiModal()
    );
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    const activeEl = document.activeElement as HTMLElement | null;
    const activeTag = (activeEl?.tagName || '').toLowerCase();
    const isTyping =
      activeTag === 'input' ||
      activeTag === 'textarea' ||
      activeTag === 'select' ||
      Boolean(activeEl?.isContentEditable);

    if (event.key === 'Escape') {
      this.selectedNodeId.set(null);
      this.setPointerMode();
      this.closeEditNodeModal();
      this.closeEditConnModal();
      this.showJsonModal.set(false);
      this.showSpringBootModal.set(false);
      this.showAuditModal.set(false);
      this.showSqlModal.set(false);
      this.showXmiModal.set(false);
      this.isProfileModalOpen.set(false);
      this.isExportDropdownOpen.set(false);
    } else if ((event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey) {
      if (!isTyping && !this.hasAnyModalOpen() && !this.isReadOnly()) {
        event.preventDefault();
        this.undo();
      }
    } else if ((event.ctrlKey || event.metaKey) && (key === 'y' || (key === 'z' && event.shiftKey))) {
      if (!isTyping && !this.hasAnyModalOpen() && !this.isReadOnly()) {
        event.preventDefault();
        this.redo();
      }
    } else if ((event.ctrlKey || event.metaKey) && key === 's') {
      event.preventDefault();
      if (!this.isReadOnly()) {
        this.saveToBackend();
      }
    } else if ((event.ctrlKey || event.metaKey) && key === 'b') {
      event.preventDefault();
      this.isToolboxOpen.set(!this.isToolboxOpen());
    } else if ((event.ctrlKey || event.metaKey) && key === 'i') {
      event.preventDefault();
      if (this.isAiPanelOpen()) {
        this.isAiPanelOpen.set(false);
      } else {
        this.openAiPanel();
      }
    } else if ((event.ctrlKey || event.metaKey) && key === 'm') {
      if (!isTyping && !this.hasAnyModalOpen() && !this.isReadOnly()) {
        event.preventDefault();
        this.voiceCommandService.toggleListening();
      }
    } else if (event.key === 'Delete' && this.selectedNodeId() && !this.isReadOnly()) {
      if (!isTyping && !this.hasAnyModalOpen()) {
        event.preventDefault();
        this.removeClass(this.selectedNodeId()!);
      }
    }
  }

  saveToBackend(): void {
    if (this.isReadOnly()) return;

    const diagramId = this.currentDiagramId();
    if (!diagramId) {
      this.openExportModal();
      return;
    }

    const payload: SaveDiagramAstRequest = {
      defaultLineStyle: this.defaultLineStyle(),
      nodes: this.nodes().map((n) => {
        const elementType = this.normalizeElementType(n.elementType);
        return {
          id: n.id,
          name: n.isAnchor
            ? (n.name || 'Anchor')
            : elementType === 'NOTE'
              ? (n.name || 'Nota')
              : n.name,
          elementType,
          stereotype: n.stereotype ?? null,
          noteContent: n.noteContent ?? null,
          positionX: n.position.x,
          positionY: n.position.y,
          width: n.width ?? 220,
          height: n.height ?? null,
          isAnchor: Boolean(n.isAnchor),
          assocMainConnId: n.assocMainConnId ?? null,
          attributes: (n.attributes || []).map((a, idx) => ({
            name: a.name,
            type: elementType === 'ENUM' ? 'EnumLiteral' : (a.type || 'String'),
            visibility: this.normalizeVisibility(a.visibility, elementType === 'ENUM' ? '+' : '-'),
            isPrimaryKey: Boolean(a.isPrimaryKey),
            isNullable: a.isNullable ?? !a.isPrimaryKey,
            orderIndex: idx,
          })),
          methods: (n.methods || []).map((m, idx) => ({
            name: m.name,
            parameters: m.parameters || '',
            returnType: m.returnType || 'void',
            visibility: this.normalizeVisibility(m.visibility, '+'),
            orderIndex: idx,
          })),
        };
      }),
      connections: this.connections().map((c) => {
        const baseSourceId = c.sourceNodeId || c.sourceId.replace(/_(top|bottom|left|right)$/, '');
        const baseTargetId = c.targetNodeId || c.targetId.replace(/_(top|bottom|left|right)$/, '');
        return {
          id: c.id,
          sourceNodeId: baseSourceId,
          targetNodeId: baseTargetId,
          sourceId: c.sourceId,
          targetId: c.targetId,
          type: c.type,
          lineStyle: c.lineStyle || this.defaultLineStyle(),
          name: c.name || null,
          sourceMultiplicity: c.sourceMultiplicity || '',
          targetMultiplicity: c.targetMultiplicity || '',
          assocAnchorNodeId: c.assocAnchorNodeId || null,
        };
      }),
    };

    this.diagramService.saveAst(diagramId, payload).subscribe({
      next: () => {
        this.hasUnsavedChanges.set(false);
        this.saveSuccessMessage.set(true);
        setTimeout(() => this.saveSuccessMessage.set(false), 2500);
        this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'save');
        this.collaborationService.sendActivityLog(
          'Guardó el diagrama en la base de datos',
          `${this.nodes().filter((n) => !n.isAnchor).length} elementos`,
          'uml',
        );
      },
    });
  }

  selectRelationType(type: UmlRelationshipType): void {
    if (this.isReadOnly()) return;

    if (this.selectedRelationType() === type) {
      this.selectedRelationType.set(null);
      this.selectedSourceNodeId.set(null);
    } else {
      this.selectedRelationType.set(type);
      this.selectedSourceNodeId.set(null);
    }
  }

  setPointerMode(): void {
    this.selectedRelationType.set(null);
    this.selectedSourceNodeId.set(null);
  }

  setDefaultLineStyle(style: UmlLineStyle): void {
    if (this.isReadOnly() || this.defaultLineStyle() === style) return;
    this.pushUndoSnapshot();
    this.defaultLineStyle.set(style);
    this.markAsUnsaved();
    this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'line_style');
  }

  onNodePositionChange(node: UmlClassNode, newPosition: { x: number; y: number }): void {
    if (this.isReadOnly() || this.isNodeLockedByOther(node.id)) return;
    if (node.position.x !== newPosition.x || node.position.y !== newPosition.y) {
      this.dragMovedDuringSession = true;
    }
    node.position = newPosition;
    this.markAsUnsaved();
    this.updateConnectionEndpoints();
    this.collaborationService.sendNodeDrag(node.id, newPosition);
  }

  onCanvasMouseMove(event: MouseEvent): void {
    const container = this.flowContainerRef?.nativeElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const rawX = event.clientX - rect.left;
    const rawY = event.clientY - rect.top;

    const scale = this.canvas?.transform?.scale || 1;
    const posX = this.canvas?.transform?.position?.x || 0;
    const posY = this.canvas?.transform?.position?.y || 0;

    const canvasX = (rawX - posX) / scale;
    const canvasY = (rawY - posY) / scale;

    this.collaborationService.sendCursorPosition(canvasX, canvasY);

    if (this.selectedSourceNodeId()) {
      this.mouseCanvasPos.set({ x: canvasX, y: canvasY });
    }
  }

  getNodeHeight(node: UmlClassNode): number {
    if (node.isAnchor) return 0;
    if (node.height && node.height > 0) return node.height;
    const elType = (node.elementType || 'CLASS').toUpperCase();
    if (elType === 'NOTE') {
      const content = (node.noteContent || node.name || '').trim();
      const wrappedLines = Math.max(2, Math.ceil(content.length / 26) + (content.match(/\n/g)?.length || 0));
      return 34 + wrappedLines * 17 + 16;
    }
    const hasStereo =
      elType === 'INTERFACE' ||
      elType === 'ENUM' ||
      Boolean(node.stereotype?.trim());
    const headerH = hasStereo ? 48 : 34;
    const attrCount = (node.attributes || []).length;
    const methodCount = (node.methods || []).length;
    const attrH = attrCount > 0 ? attrCount * 22 + 12 : 28;
    const methodH = methodCount > 0 ? methodCount * 22 + 14 : 0;
    return headerH + attrH + methodH;
  }

  getOptimalConnectorId(sourceNode: UmlClassNode, targetNode: UmlClassNode): { sourceId: string; targetId: string } {
    const sWidth = sourceNode.isAnchor ? 0 : sourceNode.width || 220;
    const sHeight = sourceNode.isAnchor ? 0 : this.getNodeHeight(sourceNode);
    const tWidth = targetNode.isAnchor ? 0 : targetNode.width || 220;
    const tHeight = targetNode.isAnchor ? 0 : this.getNodeHeight(targetNode);

    const sCenter = { x: sourceNode.position.x + sWidth / 2, y: sourceNode.position.y + sHeight / 2 };
    const tCenter = { x: targetNode.position.x + tWidth / 2, y: targetNode.position.y + tHeight / 2 };

    const dx = tCenter.x - sCenter.x;
    const dy = tCenter.y - sCenter.y;

    let sourceSide = '_right';
    let targetSide = '_left';

    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx >= 0) {
        sourceSide = '_right';
        targetSide = '_left';
      } else {
        sourceSide = '_left';
        targetSide = '_right';
      }
    } else {
      if (dy >= 0) {
        sourceSide = '_bottom';
        targetSide = '_top';
      } else {
        sourceSide = '_top';
        targetSide = '_bottom';
      }
    }

    return {
      sourceId: sourceNode.id + (sourceNode.isAnchor ? '' : sourceSide),
      targetId: targetNode.id + (targetNode.isAnchor ? '' : targetSide),
    };
  }

  getConnectorPoint(node: UmlClassNode, side: string): { x: number; y: number } {
    const w = node.isAnchor ? 0 : node.width || 220;
    const h = this.getNodeHeight(node);
    switch (side) {
      case 'left':
        return { x: node.position.x, y: node.position.y + h / 2 };
      case 'right':
        return { x: node.position.x + w, y: node.position.y + h / 2 };
      case 'top':
        return { x: node.position.x + w / 2, y: node.position.y };
      case 'bottom':
        return { x: node.position.x + w / 2, y: node.position.y + h };
      default:
        return { x: node.position.x + w / 2, y: node.position.y + h / 2 };
    }
  }

  updateConnectionEndpoints(): void {
    const nodeMap = new Map(this.nodes().map((n) => [n.id, n]));

    for (const conn of this.connections()) {
      if (conn.assocAnchorNodeId) {
        const anchorNode = nodeMap.get(conn.assocAnchorNodeId);
        const baseSourceId = conn.sourceNodeId || conn.sourceId.replace(/_(top|bottom|left|right)$/, '');
        const baseTargetId = conn.targetNodeId || conn.targetId.replace(/_(top|bottom|left|right)$/, '');
        const sourceNode = nodeMap.get(baseSourceId);
        const targetNode = nodeMap.get(baseTargetId);

        if (anchorNode && sourceNode && targetNode) {
          const optimal = this.getOptimalConnectorId(sourceNode, targetNode);
          const sSide = optimal.sourceId.split('_').pop() || 'right';
          const tSide = optimal.targetId.split('_').pop() || 'left';
          const p1 = this.getConnectorPoint(sourceNode, sSide);
          const p2 = this.getConnectorPoint(targetNode, tSide);
          anchorNode.position = {
            x: Math.round((p1.x + p2.x) / 2),
            y: Math.round((p1.y + p2.y) / 2),
          };
        }
      }
    }

    this.connections.update((conns) =>
      conns
        .filter((conn) => {
          const baseSourceId = conn.sourceNodeId || conn.sourceId.replace(/_(top|bottom|left|right)$/, '');
          const baseTargetId = conn.targetNodeId || conn.targetId.replace(/_(top|bottom|left|right)$/, '');
          return nodeMap.has(baseSourceId) && nodeMap.has(baseTargetId);
        })
        .map((conn) => {
          if (conn.type === 'association_class' && conn.sourceNodeId && conn.targetNodeId) {
            const sourceNode = nodeMap.get(conn.sourceNodeId);
            const targetNode = nodeMap.get(conn.targetNodeId);
            if (sourceNode && targetNode && sourceNode.isAnchor) {
              const optimal = this.getOptimalConnectorId(sourceNode, targetNode);
              return {
                ...conn,
                sourceId: sourceNode.id,
                targetId: optimal.targetId,
              };
            }
          }

          const baseSourceId = conn.sourceNodeId || conn.sourceId.replace(/_(top|bottom|left|right)$/, '');
          const baseTargetId = conn.targetNodeId || conn.targetId.replace(/_(top|bottom|left|right)$/, '');
          const sourceNode = nodeMap.get(baseSourceId);
          const targetNode = nodeMap.get(baseTargetId);

          if (sourceNode && targetNode && !sourceNode.isAnchor && !targetNode.isAnchor) {
            const optimal = this.getOptimalConnectorId(sourceNode, targetNode);
            return {
              ...conn,
              sourceNodeId: baseSourceId,
              targetNodeId: baseTargetId,
              sourceId: optimal.sourceId,
              targetId: optimal.targetId,
            };
          }
          return conn;
        }),
    );
  }

  onCanvasBackgroundClick(): void {
    this.selectedSourceNodeId.set(null);
    this.selectedNodeId.set(null);
  }

  onNodeSelect(nodeId: string, event: MouseEvent): void {
    if (this.selectedRelationType() !== null) return;
    event.stopPropagation();
    this.selectedNodeId.update((curr) => (curr === nodeId ? null : nodeId));
  }

  isConnectionSelected(connId: string): boolean {
    const selId = this.selectedNodeId();
    if (!selId) return false;
    const conn = this.connections().find((c) => c.id === connId);
    if (!conn) return false;
    const s = conn.sourceNodeId || conn.sourceId?.replace(/_(top|bottom|left|right)$/, '');
    const t = conn.targetNodeId || conn.targetId?.replace(/_(top|bottom|left|right)$/, '');
    return s === selId || t === selId;
  }

  isConnectionDimmed(connId: string): boolean {
    const selId = this.selectedNodeId();
    if (!selId) return false;
    const conn = this.connections().find((c) => c.id === connId);
    if (!conn) return false;
    const s = conn.sourceNodeId || conn.sourceId?.replace(/_(top|bottom|left|right)$/, '');
    const t = conn.targetNodeId || conn.targetId?.replace(/_(top|bottom|left|right)$/, '');
    return s !== selId && t !== selId;
  }

  isDiamondAtStart(conn: UmlConnection): boolean {
    const sMult = (conn.sourceMultiplicity || '').trim();
    const tMult = (conn.targetMultiplicity || '').trim();
    const isTargetOne = tMult === '1' || tMult === '0..1';
    const isSourceMany = sMult.includes('*') || sMult.toLowerCase().includes('n');

    if (isTargetOne && isSourceMany) {
      return false;
    }
    return true;
  }

  swapEditingConnectionDirection(): void {
    const c = this.editingConnection();
    if (!c) return;

    const tempSourceNodeId = c.sourceNodeId;
    const tempSourceId = c.sourceId;
    const tempSourceMult = c.sourceMultiplicity;

    c.sourceNodeId = c.targetNodeId;
    c.sourceId = c.targetId;
    c.sourceMultiplicity = c.targetMultiplicity;

    c.targetNodeId = tempSourceNodeId;
    c.targetId = tempSourceId;
    c.targetMultiplicity = tempSourceMult;
  }

  isNeighborNode(nodeId: string): boolean {
    const selId = this.selectedNodeId();
    if (!selId || nodeId === selId) return false;
    return this.connections().some((c) => {
      const s = c.sourceNodeId || c.sourceId?.replace(/_(top|bottom|left|right)$/, '');
      const t = c.targetNodeId || c.targetId?.replace(/_(top|bottom|left|right)$/, '');
      return (s === selId && t === nodeId) || (t === selId && s === nodeId);
    });
  }

  onTableClick(nodeId: string, event: MouseEvent): void {
    if (this.isReadOnly() || this.isNodeLockedByOther(nodeId)) return;

    const activeRel = this.selectedRelationType();
    if (!activeRel) return;

    event.stopPropagation();
    event.preventDefault();
    const currentSource = this.selectedSourceNodeId();

    if (currentSource === null) {
      this.selectedSourceNodeId.set(nodeId);
      this.onCanvasMouseMove(event);
    } else if (currentSource === nodeId) {
      this.selectedSourceNodeId.set(null);
    } else {
      const nodeMap = new Map(this.nodes().map((n) => [n.id, n]));
      const sourceNode = nodeMap.get(currentSource);
      const targetNode = nodeMap.get(nodeId);

      if (!sourceNode || !targetNode) return;

      if (activeRel === 'association_class') {
        this.createAssociationClassBetween(sourceNode, targetNode);
        return;
      }

      this.pushUndoSnapshot();
      const optimal = this.getOptimalConnectorId(sourceNode, targetNode);
      const newConn: UmlConnection = {
        id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        sourceNodeId: currentSource,
        targetNodeId: nodeId,
        sourceId: optimal.sourceId,
        targetId: optimal.targetId,
        type: activeRel,
        lineStyle: this.defaultLineStyle(),
        sourceMultiplicity: '1',
        targetMultiplicity: '1..*',
      };

      this.connections.update((list) => [...list, newConn]);
      this.markAsUnsaved();
      this.setPointerMode();
      this.updateConnectionEndpoints();
      this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'create_conn');
      this.collaborationService.sendActivityLog(
        `Creó relación ${activeRel}: ${sourceNode.name} → ${targetNode.name}`,
        `${newConn.sourceMultiplicity || '-'} a ${newConn.targetMultiplicity || '-'}`,
        'uml',
      );
    }
  }

  onFlowLoaded(): void {
    this.updateConnectionEndpoints();
  }

  onConnectionCreated(event: FCreateConnectionEvent): void {
    if (this.isReadOnly() || !event.fInputId) return;

    const relType = this.selectedRelationType() || 'association';
    const baseSourceId = event.fOutputId.replace(/_(top|bottom|left|right)$/, '');
    const baseTargetId = event.fInputId.replace(/_(top|bottom|left|right)$/, '');

    if (baseSourceId === baseTargetId) return;

    if (this.isNodeLockedByOther(baseSourceId) || this.isNodeLockedByOther(baseTargetId)) {
      alert('🔒 No se pueden crear conexiones hacia/desde una tabla que está siendo editada.');
      return;
    }

    const nodeMap = new Map(this.nodes().map((n) => [n.id, n]));
    const sourceNode = nodeMap.get(baseSourceId);
    const targetNode = nodeMap.get(baseTargetId);

    if (relType === 'association_class' && sourceNode && targetNode) {
      this.createAssociationClassBetween(sourceNode, targetNode);
      return;
    }

    this.pushUndoSnapshot();
    let sourceId = event.fOutputId;
    let targetId = event.fInputId;

    if (sourceNode && targetNode) {
      const optimal = this.getOptimalConnectorId(sourceNode, targetNode);
      sourceId = optimal.sourceId;
      targetId = optimal.targetId;
    }

    const newConnection: UmlConnection = {
      id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      sourceNodeId: baseSourceId,
      targetNodeId: baseTargetId,
      sourceId,
      targetId,
      type: relType,
      lineStyle: this.defaultLineStyle(),
      sourceMultiplicity: '1',
      targetMultiplicity: '1..*',
    };

    this.connections.update((list) => [...list, newConnection]);
    this.markAsUnsaved();
    this.setPointerMode();
    this.updateConnectionEndpoints();

    this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'create_conn');
    this.collaborationService.sendActivityLog(
      `Creó relación ${relType}: ${sourceNode?.name || 'Origen'} → ${targetNode?.name || 'Destino'}`,
      `${newConnection.sourceMultiplicity || '-'} a ${newConnection.targetMultiplicity || '-'}`,
      'uml',
    );
  }

  onConnectionReassigned(event: FReassignConnectionEvent): void {
    if (this.isReadOnly()) return;
    const exists = this.connections().some((c) => c.id === event.connectionId);
    if (!exists) return;

    this.pushUndoSnapshot();
    this.connections.update((list) =>
      list.map((c) => {
        if (c.id === event.connectionId) {
          const nextSourceId = event.nextSourceId || c.sourceId;
          const nextTargetId = event.nextTargetId || c.targetId;
          return {
            ...c,
            sourceNodeId: nextSourceId.replace(/_(top|bottom|left|right)$/, ''),
            targetNodeId: nextTargetId.replace(/_(top|bottom|left|right)$/, ''),
            sourceId: nextSourceId,
            targetId: nextTargetId,
          };
        }
        return c;
      }),
    );
    this.markAsUnsaved();
    this.updateConnectionEndpoints();
    this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'reassign_conn');
  }

  createAssociationClassBetween(sourceNode: UmlClassNode, targetNode: UmlClassNode, skipActivityLog = false): void {
    this.pushUndoSnapshot();
    const timestamp = Date.now();
    const anchorId = `anchor_${timestamp}`;
    const assocNodeId = `node_${timestamp}_assoc`;
    const assocName = `${sourceNode.name}_${targetNode.name}`;

    const anchorNode: UmlClassNode = {
      id: anchorId,
      name: '',
      elementType: 'CLASS',
      position: {
        x: Math.round((sourceNode.position.x + targetNode.position.x) / 2),
        y: Math.round((sourceNode.position.y + targetNode.position.y) / 2),
      },
      width: 0,
      height: 0,
      attributes: [],
      methods: [],
      isAnchor: true,
    };

    const mainConnId = `conn_${timestamp}_assoc_main`;
    const mainConnection: UmlConnection = {
      id: mainConnId,
      sourceNodeId: sourceNode.id,
      targetNodeId: targetNode.id,
      sourceId: `${sourceNode.id}_right`,
      targetId: `${targetNode.id}_left`,
      type: 'association',
      lineStyle: 'straight',
      name: assocName,
      sourceMultiplicity: '*',
      targetMultiplicity: '*',
      assocAnchorNodeId: anchorId,
    };

    const assocNode: UmlClassNode = {
      id: assocNodeId,
      name: assocName,
      elementType: 'ASSOCIATION_CLASS',
      position: {
        x: anchorNode.position.x - 110,
        y: anchorNode.position.y + 120,
      },
      width: 220,
      attributes: [
        { name: 'id', type: 'UUID', visibility: '-', isPrimaryKey: true, isNullable: false, orderIndex: 0 },
        { name: 'fechaRegistro', type: 'LocalDateTime', visibility: '-', isPrimaryKey: false, isNullable: false, orderIndex: 1 },
      ],
      methods: [
        { name: 'getId', parameters: '', returnType: 'UUID', visibility: '+', orderIndex: 0 },
      ],
      assocMainConnId: mainConnId,
    };

    const dashedConnId = `conn_${timestamp}_assoc_dashed`;
    const dashedConnection: UmlConnection = {
      id: dashedConnId,
      sourceNodeId: anchorId,
      targetNodeId: assocNodeId,
      sourceId: anchorId,
      targetId: `${assocNodeId}_top`,
      type: 'association_class',
      lineStyle: 'straight',
      name: '«link»',
    };

    this.nodes.update((list) => [...list, anchorNode, assocNode]);
    this.connections.update((list) => [...list, mainConnection, dashedConnection]);
    this.markAsUnsaved();
    this.setPointerMode();
    this.updateConnectionEndpoints();
    this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'create_assoc_class');
    if (!skipActivityLog) {
      this.collaborationService.sendActivityLog(
        `Creó clase asociativa ${assocName}`,
        `${sourceNode.name} *─* ${targetNode.name}`,
        'uml',
      );
    }
  }

  addClass(): void {
    this.addElement('CLASS');
  }

  addElement(elementType: UmlElementType = 'CLASS'): void {
    if (this.isReadOnly()) return;
    this.pushUndoSnapshot();

    const scale = this.canvas?.transform?.scale || 1;
    const rawPosX = this.canvas?.transform?.position?.x || 0;
    const rawPosY = this.canvas?.transform?.position?.y || 0;
    const posX = Math.round(-rawPosX / scale + 150 + Math.random() * 80);
    const posY = Math.round(-rawPosY / scale + 150 + Math.random() * 80);

    const normalizedType = this.normalizeElementType(elementType);
    const count = this.nodes().filter((n) => !n.isAnchor).length + 1;
    const timestamp = Date.now();

    let name = `Tabla_${count}`;
    let stereotype: string | undefined;
    let noteContent: string | undefined;
    let attributes: UmlAttribute[] = [];
    let methods: UmlMethod[] = [];

    if (normalizedType === 'INTERFACE') {
      name = `IServicio_${count}`;
      stereotype = 'interface';
      methods = [{ name: 'ejecutar', parameters: '', returnType: 'void', visibility: '+', orderIndex: 0 }];
    } else if (normalizedType === 'ENUM') {
      name = `Estado_${count}`;
      stereotype = 'enumeration';
      attributes = [
        { name: 'ACTIVO', type: 'EnumLiteral', visibility: '+', isPrimaryKey: false, isNullable: false, orderIndex: 0 },
        { name: 'INACTIVO', type: 'EnumLiteral', visibility: '+', isPrimaryKey: false, isNullable: false, orderIndex: 1 },
      ];
    } else if (normalizedType === 'NOTE') {
      name = `Nota_${count}`;
      noteContent = 'Regla de negocio o aclaración del modelo.';
    }

    const newNode: UmlClassNode = {
      id: `${normalizedType.toLowerCase()}_${timestamp}`,
      name,
      elementType: normalizedType,
      stereotype,
      noteContent,
      position: { x: Math.max(50, posX), y: Math.max(50, posY) },
      width: 220,
      attributes,
      methods,
    };

    this.nodes.update((list) => [...list, newNode]);
    this.markAsUnsaved();
    this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'add_node');
    this.collaborationService.sendActivityLog(
      `Creó ${normalizedType.toLowerCase()} "${name}"`,
      undefined,
      'uml',
    );
  }

  removeClass(nodeId: string, event?: MouseEvent, skipActivityLog = false): void {
    if (event) event.stopPropagation();
    if (this.isReadOnly() || this.isNodeLockedByOther(nodeId)) return;

    const deletedName = this.nodes().find((n) => n.id === nodeId)?.name || nodeId;
    this.pushUndoSnapshot();

    const nodesToDelete = new Set<string>([nodeId]);
    const connsToDelete = new Set<string>();

    // 1. Identificar conexiones que tocan directamente a nodeId
    const directConns = this.connections().filter((c) => {
      const sourceBase = c.sourceNodeId || c.sourceId.replace(/_(top|bottom|left|right)$/, '');
      const targetBase = c.targetNodeId || c.targetId.replace(/_(top|bottom|left|right)$/, '');
      return sourceBase === nodeId || targetBase === nodeId;
    });

    directConns.forEach((c) => {
      connsToDelete.add(c.id);

      // Si la conexión tiene un ancla asociada (relación muchos a muchos con tabla intermedia)
      if (c.assocAnchorNodeId) {
        nodesToDelete.add(c.assocAnchorNodeId);
      }

      // Buscar si alguna tabla intermedia está vinculada a esta conexión principal
      this.nodes().forEach((n) => {
        if (n.assocMainConnId === c.id) {
          nodesToDelete.add(n.id);
        }
      });
    });

    // 2. Si el propio nodo a eliminar es una tabla intermedia (tiene assocMainConnId)
    const targetNode = this.nodes().find((n) => n.id === nodeId);
    if (targetNode?.assocMainConnId) {
      const mainConn = this.connections().find((c) => c.id === targetNode.assocMainConnId);
      if (mainConn?.assocAnchorNodeId) {
        nodesToDelete.add(mainConn.assocAnchorNodeId);
      }
    }

    // 3. Buscar todas las tablas/anclas asociadas por conexiones tipo 'association_class' (línea discontinua «link»)
    this.connections().forEach((c) => {
      if (c.type === 'association_class') {
        const sourceBase = c.sourceNodeId || c.sourceId.replace(/_(top|bottom|left|right)$/, '');
        const targetBase = c.targetNodeId || c.targetId.replace(/_(top|bottom|left|right)$/, '');
        if (nodesToDelete.has(sourceBase)) {
          nodesToDelete.add(targetBase);
        }
        if (nodesToDelete.has(targetBase)) {
          nodesToDelete.add(sourceBase);
        }
      }
    });

    // 4. Eliminar todas las conexiones que toquen a cualquiera de los nodos marcados para eliminación
    this.connections().forEach((c) => {
      const sourceBase = c.sourceNodeId || c.sourceId.replace(/_(top|bottom|left|right)$/, '');
      const targetBase = c.targetNodeId || c.targetId.replace(/_(top|bottom|left|right)$/, '');
      if (nodesToDelete.has(sourceBase) || nodesToDelete.has(targetBase)) {
        connsToDelete.add(c.id);
      }
    });

    // 5. Aplicar la eliminación en cascada a los signals
    this.nodes.update((list) => list.filter((n) => !nodesToDelete.has(n.id)));
    this.connections.update((list) => list.filter((c) => !connsToDelete.has(c.id)));

    if (this.selectedNodeId() === nodeId || nodesToDelete.has(this.selectedNodeId() || '')) {
      this.selectedNodeId.set(null);
    }

    this.markAsUnsaved();
    this.updateConnectionEndpoints();
    this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'remove_node');
    if (!skipActivityLog) {
      this.collaborationService.sendActivityLog(`Eliminó "${deletedName}"`, undefined, 'uml');
    }
  }

  openEditNodeModal(node: UmlClassNode, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    if (this.isReadOnly() || node.isAnchor) return;

    if (this.isNodeLockedByOther(node.id)) {
      const lock = this.getNodeLock(node.id);
      alert(`🔒 Esta tabla está bloqueada por ${lock?.userName || 'otro usuario'}.`);
      return;
    }

    this.collaborationService.requestNodeLock(node.id);
    const clone: UmlClassNode = JSON.parse(JSON.stringify(node));
    const elType = this.normalizeElementType(clone.elementType);
    clone.elementType = elType;
    clone.attributes = (clone.attributes || []).map((a, idx) => ({
      ...a,
      type: elType === 'ENUM' ? 'EnumLiteral' : (a.type || 'String'),
      visibility: this.normalizeVisibility(a.visibility, elType === 'ENUM' ? '+' : '-'),
      isPrimaryKey: Boolean(a.isPrimaryKey),
      isNullable: a.isNullable !== undefined ? Boolean(a.isNullable) : !a.isPrimaryKey,
      orderIndex: a.orderIndex ?? idx,
    }));
    clone.methods = (clone.methods || []).map((m, idx) => ({
      ...m,
      parameters: m.parameters || '',
      returnType: m.returnType || 'void',
      visibility: this.normalizeVisibility(m.visibility, '+'),
      orderIndex: m.orderIndex ?? idx,
    }));
    this.editingNode.set(clone);
    this.isEditNodeModalOpen.set(true);
  }

  closeEditNodeModal(): void {
    if (this.editingNode()) {
      this.collaborationService.releaseNodeLock(this.editingNode()!.id);
    }
    this.isEditNodeModalOpen.set(false);
    this.editingNode.set(null);
  }

  saveEditedNode(): void {
    const edited = this.editingNode();
    if (!edited) return;

    this.pushUndoSnapshot();
    const elType = this.normalizeElementType(edited.elementType);
    edited.elementType = elType;
    edited.name = edited.name?.trim() || (elType === 'NOTE' ? 'Nota' : 'Clase');
    edited.stereotype = edited.stereotype?.trim() || undefined;

    if (elType === 'NOTE') {
      edited.noteContent = edited.noteContent ?? '';
      edited.attributes = [];
      edited.methods = [];
    } else {
      edited.attributes = (edited.attributes || [])
        .filter((a) => a.name && a.name.trim().length > 0)
        .map((a, idx) => {
          const isPk = elType === 'ENUM' ? false : Boolean(a.isPrimaryKey);
          return {
            name: a.name.trim(),
            type: elType === 'ENUM' ? 'EnumLiteral' : (a.type || 'String'),
            visibility: this.normalizeVisibility(a.visibility, elType === 'ENUM' ? '+' : '-'),
            isPrimaryKey: isPk,
            isNullable: isPk ? false : (a.isNullable ?? true),
            orderIndex: idx,
          };
        });
      edited.methods = (edited.methods || [])
        .filter((m) => m.name && m.name.trim().length > 0)
        .map((m, idx) => ({
          name: m.name.trim(),
          parameters: m.parameters || '',
          returnType: m.returnType || 'void',
          visibility: this.normalizeVisibility(m.visibility, '+'),
          orderIndex: idx,
        }));
    }

    this.nodes.update((list) => list.map((n) => (n.id === edited.id ? edited : n)));
    this.markAsUnsaved();
    this.closeEditNodeModal();
    this.updateConnectionEndpoints();
    this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'update_node');
    this.collaborationService.sendActivityLog(
      `Editó "${edited.name}"`,
      `${edited.attributes.length} atrib • ${edited.methods.length} mét`,
      'uml',
    );
  }

  onEditingNodeTypeChange(newType: UmlElementType): void {
    const n = this.editingNode();
    if (!n) return;
    const normalized = this.normalizeElementType(newType);
    n.elementType = normalized;

    if (normalized === 'INTERFACE') {
      if (!n.stereotype || n.stereotype === 'enumeration') {
        n.stereotype = 'interface';
      }
      n.attributes = n.attributes || [];
    } else if (normalized === 'ENUM') {
      if (!n.stereotype || n.stereotype === 'interface') {
        n.stereotype = 'enumeration';
      }
      n.attributes = (n.attributes || []).map((a) => ({
        ...a,
        type: 'EnumLiteral',
        visibility: '+',
        isPrimaryKey: false,
        isNullable: false,
      }));
    } else if (normalized === 'NOTE') {
      n.stereotype = undefined;
      n.noteContent = n.noteContent ?? n.name ?? '';
    } else {
      if (n.stereotype === 'interface' || n.stereotype === 'enumeration') {
        n.stereotype = undefined;
      }
      n.attributes = (n.attributes || []).map((a) => ({
        ...a,
        type: a.type === 'EnumLiteral' ? 'String' : (a.type || 'String'),
        visibility: a.visibility || '-',
      }));
    }
  }

  onToggleAttributePk(attr: UmlAttribute): void {
    attr.isPrimaryKey = !attr.isPrimaryKey;
    if (attr.isPrimaryKey) {
      attr.isNullable = false;
    }
  }

  onToggleAttributeNullable(attr: UmlAttribute): void {
    if (attr.isPrimaryKey) {
      attr.isNullable = false;
      return;
    }
    attr.isNullable = attr.isNullable === false ? true : false;
  }

  addLiteralToEditingEnum(): void {
    this.addAttributeToEditingNode();
  }

  getAvailableAttrTypes(currentType?: string): string[] {
    const custom = this.nodes()
      .filter((n) => !n.isAnchor && n.name && (n.elementType === 'ENUM' || n.elementType === 'CLASS' || n.elementType === 'INTERFACE'))
      .map((n) => n.name.trim());
    const set = new Set<string>(this.predefinedTypes);
    for (const c of custom) {
      if (c && !set.has(c)) set.add(c);
    }
    if (currentType && currentType.trim() && !set.has(currentType.trim())) {
      set.add(currentType.trim());
    }
    return Array.from(set);
  }

  getAvailableReturnTypes(currentType?: string): string[] {
    const custom = this.nodes()
      .filter((n) => !n.isAnchor && n.name && n.elementType !== 'NOTE')
      .map((n) => n.name.trim());
    const set = new Set<string>(this.predefinedReturnTypes);
    for (const c of custom) {
      if (c && !set.has(c)) set.add(c);
    }
    if (currentType && currentType.trim() && !set.has(currentType.trim())) {
      set.add(currentType.trim());
    }
    return Array.from(set);
  }

  addAttributeToEditingNode(): void {
    const n = this.editingNode();
    if (!n) return;
    n.attributes = n.attributes || [];
    if (n.elementType === 'ENUM') {
      n.attributes.push({
        name: `VALOR_${n.attributes.length + 1}`,
        type: 'EnumLiteral',
        visibility: '+',
        isPrimaryKey: false,
        isNullable: false,
      });
    } else {
      n.attributes.push({
        name: 'nuevoCampo',
        type: 'String',
        visibility: '-',
        isPrimaryKey: false,
        isNullable: true,
      });
    }
  }

  removeAttributeFromEditingNode(index: number): void {
    const n = this.editingNode();
    if (!n || !n.attributes) return;
    n.attributes.splice(index, 1);
  }

  addMethodToEditingNode(): void {
    const n = this.editingNode();
    if (!n) return;
    n.methods = n.methods || [];
    n.methods.push({
      name: 'nuevaOperacion',
      parameters: '',
      returnType: 'void',
      visibility: '+',
    });
  }

  removeMethodFromEditingNode(index: number): void {
    const n = this.editingNode();
    if (!n || !n.methods) return;
    n.methods.splice(index, 1);
  }

  openEditConnModal(conn: UmlConnection, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    if (this.isReadOnly()) return;

    this.editingConnection.set(JSON.parse(JSON.stringify(conn)));
    this.isEditConnModalOpen.set(true);
  }

  closeEditConnModal(): void {
    this.isEditConnModalOpen.set(false);
    this.editingConnection.set(null);
  }

  saveEditedConnection(): void {
    const edited = this.editingConnection();
    if (!edited) return;

    this.pushUndoSnapshot();
    this.connections.update((list) => list.map((c) => (c.id === edited.id ? edited : c)));
    this.markAsUnsaved();
    this.closeEditConnModal();
    this.updateConnectionEndpoints();
    this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'update_conn');
    this.collaborationService.sendActivityLog(
      `Editó relación ${edited.type}`,
      `${edited.sourceMultiplicity || '-'} → ${edited.targetMultiplicity || '-'}`,
      'uml',
    );
  }

  removeConnection(connId: string, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    if (this.isReadOnly()) return;

    this.pushUndoSnapshot();
    const conn = this.connections().find((c) => c.id === connId);
    const connsToDelete = new Set<string>([connId]);
    const nodesToDelete = new Set<string>();

    if (conn) {
      if (conn.assocAnchorNodeId) {
        nodesToDelete.add(conn.assocAnchorNodeId);
      }
      this.nodes().forEach((n) => {
        if (n.assocMainConnId === conn.id) {
          nodesToDelete.add(n.id);
        }
      });

      if (conn.type === 'association_class') {
        const sourceBase = conn.sourceNodeId || conn.sourceId.replace(/_(top|bottom|left|right)$/, '');
        const targetBase = conn.targetNodeId || conn.targetId.replace(/_(top|bottom|left|right)$/, '');
        const sourceNode = this.nodes().find((n) => n.id === sourceBase);
        const targetNode = this.nodes().find((n) => n.id === targetBase);
        if (sourceNode?.isAnchor) nodesToDelete.add(sourceNode.id);
        if (targetNode?.isAnchor) nodesToDelete.add(targetNode.id);
      }
    }

    this.connections().forEach((c) => {
      const sourceBase = c.sourceNodeId || c.sourceId.replace(/_(top|bottom|left|right)$/, '');
      const targetBase = c.targetNodeId || c.targetId.replace(/_(top|bottom|left|right)$/, '');
      if (nodesToDelete.has(sourceBase) || nodesToDelete.has(targetBase)) {
        connsToDelete.add(c.id);
      }
    });

    if (nodesToDelete.size > 0) {
      this.nodes.update((list) => list.filter((n) => !nodesToDelete.has(n.id)));
    }
    this.connections.update((list) => list.filter((c) => !connsToDelete.has(c.id)));

    this.markAsUnsaved();
    this.closeEditConnModal();
    this.updateConnectionEndpoints();
    this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'delete_conn');
    this.collaborationService.sendActivityLog(
      `Eliminó relación ${conn?.type || ''}`,
      conn?.name || undefined,
      'uml',
    );
  }

  applyAuditFixes(event: { nodes: UmlClassNode[]; connections: UmlConnection[]; appliedCount: number }): void {
    if (this.isReadOnly() || event.appliedCount <= 0) return;
    this.pushUndoSnapshot();
    const cleanNodes = this.applyAiNodesMutation(event.nodes);
    this.nodes.set(cleanNodes);
    const cleanConns = this.sanitizeClientConnections(event.connections || [], cleanNodes);
    this.connections.set(cleanConns);
    this.markAsUnsaved();
    this.updateConnectionEndpoints();
    setTimeout(() => this.updateConnectionEndpoints(), 50);
    this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'audit_fix');
    this.collaborationService.sendActivityLog(
      `Aplicó ${event.appliedCount} corrección(es) de auditoría 1FN/2FN/3FN`,
      undefined,
      'uml',
    );
  }

  onAiMutation(event: { nodes: UmlClassNode[]; connections: UmlConnection[]; summary: string }): void {
    if (this.isReadOnly()) return;
    if (event.nodes && event.nodes.length > 0) {
      this.pushUndoSnapshot();
      this.applyAiMutationWithAnimation(event.nodes, event.connections || []);
      this.collaborationService.sendDiagramSync(event.nodes, event.connections || [], 'ai_mutation');
      this.collaborationService.sendActivityLog(
        event.summary || 'Copilot IA actualizó el diagrama',
        `${event.nodes.filter((n) => !n.isAnchor).length} elemento(s)`,
        'ai',
      );
    }
  }

  private applyAiMutationWithAnimation(targetNodes: UmlClassNode[], targetConns: UmlConnection[]): void {
    const cleanNodes = this.applyAiNodesMutation(targetNodes);
    this.nodes.set(cleanNodes);
    const cleanConns = this.sanitizeClientConnections(targetConns, cleanNodes);
    this.connections.set(cleanConns);
    this.markAsUnsaved();
    this.updateConnectionEndpoints();
    setTimeout(() => {
      this.updateConnectionEndpoints();
      this.fitView();
    }, 100);
  }

  private applyAiNodesMutation(targetNodes: any[]): UmlClassNode[] {
    const customTypeNames = (targetNodes || [])
      .filter((n: any) => !n?.isAnchor && n?.name)
      .map((n: any) => String(n.name).trim());

    return targetNodes.map((n, i) => {
      const elementType = this.normalizeElementType(n.elementType);
      return {
        id: n.id || `class_ai_${Date.now()}_${i}`,
        name: n.isAnchor ? (n.name || '') : (n.name || (elementType === 'NOTE' ? `Nota_${i + 1}` : `Clase_${i + 1}`)),
        elementType,
        stereotype: n.stereotype || (elementType === 'INTERFACE' ? 'interface' : elementType === 'ENUM' ? 'enumeration' : undefined),
        noteContent: n.noteContent ?? undefined,
        position: {
          x: n.position?.x ?? (n.positionX ?? (100 + (i % 3) * 260)),
          y: n.position?.y ?? (n.positionY ?? (100 + Math.floor(i / 3) * 220)),
        },
        width: n.width || 220,
        height: n.height,
        isAnchor: n.isAnchor,
        assocMainConnId: n.assocMainConnId,
        attributes: (n.attributes || []).map((a: any, idx: number) => ({
          name: a.name,
          type: elementType === 'ENUM' ? 'EnumLiteral' : this.normalizeDataType(a.type, customTypeNames),
          visibility: this.normalizeVisibility(a.visibility, elementType === 'ENUM' ? '+' : '-'),
          isPrimaryKey: Boolean(a.isPrimaryKey),
          isNullable: a.isNullable !== undefined ? Boolean(a.isNullable) : !a.isPrimaryKey,
          orderIndex: a.orderIndex ?? idx,
        })),
        methods: (n.methods || []).map((m: any, idx: number) => ({
          name: m.name,
          parameters: m.parameters || '',
          returnType: this.normalizeReturnType(m.returnType, customTypeNames),
          visibility: this.normalizeVisibility(m.visibility, '+'),
          orderIndex: m.orderIndex ?? idx,
        })),
      };
    });
  }

  private sanitizeClientConnections(conns: any[], validNodes: UmlClassNode[]): UmlConnection[] {
    const nodeIds = new Set(validNodes.map((n) => n.id));
    return conns
      .filter((c) => {
        const s = c.sourceNodeId || c.sourceId?.replace(/_(top|bottom|left|right)$/, '');
        const t = c.targetNodeId || c.targetId?.replace(/_(top|bottom|left|right)$/, '');
        return nodeIds.has(s) && nodeIds.has(t);
      })
      .map((c) => ({
        id: c.id || `conn_ai_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        sourceNodeId: c.sourceNodeId || c.sourceId?.replace(/_(top|bottom|left|right)$/, ''),
        targetNodeId: c.targetNodeId || c.targetId?.replace(/_(top|bottom|left|right)$/, ''),
        sourceId: c.sourceId || `${c.sourceNodeId}_right`,
        targetId: c.targetId || `${c.targetNodeId}_left`,
        type: (c.type as UmlRelationshipType) || 'association',
        lineStyle: this.normalizeLineStyle(c.lineStyle || this.defaultLineStyle()),
        name: c.name || undefined,
        sourceMultiplicity: c.sourceMultiplicity || '',
        targetMultiplicity: c.targetMultiplicity || '',
        assocAnchorNodeId: c.assocAnchorNodeId || undefined,
      }));
  }

  async downloadBmpFile(): Promise<void> {
    const containerEl = this.flowContainerRef?.nativeElement;
    if (containerEl) {
      await this.bmpExportService.exportElementToBmp(
        containerEl,
        this.currentDiagramName(),
      );
    } else {
      this.bmpExportService.exportToBmp(
        this.nodes(),
        this.connections(),
        this.currentDiagramName(),
      );
    }
  }

  async downloadXmiFile(): Promise<void> {
    const diagId = this.currentDiagramId();
    if (diagId && !this.hasUnsavedChanges()) {
      this.xmiService.exportDiagramXml(diagId).subscribe({
        next: async (xmiContent: string) => {
          await this.saveXmiContentToDisk(xmiContent);
        },
        error: async () => {
          const fallbackXml = this.xmiClientSerializer.serialize(
            this.nodes(),
            this.connections(),
            this.currentDiagramName(),
            this.defaultLineStyle(),
          );
          await this.saveXmiContentToDisk(fallbackXml);
        },
      });
      return;
    }

    const clientXml = this.xmiClientSerializer.serialize(
      this.nodes(),
      this.connections(),
      this.currentDiagramName(),
      this.defaultLineStyle(),
    );
    await this.saveXmiContentToDisk(clientXml);
  }

  private async saveXmiContentToDisk(xmiContent: string): Promise<void> {
    const rawName = this.currentDiagramName() || 'sistema_ventas';
    const cleanName = rawName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_');
    const filename = `${cleanName || 'diagrama'}_ea.xmi`;

    // 1. Intentar con File System Access API nativo (Abre el diálogo 'Guardar como' en Windows)
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: 'Enterprise Architect XMI (*.xmi)',
              accept: {
                'application/vnd.sparx.xmi': ['.xmi'],
                'application/xml': ['.xmi', '.xml'],
                'text/xml': ['.xmi', '.xml'],
              },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(xmiContent);
        await writable.close();
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return; // Usuario canceló el diálogo
        }
        console.warn('showSaveFilePicker fallo, usando descarga alternativa', err);
      }
    }

    // 2. Fallback infalible mediante Data URI
    const blob = new Blob([xmiContent], { type: 'application/vnd.sparx.xmi;charset=utf-8' });
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = dataUrl;
      a.setAttribute('download', filename);
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
      }, 1000);
    };
    reader.readAsDataURL(blob);
  }

  downloadJsonFile(): void {
    const project: UmlDiagramProject = {
      version: '1.0',
      name: this.currentDiagramName(),
      createdDate: new Date().toISOString(),
      defaultLineStyle: this.defaultLineStyle(),
      nodes: this.nodes(),
      connections: this.connections(),
    };

    const rawName = this.currentDiagramName() || 'diagrama';
    const cleanName = rawName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_');
    const finalFilename = `${cleanName}_ast.json`;

    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.setAttribute('download', finalFilename);
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 1000);
  }

  openExportModal(): void {
    const project: UmlDiagramProject = {
      version: '1.0',
      name: this.currentDiagramName(),
      createdDate: new Date().toISOString(),
      defaultLineStyle: this.defaultLineStyle(),
      nodes: this.nodes(),
      connections: this.connections(),
    };
    this.jsonContent.set(JSON.stringify(project, null, 2));
    this.jsonModalMode.set('export');
    this.showJsonModal.set(true);
  }

  openImportModal(): void {
    this.jsonContent.set('');
    this.jsonModalMode.set('import');
    this.showJsonModal.set(true);
  }

  applyImportedJson(): void {
    if (this.isReadOnly()) return;
    try {
      const project = JSON.parse(this.jsonContent()) as UmlDiagramProject;
      if (project.nodes && project.connections) {
        this.pushUndoSnapshot();
        const cleanNodes = this.applyAiNodesMutation(project.nodes);
        this.nodes.set(cleanNodes);
        const cleanConns = this.sanitizeClientConnections(project.connections, cleanNodes);
        this.connections.set(cleanConns);
        if (project.defaultLineStyle) {
          this.defaultLineStyle.set(this.normalizeLineStyle(project.defaultLineStyle));
        }
        this.markAsUnsaved();
        this.updateConnectionEndpoints();
        this.showJsonModal.set(false);
        this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'apply_json');
        this.collaborationService.sendActivityLog(
          'Importó diagrama desde JSON',
          `${cleanNodes.filter((n) => !n.isAnchor).length} clases`,
          'uml',
        );
      } else {
        alert('Estructura JSON inválida: faltan nodos o conexiones.');
      }
    } catch (e) {
      alert('Error en el formato JSON: ' + e);
    }
  }

  copyJsonToClipboard(): void {
    navigator.clipboard.writeText(this.jsonContent()).then(() => {
      alert('¡JSON copiado al portapapeles!');
    });
  }

  onFileSelected(event: Event): void {
    if (this.isReadOnly()) return;
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isXmiOrXml = fileName.endsWith('.xml') || fileName.endsWith('.xmi');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;

        if (isXmiOrXml) {
          try {
            const ast = XmiClientParser.parse(content);
            if (ast.nodes && ast.nodes.length > 0) {
              this.pushUndoSnapshot();
              const cleanNodes = this.applyAiNodesMutation(ast.nodes);
              this.nodes.set(cleanNodes);
              const cleanConns = this.sanitizeClientConnections(ast.connections || [], cleanNodes);
              this.connections.set(cleanConns);
              if (ast.name) {
                this.currentDiagramName.set(ast.name);
              }
              this.markAsUnsaved();
              this.updateConnectionEndpoints();
              setTimeout(() => {
                this.updateConnectionEndpoints();
                this.fitView();
              }, 100);
              this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'import_xmi');
              this.collaborationService.sendActivityLog('Importó diagrama desde XMI', file.name, 'uml');
            } else {
              alert('El archivo XMI no contiene clases UML legibles.');
            }
          } catch (err: any) {
            alert('Error al leer el archivo XMI: ' + (err.message || err));
          } finally {
            target.value = '';
          }
        } else {
          const project = JSON.parse(content) as UmlDiagramProject;
          if (project.nodes && project.connections) {
            this.pushUndoSnapshot();
            const cleanNodes = this.applyAiNodesMutation(project.nodes);
            this.nodes.set(cleanNodes);
            const cleanConns = this.sanitizeClientConnections(project.connections, cleanNodes);
            this.connections.set(cleanConns);
            if (project.defaultLineStyle) {
              this.defaultLineStyle.set(this.normalizeLineStyle(project.defaultLineStyle));
            }
            this.markAsUnsaved();
            this.updateConnectionEndpoints();
            setTimeout(() => {
              this.updateConnectionEndpoints();
              this.fitView();
            }, 100);
            this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'import_json');
            this.collaborationService.sendActivityLog('Importó archivo JSON AST', file.name, 'uml');
          } else {
            alert('El archivo JSON no contiene un diagrama válido.');
          }
        }
      } catch (err) {
        alert('Error al leer el archivo: ' + err);
      } finally {
        target.value = '';
      }
    };
    reader.readAsText(file);
  }

  triggerSpringBootGeneration(): void {
    this.showSpringBootModal.set(true);
  }

  openProfileModal(): void {
    this.isProfileModalOpen.set(true);
  }

  onCanvasChange(event: FCanvasChangeEvent): void {
    if (event.scale !== undefined) {
      this.zoomLevel.set(Math.round(event.scale * 100));
    }
  }

  zoomIn(): void {
    this.fZoom?.zoomIn();
  }

  zoomOut(): void {
    this.fZoom?.zoomOut();
  }

  resetView(): void {
    if (this.canvas) {
      this.canvas.resetScaleAndCenter();
      this.zoomLevel.set(100);
    } else if (this.fZoom) {
      this.fZoom.reset();
      this.zoomLevel.set(100);
    }
  }

  fitView(): void {
    this.canvas?.fitToScreen();
  }

  // -------------------------------------------------------------
  // EJECUCIÓN DE COMANDOS DE VOZ ATÓMICOS + SINCRONIZACIÓN WS
  // -------------------------------------------------------------
  private findNodeByVoiceName(rawName?: string): UmlClassNode | undefined {
    const target = (rawName || '').trim();
    if (!target) return undefined;
    const normalize = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[\s_-]+/g, '');

    const nonAnchors = this.nodes().filter((n) => !n.isAnchor);
    const exact = nonAnchors.find((n) => n.name.trim().toLowerCase() === target.toLowerCase());
    if (exact) return exact;

    const normTarget = normalize(target);
    return nonAnchors.find((n) => normalize(n.name) === normTarget);
  }

  private computeVoiceNodePosition(): { x: number; y: number } {
    const scale = this.canvas?.transform?.scale || 1;
    const rawPosX = this.canvas?.transform?.position?.x || 0;
    const rawPosY = this.canvas?.transform?.position?.y || 0;
    const nonAnchorCount = this.nodes().filter((n) => !n.isAnchor).length;
    const col = nonAnchorCount % 4;
    const row = Math.floor(nonAnchorCount / 4);
    const posX = Math.round(-rawPosX / scale + 80 + col * 265);
    const posY = Math.round(-rawPosY / scale + 80 + row * 210);
    return { x: Math.max(40, posX), y: Math.max(40, posY) };
  }

  private getCustomTypeNames(): string[] {
    return this.nodes()
      .filter((n) => !n.isAnchor && n.name && n.elementType !== 'NOTE')
      .map((n) => n.name.trim());
  }

  executeVoiceCommand(cmd: ParsedVoiceCommand): void {
    if (!cmd || cmd.type === 'UNKNOWN') return;

    const readOnlyAllowed =
      cmd.type === 'AUDIT_MODEL' ||
      cmd.type === 'GENERATE_SQL' ||
      cmd.type === 'VALIDATE_XMI' ||
      cmd.type === 'ZOOM_IN' ||
      cmd.type === 'ZOOM_OUT' ||
      cmd.type === 'RESET_VIEW';

    if (!readOnlyAllowed && this.isReadOnly()) {
      this.voiceCommandService.speak('Modo espectador activo. No tienes permiso para editar el diagrama.');
      return;
    }

    const customTypeNames = this.getCustomTypeNames();

    switch (cmd.type) {
      case 'UNDO': {
        if (this.undoStack.length === 0) {
          this.voiceCommandService.speak('Nada que deshacer.');
          return;
        }
        this.undo();
        this.voiceCommandService.speak('Acción deshecha.');
        this.collaborationService.sendActivityLog(cmd.description, cmd.rawTranscript, 'voice');
        return;
      }

      case 'REDO': {
        if (this.redoStack.length === 0) {
          this.voiceCommandService.speak('Nada que rehacer.');
          return;
        }
        this.redo();
        this.voiceCommandService.speak('Acción rehecha.');
        this.collaborationService.sendActivityLog(cmd.description, cmd.rawTranscript, 'voice');
        return;
      }

      case 'AUDIT_MODEL': {
        this.showAuditModal.set(true);
        this.voiceCommandService.speak('Abriendo auditoría de normalización.');
        this.collaborationService.sendActivityLog(cmd.description, cmd.rawTranscript, 'voice');
        return;
      }

      case 'GENERATE_SQL': {
        this.showSqlModal.set(true);
        this.voiceCommandService.speak('Abriendo generador SQL DDL.');
        this.collaborationService.sendActivityLog(cmd.description, cmd.rawTranscript, 'voice');
        return;
      }

      case 'VALIDATE_XMI': {
        this.showXmiModal.set(true);
        this.voiceCommandService.speak('Abriendo validador OMG XMI.');
        this.collaborationService.sendActivityLog(cmd.description, cmd.rawTranscript, 'voice');
        return;
      }

      case 'ZOOM_IN': {
        this.zoomIn();
        this.voiceCommandService.speak('Zoom acercado.');
        return;
      }

      case 'ZOOM_OUT': {
        this.zoomOut();
        this.voiceCommandService.speak('Zoom alejado.');
        return;
      }

      case 'RESET_VIEW': {
        this.resetView();
        this.voiceCommandService.speak('Vista restablecida.');
        return;
      }

      case 'CLEAR_CANVAS': {
        if (this.nodes().length === 0 && this.connections().length === 0) {
          this.voiceCommandService.speak('El lienzo ya está vacío.');
          return;
        }
        if (this.nodes().some((n) => this.isNodeLockedByOther(n.id))) {
          this.voiceCommandService.speak('No se puede limpiar porque hay clases bloqueadas por otro colaborador.');
          return;
        }
        this.pushUndoSnapshot();
        this.nodes.set([]);
        this.connections.set([]);
        this.selectedNodeId.set(null);
        this.setPointerMode();
        this.markAsUnsaved();
        this.collaborationService.sendDiagramSync([], [], 'clear_canvas');
        this.voiceCommandService.speak('Lienzo limpiado.');
        this.collaborationService.sendActivityLog(cmd.description, cmd.rawTranscript, 'voice');
        return;
      }

      case 'CREATE_CLASS': {
        const className = cmd.payload.className?.trim() || 'NuevaClase';
        const existing = this.findNodeByVoiceName(className);
        if (existing) {
          this.selectedNodeId.set(existing.id);
          this.voiceCommandService.speak(`La clase ${existing.name} ya existe en el diagrama.`);
          return;
        }

        const inlineAttrs: UmlAttribute[] = (cmd.payload.inlineAttributes || []).map((a, idx) => ({
          name: a.name,
          type: this.normalizeDataType(a.type, customTypeNames),
          visibility: a.visibility || '-',
          isPrimaryKey: Boolean(a.isPrimaryKey),
          isNullable: a.isPrimaryKey ? false : Boolean(a.isNullable),
          orderIndex: idx,
        }));

        const newNode: UmlClassNode = {
          id: `class_voice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: className,
          elementType: 'CLASS',
          position: this.computeVoiceNodePosition(),
          width: 220,
          attributes: inlineAttrs,
          methods: [],
        };

        this.pushUndoSnapshot();
        this.nodes.update((list) => [...list, newNode]);
        this.selectedNodeId.set(newNode.id);
        this.markAsUnsaved();
        this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'voice_create_class');
        this.voiceCommandService.speak(
          inlineAttrs.length > 0
            ? `Clase ${className} creada con ${inlineAttrs.length} atributos.`
            : `Clase ${className} creada.`,
        );
        this.collaborationService.sendActivityLog(cmd.description, cmd.rawTranscript, 'voice');
        return;
      }

      case 'CREATE_INTERFACE': {
        const ifaceName = cmd.payload.className?.trim() || 'IServicio';
        const existing = this.findNodeByVoiceName(ifaceName);
        if (existing) {
          this.selectedNodeId.set(existing.id);
          this.voiceCommandService.speak(`El elemento ${existing.name} ya existe en el diagrama.`);
          return;
        }

        const newNode: UmlClassNode = {
          id: `interface_voice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: ifaceName,
          elementType: 'INTERFACE',
          stereotype: 'interface',
          position: this.computeVoiceNodePosition(),
          width: 220,
          attributes: [],
          methods: [{ name: 'ejecutar', parameters: '', returnType: 'void', visibility: '+', orderIndex: 0 }],
        };

        this.pushUndoSnapshot();
        this.nodes.update((list) => [...list, newNode]);
        this.selectedNodeId.set(newNode.id);
        this.markAsUnsaved();
        this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'voice_create_interface');
        this.voiceCommandService.speak(`Interfaz ${ifaceName} creada.`);
        this.collaborationService.sendActivityLog(cmd.description, cmd.rawTranscript, 'voice');
        return;
      }

      case 'CREATE_ENUM': {
        const enumName = cmd.payload.className?.trim() || 'NuevoEnum';
        const existing = this.findNodeByVoiceName(enumName);
        if (existing) {
          this.selectedNodeId.set(existing.id);
          this.voiceCommandService.speak(`El elemento ${existing.name} ya existe en el diagrama.`);
          return;
        }

        const rawLiterals =
          cmd.payload.enumLiterals && cmd.payload.enumLiterals.length > 0
            ? cmd.payload.enumLiterals
            : ['ACTIVO', 'INACTIVO'];

        const newNode: UmlClassNode = {
          id: `enum_voice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: enumName,
          elementType: 'ENUM',
          stereotype: 'enumeration',
          position: this.computeVoiceNodePosition(),
          width: 220,
          attributes: rawLiterals.map((lit, idx) => ({
            name: lit,
            type: 'EnumLiteral',
            visibility: '+',
            isPrimaryKey: false,
            isNullable: false,
            orderIndex: idx,
          })),
          methods: [],
        };

        this.pushUndoSnapshot();
        this.nodes.update((list) => [...list, newNode]);
        this.selectedNodeId.set(newNode.id);
        this.markAsUnsaved();
        this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'voice_create_enum');
        this.voiceCommandService.speak(`Enumeración ${enumName} creada.`);
        this.collaborationService.sendActivityLog(cmd.description, cmd.rawTranscript, 'voice');
        return;
      }

      case 'CREATE_NOTE': {
        const noteContent = cmd.payload.noteContent?.trim() || 'Nota UML';
        const noteCount = this.nodes().filter((n) => !n.isAnchor && n.elementType === 'NOTE').length + 1;
        const noteName = cmd.payload.noteTitle?.trim() || `Nota_${noteCount}`;

        const newNode: UmlClassNode = {
          id: `note_voice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: noteName,
          elementType: 'NOTE',
          noteContent,
          position: this.computeVoiceNodePosition(),
          width: 220,
          attributes: [],
          methods: [],
        };

        this.pushUndoSnapshot();
        this.nodes.update((list) => [...list, newNode]);
        this.selectedNodeId.set(newNode.id);
        this.markAsUnsaved();
        this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'voice_create_note');
        this.voiceCommandService.speak(`Nota ${noteName} agregada.`);
        this.collaborationService.sendActivityLog(cmd.description, cmd.rawTranscript, 'voice');
        return;
      }

      case 'ADD_ATTRIBUTE': {
        const target = this.findNodeByVoiceName(cmd.payload.className);
        if (!target) {
          this.voiceCommandService.speak(`No encontré la clase ${cmd.payload.className || ''}.`);
          return;
        }
        if (target.elementType === 'NOTE') {
          this.voiceCommandService.speak('Las notas UML no admiten atributos.');
          return;
        }
        if (this.isNodeLockedByOther(target.id)) {
          const lock = this.getNodeLock(target.id);
          this.voiceCommandService.speak(`La clase ${target.name} está bloqueada por ${lock?.userName || 'otro usuario'}.`);
          return;
        }

        const rawAttrName = cmd.payload.attributeName?.trim() || 'campo';
        const attrName = target.elementType === 'ENUM' ? rawAttrName.toUpperCase() : rawAttrName;
        const existingAttrs = target.attributes || [];
        if (existingAttrs.some((a) => a.name.toLowerCase() === attrName.toLowerCase())) {
          this.voiceCommandService.speak(`El atributo ${attrName} ya existe en ${target.name}.`);
          return;
        }

        const isEnum = target.elementType === 'ENUM';
        const isPk = isEnum ? false : Boolean(cmd.payload.isPrimaryKey);
        const newAttr: UmlAttribute = {
          name: attrName,
          type: isEnum ? 'EnumLiteral' : this.normalizeDataType(cmd.payload.attributeType || 'String', customTypeNames),
          visibility: isEnum ? '+' : (cmd.payload.visibility || '-'),
          isPrimaryKey: isPk,
          isNullable: isEnum || isPk ? false : (cmd.payload.isNullable ?? true),
          orderIndex: existingAttrs.length,
        };

        this.pushUndoSnapshot();
        this.nodes.update((list) =>
          list.map((n) => (n.id === target.id ? { ...n, attributes: [...(n.attributes || []), newAttr] } : n)),
        );
        this.markAsUnsaved();
        this.updateConnectionEndpoints();
        this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'voice_add_attr');
        this.voiceCommandService.speak(`Atributo ${attrName} agregado a ${target.name}.`);
        this.collaborationService.sendActivityLog(cmd.description, cmd.rawTranscript, 'voice');
        return;
      }

      case 'ADD_METHOD': {
        const target = this.findNodeByVoiceName(cmd.payload.className);
        if (!target) {
          this.voiceCommandService.speak(`No encontré la clase ${cmd.payload.className || ''}.`);
          return;
        }
        if (target.elementType === 'NOTE' || target.elementType === 'ENUM') {
          this.voiceCommandService.speak('Solo clases e interfaces admiten métodos.');
          return;
        }
        if (this.isNodeLockedByOther(target.id)) {
          const lock = this.getNodeLock(target.id);
          this.voiceCommandService.speak(`La clase ${target.name} está bloqueada por ${lock?.userName || 'otro usuario'}.`);
          return;
        }

        const methodName = cmd.payload.methodName?.trim() || 'operacion';
        const existingMethods = target.methods || [];
        if (existingMethods.some((m) => m.name.toLowerCase() === methodName.toLowerCase())) {
          this.voiceCommandService.speak(`El método ${methodName} ya existe en ${target.name}.`);
          return;
        }

        const returnType = this.normalizeReturnType(cmd.payload.returnType || 'void', customTypeNames);
        const newMethod: UmlMethod = {
          name: methodName,
          parameters: '',
          returnType,
          visibility: cmd.payload.visibility || '+',
          orderIndex: existingMethods.length,
        };

        this.pushUndoSnapshot();
        this.nodes.update((list) =>
          list.map((n) => (n.id === target.id ? { ...n, methods: [...(n.methods || []), newMethod] } : n)),
        );
        this.markAsUnsaved();
        this.updateConnectionEndpoints();
        this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'voice_add_method');
        this.voiceCommandService.speak(`Método ${methodName} agregado a ${target.name}.`);
        this.collaborationService.sendActivityLog(cmd.description, cmd.rawTranscript, 'voice');
        return;
      }

      case 'DELETE_ATTRIBUTE': {
        const target = this.findNodeByVoiceName(cmd.payload.className);
        if (!target) {
          this.voiceCommandService.speak(`No encontré la clase ${cmd.payload.className || ''}.`);
          return;
        }
        if (this.isNodeLockedByOther(target.id)) {
          this.voiceCommandService.speak(`La clase ${target.name} está bloqueada por otro colaborador.`);
          return;
        }

        const attrName = (cmd.payload.attributeName || '').trim().toLowerCase();
        const remaining = (target.attributes || []).filter((a) => a.name.toLowerCase() !== attrName);
        if (remaining.length === (target.attributes || []).length) {
          this.voiceCommandService.speak(`No encontré el atributo ${cmd.payload.attributeName} en ${target.name}.`);
          return;
        }

        const reindexed = remaining.map((a, idx) => ({ ...a, orderIndex: idx }));
        this.pushUndoSnapshot();
        this.nodes.update((list) =>
          list.map((n) => (n.id === target.id ? { ...n, attributes: reindexed } : n)),
        );
        this.markAsUnsaved();
        this.updateConnectionEndpoints();
        this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'voice_delete_attr');
        this.voiceCommandService.speak(`Atributo ${cmd.payload.attributeName} eliminado de ${target.name}.`);
        this.collaborationService.sendActivityLog(cmd.description, cmd.rawTranscript, 'voice');
        return;
      }

      case 'DELETE_METHOD': {
        const target = this.findNodeByVoiceName(cmd.payload.className);
        if (!target) {
          this.voiceCommandService.speak(`No encontré la clase ${cmd.payload.className || ''}.`);
          return;
        }
        if (this.isNodeLockedByOther(target.id)) {
          this.voiceCommandService.speak(`La clase ${target.name} está bloqueada por otro colaborador.`);
          return;
        }

        const methodName = (cmd.payload.methodName || '').trim().toLowerCase();
        const remaining = (target.methods || []).filter((m) => m.name.toLowerCase() !== methodName);
        if (remaining.length === (target.methods || []).length) {
          this.voiceCommandService.speak(`No encontré el método ${cmd.payload.methodName} en ${target.name}.`);
          return;
        }

        const reindexed = remaining.map((m, idx) => ({ ...m, orderIndex: idx }));
        this.pushUndoSnapshot();
        this.nodes.update((list) =>
          list.map((n) => (n.id === target.id ? { ...n, methods: reindexed } : n)),
        );
        this.markAsUnsaved();
        this.updateConnectionEndpoints();
        this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'voice_delete_method');
        this.voiceCommandService.speak(`Método ${cmd.payload.methodName} eliminado de ${target.name}.`);
        this.collaborationService.sendActivityLog(cmd.description, cmd.rawTranscript, 'voice');
        return;
      }

      case 'CONNECT_CLASSES': {
        const sourceNode = this.findNodeByVoiceName(cmd.payload.sourceClass);
        const targetNode = this.findNodeByVoiceName(cmd.payload.targetClass);
        if (!sourceNode) {
          this.voiceCommandService.speak(`No encontré la clase origen ${cmd.payload.sourceClass || ''}.`);
          return;
        }
        if (!targetNode) {
          this.voiceCommandService.speak(`No encontré la clase destino ${cmd.payload.targetClass || ''}.`);
          return;
        }
        if (sourceNode.id === targetNode.id) {
          this.voiceCommandService.speak('No se puede conectar una clase consigo misma.');
          return;
        }
        if (this.isNodeLockedByOther(sourceNode.id) || this.isNodeLockedByOther(targetNode.id)) {
          this.voiceCommandService.speak('Una de las clases está bloqueada por otro colaborador.');
          return;
        }

        const relType = cmd.payload.relationType || 'association';
        if (relType === 'association_class') {
          this.createAssociationClassBetween(sourceNode, targetNode, true);
          this.voiceCommandService.speak(`Clase asociativa creada entre ${sourceNode.name} y ${targetNode.name}.`);
          this.collaborationService.sendActivityLog(cmd.description, cmd.rawTranscript, 'voice');
          return;
        }

        this.pushUndoSnapshot();
        const optimal = this.getOptimalConnectorId(sourceNode, targetNode);
        const newConn: UmlConnection = {
          id: `conn_voice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          sourceNodeId: sourceNode.id,
          targetNodeId: targetNode.id,
          sourceId: optimal.sourceId,
          targetId: optimal.targetId,
          type: relType,
          lineStyle: this.defaultLineStyle(),
          sourceMultiplicity: cmd.payload.sourceMultiplicity ?? '',
          targetMultiplicity: cmd.payload.targetMultiplicity ?? '',
          name: cmd.payload.relationLabel || undefined,
        };

        this.connections.update((list) => [...list, newConn]);
        this.markAsUnsaved();
        this.updateConnectionEndpoints();
        this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'voice_connect');
        this.voiceCommandService.speak(`Relación ${relType} creada entre ${sourceNode.name} y ${targetNode.name}.`);
        this.collaborationService.sendActivityLog(cmd.description, cmd.rawTranscript, 'voice');
        return;
      }

      case 'RENAME_CLASS': {
        const target = this.findNodeByVoiceName(cmd.payload.className);
        if (!target) {
          this.voiceCommandService.speak(`No encontré la clase ${cmd.payload.className || ''}.`);
          return;
        }
        if (this.isNodeLockedByOther(target.id)) {
          this.voiceCommandService.speak(`La clase ${target.name} está bloqueada por otro colaborador.`);
          return;
        }

        const nextName = cmd.payload.newClassName?.trim();
        if (!nextName) return;

        const conflict = this.findNodeByVoiceName(nextName);
        if (conflict && conflict.id !== target.id) {
          this.voiceCommandService.speak(`Ya existe otro elemento llamado ${conflict.name}.`);
          return;
        }

        const oldName = target.name;
        this.pushUndoSnapshot();
        this.nodes.update((list) =>
          list.map((n) => (n.id === target.id ? { ...n, name: nextName } : n)),
        );
        this.markAsUnsaved();
        this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'voice_rename');
        this.voiceCommandService.speak(`${oldName} renombrado a ${nextName}.`);
        this.collaborationService.sendActivityLog(cmd.description, cmd.rawTranscript, 'voice');
        return;
      }

      case 'DELETE_CLASS': {
        const target = this.findNodeByVoiceName(cmd.payload.className);
        if (!target) {
          this.voiceCommandService.speak(`No encontré el elemento ${cmd.payload.className || ''}.`);
          return;
        }
        if (this.isNodeLockedByOther(target.id)) {
          this.voiceCommandService.speak(`${target.name} está bloqueado por otro colaborador.`);
          return;
        }
        this.removeClass(target.id, undefined, true);
        this.voiceCommandService.speak(`${target.name} eliminado.`);
        this.collaborationService.sendActivityLog(cmd.description, cmd.rawTranscript, 'voice');
        return;
      }
    }
  }
}
