import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { EnvironmentProviders, Provider } from '@angular/core';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, type Routes } from '@angular/router';
import type { Profile, Task } from '@todo/shared';
import { BROWSER_LOCATION, BROWSER_TIMEZONE } from './core/browser';
import { authInterceptor, csrfInterceptor } from './core/interceptors';
import { ProfileStore } from './core/profile.store';

export const profile: Profile = {
  id: 'u1',
  email: 'ana@example.test',
  displayName: 'Ana Lopez',
  avatarUrl: null,
  timezone: 'America/Mexico_City',
  pageSize: 25,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

let counter = 0;
export function task(overrides: Partial<Task> = {}): Task {
  counter += 1;
  return {
    id: `t${counter}`,
    number: counter,
    ownerId: 'u1',
    title: `Task ${counter}`,
    notes: null,
    status: 'new',
    dueAt: null,
    dueAllDay: false,
    deletedAt: null,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export interface Harness {
  assigned: string[];
  providers: (Provider | EnvironmentProviders)[];
}

/** The app's real HTTP interceptors and a recording stand-in for `window.location`. */
export function harness(options: { routes?: Routes; timezone?: string; profile?: Partial<Profile> | null } = {}): Harness {
  const assigned: string[] = [];
  return {
    assigned,
    providers: [
      provideRouter(options.routes ?? []),
      provideHttpClient(withInterceptors([csrfInterceptor, authInterceptor])),
      provideHttpClientTesting(),
      { provide: BROWSER_LOCATION, useValue: { assign: (url: string) => assigned.push(url) } },
      { provide: BROWSER_TIMEZONE, useValue: options.timezone ?? 'Europe/Madrid' },
      {
        provide: ProfileStore,
        useFactory: () => {
          const s = new ProfileStore();
          if (options.profile !== null) s.profile.set({ ...profile, ...options.profile });
          return s;
        },
      },
    ],
  };
}

/** Waits until Angular has applied pending changes, including those inside dialogs. */
export const settle = () => TestBed.inject(ApplicationRef).whenStable();
export const http = () => TestBed.inject(HttpTestingController);
export const store = () => TestBed.inject(ProfileStore);

/** Types into a field by dispatching a real input event, which works inside dialogs without zones. */
export async function typeInto(input: HTMLInputElement, text: string): Promise<void> {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}

/** Presses a key on an element, so overlays that listen on the document see it. */
export async function pressKey(target: Element, key: string): Promise<void> {
  const keyCode = key === 'Escape' ? 27 : 0; // overlays still read the legacy keyCode
  target.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, keyCode, bubbles: true, cancelable: true }));
  await settle();
}
