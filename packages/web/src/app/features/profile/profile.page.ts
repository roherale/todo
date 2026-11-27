import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { UpdateProfileBodySchema } from '@todo/shared';
import { firstValueFrom } from 'rxjs';
import { ProfileStore } from '../../core/profile.store';
import { SessionService } from '../../core/session.service';
import { Avatar } from '../../shared/avatar';
import { Confirm } from '../../shared/confirm';

const ZONES: string[] = ['UTC', ...Intl.supportedValuesOf('timeZone')];

@Component({
  selector: 'app-profile-page',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, Avatar],
  template: `
    <h1>Profile</h1>
    @if (profile(); as p) {
      <app-avatar [src]="avatarUrl() || null" [name]="displayName()" />
      <form class="form" (ngSubmit)="save()">
        <mat-form-field appearance="outline">
          <mat-label>Email</mat-label>
          <input matInput name="email" [value]="p.email" readonly />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Display name</mat-label>
          <input matInput name="displayName" [ngModel]="displayName()" (ngModelChange)="displayName.set($event)" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Avatar URL</mat-label>
          <input matInput name="avatarUrl" [ngModel]="avatarUrl()" (ngModelChange)="avatarUrl.set($event)" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Timezone</mat-label>
          <mat-select name="timezone" [value]="timezone()" (valueChange)="timezone.set($event)">
            @for (z of zones; track z) {
              <mat-option [value]="z">{{ z }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        @if (message()) {
          <p role="status">{{ message() }}</p>
        }
        <button mat-flat-button type="submit">Save</button>
      </form>
      <h2>Sessions</h2>
      <button mat-stroked-button (click)="signOutEverywhere()">Sign out everywhere</button>
      <h2>Danger zone</h2>
      <button mat-flat-button color="warn" (click)="deleteAccount()">Delete account</button>
    }
  `,
  styles: '.form { display: flex; flex-direction: column; max-width: 420px; gap: 4px; }',
})
export class ProfilePage {
  private readonly store = inject(ProfileStore);
  private readonly http = inject(HttpClient);
  private readonly confirm = inject(Confirm);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly zones = ZONES;
  protected readonly profile = this.store.profile;
  protected readonly displayName = signal(this.store.profile()?.displayName ?? '');
  protected readonly avatarUrl = signal(this.store.profile()?.avatarUrl ?? '');
  protected readonly timezone = signal(this.store.profile()?.timezone ?? 'UTC');
  protected readonly message = signal('');
  protected readonly email = computed(() => this.store.profile()?.email ?? '');

  protected save(): void {
    const parsed = UpdateProfileBodySchema.safeParse({
      displayName: this.displayName(),
      avatarUrl: this.avatarUrl().trim() === '' ? null : this.avatarUrl().trim(),
      timezone: this.timezone(),
    });
    if (!parsed.success) {
      this.message.set(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      return;
    }
    this.store.update(parsed.data).subscribe({
      next: () => this.message.set('Saved.'),
      error: () => this.message.set('Could not save your profile.'),
    });
  }

  protected async signOutEverywhere(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Sign out everywhere?',
      message: 'This ends every session: this browser, the command line tool and your AI chat connections.',
      confirmLabel: 'Sign out everywhere',
    });
    if (ok) await this.session.endAll();
  }

  protected async deleteAccount(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Delete account?',
      message: 'Your account and all your tasks, including the trash, are permanently deleted.',
      confirmLabel: 'Delete account',
      requireText: this.email(),
    });
    if (!ok) return;
    await firstValueFrom(this.http.delete('/api/v1/profile', { body: { confirmEmail: this.email() } }));
    await this.router.navigateByUrl('/signed-out');
  }
}
