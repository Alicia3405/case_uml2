import { Component, DestroyRef, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of, debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroFolderPlus,
  heroFolder,
  heroUserGroup,
  heroDocumentChartBar,
  heroTrash,
  heroPencilSquare,
  heroArrowRightOnRectangle,
  heroUserCircle,
  heroMagnifyingGlass,
  heroPlus,
  heroXMark,
  heroEllipsisVertical,
  heroCube,
  heroShieldCheck,
  heroCheck,
  heroArrowTopRightOnSquare,
  heroAcademicCap,
  heroArrowDownTray,
  heroLockClosed,
} from '@ng-icons/heroicons/outline';

import { ProjectService, UserSearchResult } from '../../../core/services/project.service';
import { AuthService } from '../../../core/services/auth.service';
import { UserGuideService } from '../../../core/services/user-guide.service';
import { Project, ProjectMember, ProjectRole } from '../../../core/models/project.model';
import { UserProfileModalComponent } from '../../diagrams/diagram-editor/components/user-profile-modal/user-profile-modal.component';
import { TranslatePipe, LanguageSelectorComponent } from '../../../core/i18n';
import { ThemeToggleComponent } from '../../../core/components/theme-toggle/theme-toggle.component';

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    NgIconComponent,
    UserProfileModalComponent,
    TranslatePipe,
    LanguageSelectorComponent,
    ThemeToggleComponent,
  ],
  providers: [
    provideIcons({
      heroFolderPlus,
      heroFolder,
      heroUserGroup,
      heroDocumentChartBar,
      heroTrash,
      heroPencilSquare,
      heroArrowRightOnRectangle,
      heroUserCircle,
      heroMagnifyingGlass,
      heroPlus,
      heroXMark,
      heroEllipsisVertical,
      heroCube,
      heroShieldCheck,
      heroCheck,
      heroArrowTopRightOnSquare,
      heroAcademicCap,
      heroArrowDownTray,
      heroLockClosed,
    }),
  ],
  templateUrl: './project-list.component.html',
  styleUrls: ['./project-list.component.css'],
})
export class ProjectListComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  readonly projectService = inject(ProjectService);
  readonly authService = inject(AuthService);
  readonly guideService = inject(UserGuideService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly inviteSearchResults = signal<UserSearchResult[]>([]);
  readonly isSearchingUsers = signal<boolean>(false);
  readonly showUserDropdown = signal<boolean>(false);
  private readonly inviteSearchSubject = new Subject<string>();
  private inviteDropdownHideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.inviteSearchSubject
      .pipe(
        debounceTime(220),
        distinctUntilChanged(),
        switchMap((query) => {
          const clean = query.trim();
          const pid = this.selectedProjectForMembers()?.id;
          if (clean.length < 2) {
            this.isSearchingUsers.set(false);
            return of([]);
          }
          this.isSearchingUsers.set(true);
          return this.projectService.searchUsers(clean, pid).pipe(catchError(() => of([])));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => {
        this.isSearchingUsers.set(false);
        this.inviteSearchResults.set(results || []);
        const currentVal = String(this.addMemberForm.get('email')?.value || '').trim();
        this.showUserDropdown.set(currentVal.length >= 2);
      });
  }

  openGuide(prompt?: string): void {
    this.guideService.openGuide(prompt);
  }

  // Filtro de búsqueda
  readonly searchQuery = signal<string>('');

  // Modales
  readonly isCreateModalOpen = signal<boolean>(false);
  readonly isEditModalOpen = signal<boolean>(false);
  readonly isMembersModalOpen = signal<boolean>(false);
  readonly isProfileModalOpen = signal<boolean>(false);
  readonly selectedProjectForMembers = signal<Project | null>(null);
  readonly selectedProjectForEdit = signal<Project | null>(null);
  readonly isSubmittingMember = signal<boolean>(false);
  readonly memberError = signal<string | null>(null);
  readonly memberSuccess = signal<string | null>(null);

  // Formulario Crear Proyecto
  readonly createForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: [''],
    basePackage: ['com.example.app', [Validators.required, Validators.maxLength(150)]],
    javaVersion: [21, [Validators.required]],
    springBootVersion: ['3.3.0', [Validators.required]],
  });

  // Formulario Editar Proyecto
  readonly editForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: [''],
    basePackage: ['com.example.app', [Validators.required, Validators.maxLength(150)]],
    javaVersion: [21, [Validators.required]],
    springBootVersion: ['3.3.0', [Validators.required]],
  });

  // Formulario Agregar Miembro
  readonly addMemberForm: FormGroup = this.fb.group({
    email: ['', [Validators.required]],
    role: ['EDITOR', [Validators.required]],
    canDownloadCode: [true],
  });

  readonly projects = computed(() => this.projectService.projects());

  // Proyectos filtrados
  readonly filteredProjects = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const list = this.projectService.projects();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        p.basePackage.toLowerCase().includes(q),
    );
  });

  logout(): void {
    this.authService.logout();
  }

  ngOnInit(): void {
    this.projectService.loadProjects().subscribe();
  }

  // --- CREAR PROYECTO ---
  openCreateModal(): void {
    this.createForm.reset({
      name: '',
      description: '',
      basePackage: 'com.example.app',
      javaVersion: 21,
      springBootVersion: '3.3.0',
    });
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
  }

  onCreateSubmit(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    this.projectService.createProject(this.createForm.value).subscribe({
      next: () => {
        this.closeCreateModal();
      },
    });
  }

  // --- EDITAR PROYECTO ---
  openEditModal(project: Project, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.selectedProjectForEdit.set(project);
    this.editForm.patchValue({
      name: project.name,
      description: project.description || '',
      basePackage: project.basePackage,
      javaVersion: project.javaVersion,
      springBootVersion: project.springBootVersion,
    });
    this.isEditModalOpen.set(true);
  }

  closeEditModal(): void {
    this.isEditModalOpen.set(false);
    this.selectedProjectForEdit.set(null);
  }

  onEditSubmit(): void {
    const project = this.selectedProjectForEdit();
    if (!project || this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    this.projectService.updateProject(project.id, this.editForm.value).subscribe({
      next: () => {
        this.closeEditModal();
      },
    });
  }

  openDiagram(project: Project): void {
    this.router.navigate(['/diagram'], {
      queryParams: { projectId: project.id, projectName: project.name },
    });
  }

  // --- GESTIÓN DE MIEMBROS ---
  private extractHttpError(err: any, fallback: string): string {
    const raw = err?.error?.error?.message || err?.error?.message || err?.message || fallback;
    return Array.isArray(raw) ? raw.join(', ') : String(raw);
  }

  openMembersModal(project: Project, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.memberError.set(null);
    this.memberSuccess.set(null);
    this.inviteSearchResults.set([]);
    this.showUserDropdown.set(false);
    this.isSearchingUsers.set(false);
    this.selectedProjectForMembers.set(project);
    this.addMemberForm.reset({ email: '', role: 'EDITOR', canDownloadCode: true });
    this.isMembersModalOpen.set(true);
    this.projectService.getProject(project.id).subscribe({
      next: (fresh) => this.selectedProjectForMembers.set(fresh),
      error: (err) => {
        this.memberError.set(this.extractHttpError(err, 'No se pudo cargar la lista de miembros.'));
      },
    });
  }

  onInviteRoleChange(): void {
    const role = this.addMemberForm.get('role')?.value as ProjectRole;
    this.addMemberForm.patchValue({ canDownloadCode: role !== 'VIEWER' });
  }

  onInviteInputChange(value: string): void {
    this.memberError.set(null);
    const clean = (value || '').trim();
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
    const clean = String(this.addMemberForm.get('email')?.value || '').trim();
    if (clean.length >= 2 && this.inviteSearchResults().length > 0) {
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
    this.addMemberForm.patchValue({ email: user.email });
    this.showUserDropdown.set(false);
  }

  closeMembersModal(): void {
    this.isMembersModalOpen.set(false);
    this.selectedProjectForMembers.set(null);
    this.memberError.set(null);
    this.memberSuccess.set(null);
    this.inviteSearchResults.set([]);
    this.showUserDropdown.set(false);
    this.isSearchingUsers.set(false);
    this.isSubmittingMember.set(false);
  }

  onAddMemberSubmit(): void {
    const project = this.selectedProjectForMembers();
    if (!project || this.isSubmittingMember()) {
      return;
    }

    let rawEmail = String(this.addMemberForm.get('email')?.value || '').trim();
    if (!rawEmail) {
      this.addMemberForm.markAllAsTouched();
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      const available = this.inviteSearchResults().filter((u) => !u.alreadyMember);
      const exactMatch = available.find(
        (u) => u.fullName.toLowerCase() === rawEmail.toLowerCase(),
      );
      if (exactMatch) {
        rawEmail = exactMatch.email;
        this.addMemberForm.patchValue({ email: rawEmail });
      } else if (available.length === 1) {
        rawEmail = available[0].email;
        this.addMemberForm.patchValue({ email: rawEmail });
      } else {
        this.memberError.set('Selecciona un colaborador de la lista o ingresa un correo válido.');
        return;
      }
    }

    this.isSubmittingMember.set(true);
    this.memberError.set(null);
    this.memberSuccess.set(null);

    const { role, canDownloadCode } = this.addMemberForm.value;
    this.projectService
      .addMember(project.id, { email: rawEmail, role, canDownloadCode })
      .subscribe({
        next: (added) => {
          this.isSubmittingMember.set(false);
          this.addMemberForm.reset({ email: '', role: 'EDITOR', canDownloadCode: true });
          this.inviteSearchResults.set([]);
          this.showUserDropdown.set(false);
          this.memberSuccess.set(`${added.fullName} agregado como ${added.role}.`);
          setTimeout(() => this.memberSuccess.set(null), 3000);
          this.projectService.getProject(project.id).subscribe({
            next: (p) => this.selectedProjectForMembers.set(p),
            error: () => {},
          });
        },
        error: (err) => {
          this.isSubmittingMember.set(false);
          this.memberError.set(
            this.extractHttpError(
              err,
              'No se pudo invitar al usuario. Verifica que el correo esté registrado.',
            ),
          );
        },
      });
  }

  onRemoveMember(userId: string): void {
    const project = this.selectedProjectForMembers();
    if (!project || this.isSubmittingMember()) return;

    if (confirm('¿Estás seguro de remover a este miembro del proyecto?')) {
      this.isSubmittingMember.set(true);
      this.memberError.set(null);
      this.memberSuccess.set(null);

      this.projectService.removeMember(project.id, userId).subscribe({
        next: () => {
          this.isSubmittingMember.set(false);
          this.memberSuccess.set('Miembro removido del proyecto.');
          setTimeout(() => this.memberSuccess.set(null), 2500);
          this.projectService.getProject(project.id).subscribe({
            next: (p) => this.selectedProjectForMembers.set(p),
            error: () => {},
          });
        },
        error: (err) => {
          this.isSubmittingMember.set(false);
          this.memberError.set(this.extractHttpError(err, 'No se pudo remover al colaborador.'));
        },
      });
    }
  }

  onRoleChange(userId: string, newRole: ProjectRole): void {
    const project = this.selectedProjectForMembers();
    if (!project || this.isSubmittingMember()) return;

    this.isSubmittingMember.set(true);
    this.memberError.set(null);
    this.projectService.updateMemberRole(project.id, userId, { role: newRole }).subscribe({
      next: (updated) => {
        this.isSubmittingMember.set(false);
        this.memberSuccess.set(`Rol de ${updated.fullName} actualizado a ${updated.role}.`);
        setTimeout(() => this.memberSuccess.set(null), 2500);
        this.projectService.getProject(project.id).subscribe({
          next: (p) => this.selectedProjectForMembers.set(p),
          error: () => {},
        });
      },
      error: (err) => {
        this.isSubmittingMember.set(false);
        this.memberError.set(this.extractHttpError(err, 'No se pudo actualizar el rol del miembro.'));
      },
    });
  }

  onToggleDownloadPermission(member: ProjectMember): void {
    const project = this.selectedProjectForMembers();
    if (!project || this.isSubmittingMember()) return;

    this.isSubmittingMember.set(true);
    this.memberError.set(null);
    const nextPermission = member.canDownloadCode === false;
    this.projectService
      .updateMemberRole(project.id, member.userId, { canDownloadCode: nextPermission })
      .subscribe({
        next: (updated) => {
          this.isSubmittingMember.set(false);
          this.memberSuccess.set(
            updated.canDownloadCode !== false
              ? `Descarga ZIP habilitada para ${updated.fullName}.`
              : `Descarga ZIP restringida para ${updated.fullName}.`,
          );
          setTimeout(() => this.memberSuccess.set(null), 2500);
          this.projectService.getProject(project.id).subscribe({
            next: (p) => this.selectedProjectForMembers.set(p),
            error: () => {},
          });
        },
        error: (err) => {
          this.isSubmittingMember.set(false);
          this.memberError.set(
            this.extractHttpError(err, 'No se pudo actualizar el permiso de descarga.'),
          );
        },
      });
  }

  onDeleteProject(project: Project, event: MouseEvent): void {
    event.stopPropagation();
    if (confirm(`¿Estás seguro de eliminar el proyecto "${project.name}" y todos sus diagramas asociados?`)) {
      this.projectService.deleteProject(project.id).subscribe();
    }
  }

  openProfileModal(): void {
    this.isProfileModalOpen.set(true);
  }
}
