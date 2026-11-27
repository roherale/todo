import { InjectionToken } from '@angular/core';

/** The browser's location, injectable so full-page redirects can be observed in tests. */
export interface BrowserLocation {
  assign(url: string): void;
}

export const BROWSER_LOCATION = new InjectionToken<BrowserLocation>('BROWSER_LOCATION', {
  providedIn: 'root',
  factory: () => window.location,
});

/** The browser's own timezone, injectable for tests. */
export const BROWSER_TIMEZONE = new InjectionToken<string>('BROWSER_TIMEZONE', {
  providedIn: 'root',
  factory: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
});
