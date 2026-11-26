import type { Routes } from '@angular/router';
import { profileGuard } from './core/guards';

export const routes: Routes = [
  { path: 'signup', loadComponent: () => import('./features/signup/signup.page').then((m) => m.SignupPage) },
  { path: 'signed-out', loadComponent: () => import('./features/signed-out/signed-out.page').then((m) => m.SignedOutPage) },
  { path: 'tasks', canActivate: [profileGuard], loadComponent: () => import('./features/tasks/tasks.page').then((m) => m.TasksPage) },
  { path: 'trash', canActivate: [profileGuard], loadComponent: () => import('./features/tasks/trash.page').then((m) => m.TrashPage) },
  { path: 'profile', canActivate: [profileGuard], loadComponent: () => import('./features/profile/profile.page').then((m) => m.ProfilePage) },
  { path: '', pathMatch: 'full', redirectTo: 'tasks' },
  { path: '**', redirectTo: 'tasks' },
];
