import { Component, OnInit, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { ActivityService } from './core/activity.service';
import { ProfileStore } from './core/profile.store';
import { SessionService } from './core/session.service';
import { Avatar } from './shared/avatar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, MatToolbarModule, MatButtonModule, Avatar],
  template: `
    @if (profile(); as p) {
      <mat-toolbar>
        <span class="brand">Todo</span>
        <a mat-button routerLink="/tasks">Tasks</a>
        <a mat-button routerLink="/trash">Trash</a>
        <span class="spacer"></span>
        <a mat-button routerLink="/profile" aria-label="Profile">
          <app-avatar [src]="p.avatarUrl" [name]="p.displayName" />
        </a>
        <button mat-button (click)="signOut()">Sign out</button>
      </mat-toolbar>
    }
    <main><router-outlet /></main>
  `,
  styles: `
    .spacer { flex: 1; }
    .brand { font-weight: 600; margin-right: 16px; }
    main { padding: 16px 24px; max-width: 1000px; margin: 0 auto; }
  `,
})
export class App implements OnInit {
  private readonly store = inject(ProfileStore);
  private readonly activity = inject(ActivityService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly profile = this.store.profile;

  ngOnInit(): void {
    // Activity tracking only makes sense once the person is signed in.
    this.router.events.subscribe(() => {
      if (this.store.profile()) this.activity.start();
    });
  }

  protected signOut(): void {
    this.activity.stop();
    void this.session.signOut();
  }
}
