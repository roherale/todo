import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BROWSER_LOCATION } from './browser';

/** Signing out and ending sessions. */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly location = inject(BROWSER_LOCATION);

  /** Ends this browser session. If the provider gave a sign-out URL, the browser goes there. */
  async signOut(): Promise<void> {
    const result = await firstValueFrom(this.http.post<{ logoutUrl: string | null } | null>('/auth/logout', {}));
    if (result?.logoutUrl) this.location.assign(result.logoutUrl);
    else await this.router.navigateByUrl('/signed-out');
  }

  heartbeat(): Promise<unknown> {
    return firstValueFrom(this.http.post('/api/v1/session/heartbeat', {}));
  }

  /** "Sign out everywhere": ends every session of the user (web, CLI and MCP). */
  async endAll(): Promise<void> {
    await firstValueFrom(this.http.post('/api/v1/sessions/end-all', {}));
    await this.router.navigateByUrl('/signed-out');
  }
}
