import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { BROWSER_LOCATION } from './browser';

const CHANGING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** Marks every request that changes something, which the API requires for cookie sessions. */
export const csrfInterceptor: HttpInterceptorFn = (req, next) =>
  next(CHANGING.has(req.method) ? req.clone({ setHeaders: { 'X-Requested-With': 'todo-web' } }) : req);

/** Sends visitors who are not signed in to sign in, and visitors without a profile to sign up. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const location = inject(BROWSER_LOCATION);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const type = (error.error as { type?: unknown } | null)?.type;
        if (error.status === 401 && !req.url.startsWith('/auth/')) {
          location.assign('/auth/login');
        } else if (error.status === 403 && typeof type === 'string' && type.endsWith('signup-required')) {
          void router.navigateByUrl('/signup');
        }
      }
      return throwError(() => error);
    }),
  );
};
