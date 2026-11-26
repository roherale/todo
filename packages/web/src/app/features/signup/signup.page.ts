import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { SignupBodySchema } from '@todo/shared';
import { BROWSER_LOCATION, BROWSER_TIMEZONE } from '../../core/browser';

@Component({
  selector: 'app-signup-page',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h1>Create your profile</h1>
    @if (closed()) {
      <p role="alert">Sign-ups are closed. This email address is not on the list.</p>
    } @else {
      <form class="form" (ngSubmit)="submit()">
        <mat-form-field appearance="outline">
          <mat-label>Display name</mat-label>
          <input matInput name="displayName" [ngModel]="displayName()" (ngModelChange)="displayName.set($event)" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Timezone</mat-label>
          <input matInput name="timezone" [ngModel]="timezone()" (ngModelChange)="timezone.set($event)" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Avatar URL (optional)</mat-label>
          <input matInput name="avatarUrl" [ngModel]="avatarUrl()" (ngModelChange)="avatarUrl.set($event)" />
        </mat-form-field>
        @for (e of errors(); track e) {
          <p class="error" role="alert">{{ e }}</p>
        }
        <button mat-flat-button type="submit">Sign up</button>
      </form>
    }
  `,
  styles: `
    .form { display: flex; flex-direction: column; max-width: 420px; gap: 4px; }
    .error { color: var(--mat-sys-error); margin: 0; }
  `,
})
export class SignupPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly location = inject(BROWSER_LOCATION);

  protected readonly displayName = signal('');
  protected readonly timezone = signal(inject(BROWSER_TIMEZONE));
  protected readonly avatarUrl = signal('');
  protected readonly errors = signal<string[]>([]);
  protected readonly closed = signal(false);

  /** The display name the identity provider has on file, offered as a starting point. */
  ngOnInit(): void {
    this.http.get<{ email: string; displayName: string | null }>('/auth/pending-signup').subscribe({
      next: (pending) => {
        if (pending.displayName && !this.displayName()) this.displayName.set(pending.displayName);
      },
      // No pending sign-up (or no name): the person simply types their own.
      error: () => undefined,
    });
  }

  protected submit(): void {
    const avatar = this.avatarUrl().trim();
    // The same schema the API uses, so most mistakes are caught before a request is sent.
    const parsed = SignupBodySchema.safeParse({
      displayName: this.displayName(),
      timezone: this.timezone(),
      ...(avatar ? { avatarUrl: avatar } : {}),
    });
    if (!parsed.success) {
      this.errors.set(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
      return;
    }
    this.errors.set([]);
    this.http.post('/api/v1/profile', parsed.data, { observe: 'response' }).subscribe({
      // The server sends us back to sign in, which now creates a normal session.
      next: (res) => this.location.assign(res.headers.get('Location') ?? '/auth/login'),
      error: (error: unknown) => {
        const type = error instanceof HttpErrorResponse ? (error.error as { type?: unknown } | null)?.type : undefined;
        if (typeof type === 'string' && type.endsWith('signup-closed')) this.closed.set(true);
        else this.errors.set(['Could not create your profile. Check the fields and try again.']);
      },
    });
  }
}
