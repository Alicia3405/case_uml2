import {
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of, debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroChatBubbleLeftRight,
  heroClipboardDocumentList,
  heroUserGroup,
  heroXMark,
  heroPaperAirplane,
  heroArrowDownTray,
  heroLockClosed,
  heroShieldCheck,
  heroTrash,
  heroPlus,
  heroCheck,
  heroClipboardDocument,
  heroSparkles,
  heroClock,
  heroArrowsRightLeft,
  heroMagnifyingGlass,
} from '@ng-icons/heroicons/outline';
import {
  ActivityCategory,
  CollaborationService,
  ContributorStatsItem,
} from '../../../../../core/services/collaboration.service';
import { AiAssistantService, AiPromptMode } from '../../../../../core/services/ai-assistant.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { ProjectService, UserSearchResult } from '../../../../../core/services/project.service';
import { AiAnnotationItem, UmlClassNode, UmlConnection } from '../../../../../core/models/diagram.model';
import { ProjectMember, ProjectRole } from '../../../../../core/models/project.model';
import { TranslatePipe } from '../../../../../core/i18n';

export type CollabTab = 'chat' | 'audit' | 'team';

@Component({
  selector: 'app-collaboration-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, NgIconComponent, TranslatePipe],
  providers: [
    provideIcons({
      heroChatBubbleLeftRight,
      heroClipboardDocumentList,
      heroUserGroup,
      heroXMark,
      heroPaperAirplane,
      heroArrowDownTray,
      heroLockClosed,
      heroShieldCheck,
      heroTrash,
      heroPlus,
      heroCheck,
      heroClipboardDocument,
      heroSparkles,
      heroClock,
      heroArrowsRightLeft,
      heroMagnifyingGlass,
    }),
  ],
  templateUrl: './collaboration-panel.component.html',
})
export class CollaborationPanelComponent {
  readonly collaborationService = inject(CollaborationService);
  readonly authService = inject(AuthService);
  private readonly projectService = inject(ProjectService);
  private readonly aiAssistantService = inject(AiAssistantService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('chatScrollEl') chatScrollEl?: ElementRef<HTMLDivElement>;
  @ViewChild('chatInputEl') chatInputEl?: ElementRef<HTMLInputElement>;

  readonly isOpen = input<boolean>(false);
  readonly diagramId = input<string | null>(null);
  readonly projectId = input<string | null>(null);
  readonly projectCreatedBy = input<string | null>(null);
  readonly currentUserRole = input<string>('EDITOR');
  readonly isReadOnly = input<boolean>(false);
  readonly members = input<ProjectMember[]>([]);
  readonly currentNodes = input<UmlClassNode[]>([]);
  readonly currentConnections = input<UmlConnection[]>([]);

  readonly closePanel = output<void>();
  readonly membersChanged = output<void>();
  readonly applyMutation = output<{
    nodes: UmlClassNode[];
    connections: UmlConnection[];
    summary: string;
    rawResponse?: any;
  }>();
  readonly annotationsCreated = output<AiAnnotationItem[]>();

  readonly activeTab = signal<CollabTab>('chat');
  readonly chatDraft = signal<string>('');
  readonly isAiReplying = signal<boolean>(false);
  readonly auditFilter = signal<'all' | ActivityCategory>('all');
  readonly roomCodeCopied = signal<boolean>(false);

  // Continuidad multi-sesión & anfitrión
  readonly contributorStats = signal<ContributorStatsItem[]>([]);
  readonly isLoadingContributions = signal<boolean>(false);
  readonly isTransferringHost = signal<boolean>(false);

  // Invite form + autocompletado dinámico (OWNER only)
  readonly inviteEmail = signal<string>('');
  readonly inviteRole = signal<ProjectRole>('EDITOR');
  readonly inviteCanDownload = signal<boolean>(true);
  readonly isSubmittingMember = signal<boolean>(false);
  readonly memberError = signal<string | null>(null);
  readonly memberSuccess = signal<string | null>(null);
  readonly inviteSearchResults = signal<UserSearchResult[]>([]);
  readonly isSearchingUsers = signal<boolean>(false);
  readonly showUserDropdown = signal<boolean>(false);
  private readonly inviteSearchSubject = new Subject<string>();
  private inviteDropdownHideTimer: ReturnType<typeof setTimeout> | null = null;

  readonly isOwner = computed(() => this.currentUserRole() === 'OWNER');
  readonly isCurrentHost = computed(() => {
    const uid = this.authService.currentUser()?.id;
    const hostId = this.collaborationService.sessionMeta()?.hostUserId;
    return Boolean(uid && hostId && uid === hostId);
  });

  readonly filteredActivityLogs = computed(() => {
    const filter = this.auditFilter();
    const list = this.collaborationService.activityLogs();
    const filtered = filter === 'all' ? list : list.filter((a) => a.category === filter);
    return [...filtered].reverse();
  });

  constructor() {
    effect(() => {
      const visible = this.isOpen() && this.activeTab() === 'chat';
      untracked(() => {
        this.collaborationService.setChatPanelVisible(visible);
      });
    });

    effect(() => {
      const count = this.collaborationService.chatMessages().length;
      const aiLoading = this.isAiReplying();
      const open = this.isOpen();
      const tab = this.activeTab();
      if (open && tab === 'chat' && (count >= 0 || aiLoading)) {
        setTimeout(() => {
          const el = this.chatScrollEl?.nativeElement;
          if (el) {
            el.scrollTop = el.scrollHeight;
          }
        }, 40);
      }
    });

    this.inviteSearchSubject
      .pipe(
        debounceTime(220),
        distinctUntilChanged(),
        switchMap((query) => {
          const clean = query.trim();
          const pid = this.projectId() || undefined;
          if (clean.length < 2) {
            this.isSearchingUsers.set(false);
            return of([]);
          }
          this.isSearchingUsers.set(true);
          return this.projectService.searchUsers(clean, pid).pipe(
            catchError(() => of([])),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => {
        this.isSearchingUsers.set(false);
        this.inviteSearchResults.set(results || []);
        this.showUserDropdown.set(this.inviteEmail().trim().length >= 2);
      });
  }

  setTab(tab: CollabTab): void {
    this.activeTab.set(tab);
    if (tab === 'chat' && this.isOpen()) {
      this.collaborationService.markChatAsRead();
    } else if (tab === 'team') {
      this.loadContributions();
    }
  }

  loadContributions(): void {
    const dId = this.diagramId() || this.collaborationService.currentDiagramId();
    if (!dId || this.isLoadingContributions()) return;
    this.isLoadingContributions.set(true);
    this.collaborationService.getContributions(dId).subscribe({
      next: (report) => {
        this.isLoadingContributions.set(false);
        this.contributorStats.set(report?.contributorStats || []);
      },
      error: () => {
        this.isLoadingContributions.set(false);
      },
    });
  }

  insertMentionAi(presetText?: string): void {
    if (presetText) {
      this.chatDraft.set(presetText);
    } else {
      const current = this.chatDraft().trim();
      this.chatDraft.set(current.toLowerCase().startsWith('@ia') ? current + ' ' : `@IA ${current}`);
    }
    setTimeout(() => this.chatInputEl?.nativeElement?.focus(), 20);
  }

  onTransferHost(targetUserId: string, targetName: string): void {
    const sessionId = this.collaborationService.sessionMeta()?.id;
    if (!sessionId || !this.isCurrentHost() || this.isTransferringHost()) return;
    this.isTransferringHost.set(true);
    this.memberError.set(null);
    this.collaborationService.transferHost(sessionId, targetUserId).subscribe({
      next: () => {
        this.isTransferringHost.set(false);
        this.memberSuccess.set(`👑 Anfitrión transferido a ${targetName}.`);
        setTimeout(() => this.memberSuccess.set(null), 2600);
      },
      error: (err) => {
        this.isTransferringHost.set(false);
        const msg = err?.error?.message || 'No se pudo transferir el rol de anfitrión.';
        this.memberError.set(Array.isArray(msg) ? msg.join(', ') : msg);
      },
    });
  }

  getAiModeLabel(mode?: string | null): string {
    switch (mode) {
      case 'MUTATE':
        return '⚡ Editó pizarra';
      case 'REVIEW':
        return '🔍 Revisión';
      case 'DISCIPLINE':
        return '📐 Disciplina OMT';
      case 'RECAP':
        return '🕒 Resumen';
      default:
        return '💡 Opinión';
    }
  }

  copyRoomCode(): void {
    const code = this.collaborationService.activeRoomCode();
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      this.roomCodeCopied.set(true);
      setTimeout(() => this.roomCodeCopied.set(false), 1800);
    });
  }

  onSendChat(): void {
    const text = this.chatDraft().trim();
    if (!text) return;
    this.chatDraft.set('');

    const isOnlineRoom = Boolean(
      this.collaborationService.isConnected() && this.collaborationService.currentDiagramId(),
    );

    if (isOnlineRoom) {
      this.collaborationService.sendChatMessage(text, {
        currentNodes: this.currentNodes(),
        currentConnections: this.currentConnections(),
      });
      return;
    }

    // Modo local (sin sala conectada o en /diagram independiente)
    this.collaborationService.sendChatMessage(text);

    const hasAiMention = /@(?:ia|copilot|ai)\b/i.test(text);
    if (!hasAiMention) {
      this.collaborationService.appendLocalChatMessage({
        userId: 'system-guide',
        userName: 'Guía Local',
        senderType: 'system',
        message:
          'Estás en modo local sin sala conectada. Para hablar o editar el diagrama con la IA desde este chat, antepón @IA (por ejemplo: "@IA revisa Producto" o "@IA crea la clase Cliente").',
      });
      return;
    }

    const strippedPrompt = text.replace(/@(?:ia|copilot|ai)\b[\s,:-]*/gi, '').trim();
    if (!strippedPrompt) {
      this.collaborationService.appendLocalChatMessage({
        userId: 'ai-copilot',
        userName: '✨ Copilot IA',
        senderType: 'ai',
        aiMode: 'ADVISE',
        mutatedDiagram: false,
        message:
          '¿En qué te ayudo? Escribe tu consulta o comando después de @IA (por ejemplo: "@IA dime cómo mejorar la clase Producto" o "@IA agrega correo String a Cliente").',
      });
      return;
    }

    if (this.isAiReplying()) return;
    this.isAiReplying.set(true);

    const savedProvider =
      (localStorage.getItem('uml_preferred_ai_provider') as 'ollama' | 'vertex' | null) || undefined;
    const savedModel = localStorage.getItem('uml_preferred_ai_model') || undefined;
    const effectiveMode: AiPromptMode = this.isReadOnly() ? 'advise' : 'auto';
    const currentUser = this.authService.currentUser();

    this.aiAssistantService
      .sendTextPrompt(
        strippedPrompt,
        this.diagramId() || 'temp_diagram',
        this.collaborationService.activeRoomCode() || undefined,
        this.currentNodes(),
        this.currentConnections(),
        [],
        {
          provider: savedProvider,
          model: savedModel,
          mode: effectiveMode,
          broadcastToRoom: false,
          createWhiteboardNotes: !this.isReadOnly(),
          persistChanges: false,
        },
      )
      .subscribe({
        next: (res) => {
          this.isAiReplying.set(false);
          const aiMsg = res.message || res.changesSummary || '¡Listo!';
          const didMutate = Boolean(
            res.success &&
              (res.mutatedDiagram || res.action === 'diagram_mutated') &&
              !this.isReadOnly() &&
              Array.isArray(res.nodes),
          );

          this.collaborationService.appendLocalChatMessage({
            userId: 'ai-copilot',
            userName: '✨ Copilot IA',
            senderType: 'ai',
            aiMode: res.intentMode || (didMutate ? 'MUTATE' : 'ADVISE'),
            requestedByUserName: currentUser?.fullName || null,
            mutatedDiagram: didMutate,
            providerUsed: res.providerUsed || null,
            modelUsed: res.modelUsed || null,
            message: aiMsg,
          });

          if (res.annotationsAdded && res.annotationsAdded.length > 0 && !this.isReadOnly()) {
            this.annotationsCreated.emit(res.annotationsAdded);
          }

          if (didMutate) {
            this.applyMutation.emit({
              nodes: res.nodes,
              connections: res.connections || [],
              summary: res.changesSummary || aiMsg,
              rawResponse: res,
            });
          }
        },
        error: (err) => {
          this.isAiReplying.set(false);
          const errMsg = err?.error?.message || err?.message || 'No se pudo consultar al Copilot IA.';
          this.collaborationService.appendLocalChatMessage({
            userId: 'ai-copilot',
            userName: '✨ Copilot IA',
            senderType: 'ai',
            aiMode: 'ADVISE',
            mutatedDiagram: false,
            message: `⚠️ ${Array.isArray(errMsg) ? errMsg.join(', ') : errMsg}`,
          });
        },
      });
  }

  onInviteInputChange(value: string): void {
    this.inviteEmail.set(value);
    this.memberError.set(null);
    const clean = value.trim();
    if (clean.length < 2) {
      this.inviteSearchResults.set([]);
      this.showUserDropdown.set(false);
      this.isSearchingUsers.set(false);
      return;
    }
    this.showUserDropdown.set(true);
    this.inviteSearchSubject.next(clean);
  }

  onInviteFocus(): void {
    if (this.inviteDropdownHideTimer) {
      clearTimeout(this.inviteDropdownHideTimer);
      this.inviteDropdownHideTimer = null;
    }
    if (this.inviteEmail().trim().length >= 2 && this.inviteSearchResults().length > 0) {
      this.showUserDropdown.set(true);
    }
  }

  onInviteBlur(): void {
    this.inviteDropdownHideTimer = setTimeout(() => {
      this.showUserDropdown.set(false);
    }, 180);
  }

  selectInviteCandidate(user: UserSearchResult): void {
    if (user.alreadyMember) return;
    if (this.inviteDropdownHideTimer) {
      clearTimeout(this.inviteDropdownHideTimer);
      this.inviteDropdownHideTimer = null;
    }
    this.inviteEmail.set(user.email);
    this.showUserDropdown.set(false);
  }

  isOwnChatMessage(userId: string): boolean {
    const myId = this.authService.currentUser()?.id;
    return Boolean(myId && userId === myId) || userId === 'local';
  }

  onInviteRoleChange(role: ProjectRole): void {
    this.inviteRole.set(role);
    this.inviteCanDownload.set(role !== 'VIEWER');
  }

  onInviteMember(): void {
    const pid = this.projectId();
    let email = this.inviteEmail().trim();
    if (!pid || !email || this.isSubmittingMember()) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const available = this.inviteSearchResults().filter((u) => !u.alreadyMember);
      const exactMatch = available.find(
        (u) => u.fullName.toLowerCase() === email.toLowerCase(),
      );
      if (exactMatch) {
        email = exactMatch.email;
      } else if (available.length === 1) {
        email = available[0].email;
      } else {
        this.memberError.set('Selecciona un colaborador de la lista o ingresa un correo válido.');
        return;
      }
    }

    this.isSubmittingMember.set(true);
    this.memberError.set(null);
    this.memberSuccess.set(null);

    const role = this.inviteRole();
    const canDownloadCode = this.inviteCanDownload();

    this.projectService
      .addMember(pid, { email, role, canDownloadCode })
      .subscribe({
        next: (added) => {
          this.isSubmittingMember.set(false);
          this.inviteEmail.set('');
          this.inviteSearchResults.set([]);
          this.showUserDropdown.set(false);
          this.memberSuccess.set(`${added.fullName} agregado (${added.role}).`);
          setTimeout(() => this.memberSuccess.set(null), 2500);
          this.collaborationService.sendActivityLog(
            `Invitó a ${added.fullName}`,
            `Rol: ${added.role} • Descarga ZIP: ${added.canDownloadCode !== false ? 'Sí' : 'No'}`,
            'permission',
          );
          this.membersChanged.emit();
        },
        error: (err) => {
          this.isSubmittingMember.set(false);
          const msg = err?.error?.error?.message || err?.error?.message || 'No se pudo agregar al colaborador.';
          this.memberError.set(Array.isArray(msg) ? msg.join(', ') : msg);
        },
      });
  }

  onRoleChange(member: ProjectMember, newRole: ProjectRole): void {
    const pid = this.projectId();
    if (!pid || !this.isOwner() || member.role === newRole) return;

    this.memberError.set(null);
    this.projectService.updateMemberRole(pid, member.userId, { role: newRole }).subscribe({
      next: (updated) => {
        this.collaborationService.sendActivityLog(
          `Cambió rol de ${updated.fullName}`,
          `Nuevo rol: ${updated.role}`,
          'permission',
        );
        this.membersChanged.emit();
      },
      error: (err) => {
        const msg = err?.error?.message || 'Error al actualizar el rol.';
        this.memberError.set(Array.isArray(msg) ? msg.join(', ') : msg);
      },
    });
  }

  onToggleDownloadPermission(member: ProjectMember): void {
    const pid = this.projectId();
    if (!pid || !this.isOwner()) return;

    const nextPerm = member.canDownloadCode === false;
    this.memberError.set(null);

    this.projectService
      .updateMemberRole(pid, member.userId, { canDownloadCode: nextPerm })
      .subscribe({
        next: (updated) => {
          this.collaborationService.sendActivityLog(
            `Actualizó descarga ZIP para ${updated.fullName}`,
            updated.canDownloadCode !== false ? 'Descarga ZIP permitida' : 'Descarga ZIP bloqueada',
            'permission',
          );
          this.membersChanged.emit();
        },
        error: (err) => {
          const msg = err?.error?.message || 'Error al actualizar permiso de descarga.';
          this.memberError.set(Array.isArray(msg) ? msg.join(', ') : msg);
        },
      });
  }

  onRemoveMember(member: ProjectMember): void {
    const pid = this.projectId();
    if (!pid || !this.isOwner()) return;
    if (!confirm(`¿Estás seguro de remover a ${member.fullName} del proyecto?`)) return;

    this.memberError.set(null);
    this.projectService.removeMember(pid, member.userId).subscribe({
      next: () => {
        this.collaborationService.sendActivityLog(
          `Removió a ${member.fullName} del proyecto`,
          undefined,
          'permission',
        );
        this.membersChanged.emit();
      },
      error: (err) => {
        const msg = err?.error?.message || 'No se pudo remover al colaborador.';
        this.memberError.set(Array.isArray(msg) ? msg.join(', ') : msg);
      },
    });
  }

  getCategoryBadgeClass(cat: ActivityCategory): string {
    switch (cat) {
      case 'ai':
        return 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-700';
      case 'voice':
        return 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-700';
      case 'permission':
        return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700';
      case 'system':
        return 'bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600';
      default:
        return 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-700';
    }
  }
}

