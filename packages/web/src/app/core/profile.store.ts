import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import type { Profile, UpdateProfileBody } from '@todo/shared';
import { Observable, tap } from 'rxjs';

/** The signed-in user's profile. The app never sees a token; the browser sends the session cookie. */
@Injectable({ providedIn: 'root' })
export class ProfileStore {
  private readonly http = inject(HttpClient);
  readonly profile = signal<Profile | null>(null);

  load(): Observable<Profile> {
    return this.http.get<Profile>('/api/v1/profile').pipe(tap((p) => this.profile.set(p)));
  }

  update(changes: UpdateProfileBody): Observable<Profile> {
    return this.http.patch<Profile>('/api/v1/profile', changes).pipe(tap((p) => this.profile.set(p)));
  }
}
