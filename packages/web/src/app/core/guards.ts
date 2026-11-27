import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { ProfileStore } from './profile.store';

/** Lets signed-in, signed-up users through. Other cases are redirected by the interceptor. */
export const profileGuard: CanActivateFn = () => {
  const store = inject(ProfileStore);
  if (store.profile()) return true;
  return store.load().pipe(
    map(() => true),
    catchError(() => of(false)),
  );
};
