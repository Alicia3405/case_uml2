import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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

import { ProjectService } from '../../../core/services/project.service';
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
    email: ['', [Validators.required, Validators.email]],
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

  closeMembersModal(): void {
    this.isMembersModalOpen.set(false);
    this.selectedProjectForMembers.set(null);
    this.memberError.set(null);
    this.memberSuccess.set(null);
    this.isSubmittingMember.set(false);
  }

  onAddMemberSubmit(): void {
    const project = this.selectedProjectForMembers();
    if (!project || this.addMemberForm.invalid || this.isSubmittingMember()) {
      this.addMemberForm.markAllAsTouched();
      return;
    }

    this.isSubmittingMember.set(true);
    this.memberError.set(null);
    this.memberSuccess.set(null);

    this.projectService.addMember(project.id, this.addMemberForm.value).subscribe({
      next: (added) => {
        this.isSubmittingMember.set(false);
        this.addMemberForm.reset({ email: '', role: 'EDITOR', canDownloadCode: true });
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
