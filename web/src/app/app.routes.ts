import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login.component';
import { RegisterComponent } from './features/auth/register/register.component';
import { ProjectListComponent } from './features/projects/project-list/project-list.component';
import { DiagramEditorComponent } from './features/diagrams/diagram-editor/diagram-editor.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
  },
  {
    path: 'register',
    component: RegisterComponent,
  },
  {
    path: 'projects',
    component: ProjectListComponent,
    canActivate: [authGuard],
  },
  {
    path: 'diagram',
    component: DiagramEditorComponent,
    canActivate: [authGuard],
  },
  {
    path: 'diagrams/:id',
    component: DiagramEditorComponent,
    canActivate: [authGuard],
  },
  {
    path: '',
    redirectTo: 'projects',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'projects',
  },
];
