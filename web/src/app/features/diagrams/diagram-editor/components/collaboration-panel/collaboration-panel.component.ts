import {
  Component,
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
} from '@ng-icons/heroicons/outline';
import {
  ActivityCategory,
  CollaborationService,
  ContributorStatsItem,
} from '../../../../../core/services/collaboration.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { ProjectService } from '../../../../../core/services/project.service';
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
    }),
  ],
  templateUrl: './collaboration-panel.component.html',
})
export class CollaborationPanelComponent {
  readonly collaborationService = inject(CollaborationService);
  readonly authService = inject(AuthService);
  private readonly projectService = inject(ProjectService);

  @ViewChild('chatScrollEl') chatScrollEl?: ElementRef<HTMLDivElement>;
  @ViewChild('chatInputEl') chatInputEl?: ElementRef<HTMLInputElement>;

  readonly isOpen = input<boolean>(false);
  readonly diagramId = input<string | null>(null);
  readonly projectId = input<string | null>(null);
  readonly projectCreatedBy = input<string | null>(null);
  readonly currentUserRole = input<string>('EDITOR');
  readonly members = input<ProjectMember[]>([]);

  readonly closePanel = output<void>();
  readonly membersChanged = output<void>();

  readonly activeTab = signal<CollabTab>('chat');
  readonly chatDraft = signal<string>('');
  readonly auditFilter = signal<'all' | ActivityCategory>('all');
  readonly roomCodeCopied = signal<boolean>(false);

  // Continuidad multi-sesión & anfitrión
  readonly contributorStats = signal<ContributorStatsItem[]>([]);
  readonly isLoadingContributions = signal<boolean>(false);
  readonly isTransferringHost = signal<boolean>(false);

  // Invite form signals (OWNER only)
  readonly inviteEmail = signal<string>('');
  readonly inviteRole = signal<ProjectRole>('EDITOR');
  readonly inviteCanDownload = signal<boolean>(true);
  readonly isSubmittingMember = signal<boolean>(false);
  readonly memberError = signal<string | null>(null);
  readonly memberSuccess = signal<string | null>(null);

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
      const open = this.isOpen();
      const tab = this.activeTab();
      if (open && tab === 'chat' && count >= 0) {
        setTimeout(() => {
          const el = this.chatScrollEl?.nativeElement;
          if (el) {
            el.scrollTop = el.scrollHeight;
          }
        }, 40);
      }
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
    this.collaborationService.sendChatMessage(text);
    this.chatDraft.set('');
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
    const email = this.inviteEmail().trim();
    if (!pid || !email || this.isSubmittingMember()) return;

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

