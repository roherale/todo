import { Injectable, OnDestroy, inject } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { SessionService } from './session.service';
import { IdleWarningDialog } from './idle-warning.dialog';

export const HEARTBEAT_INTERVAL_MS = 5 * 60_000;
export const WARNING_AFTER_MS = 55 * 60_000;
export const SIGN_OUT_AFTER_MS = 60 * 60_000;
const TICK_MS = 5_000;
const INTERACTION_EVENTS = ['keydown', 'click', 'scroll', 'pointerdown', 'touchstart'] as const;

/**
 * Keeps the server session alive while the person really uses the app, and signs them out when
 * they stop: a heartbeat at most every 5 minutes after real interaction (never from a hidden tab),
 * a warning after 55 minutes without interaction, and sign-out after 60.
 */
@Injectable({ providedIn: 'root' })
export class ActivityService implements OnDestroy {
  private readonly session = inject(SessionService);
  private readonly dialog = inject(MatDialog);

  private lastInteraction = Date.now();
  private lastHeartbeat = 0;
  private interactedSinceHeartbeat = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private warning: MatDialogRef<IdleWarningDialog, boolean> | undefined;
  private signingOut = false;
  private readonly onInteraction = () => this.interact();
  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') this.interact();
  };

  start(): void {
    if (this.timer) return;
    this.lastInteraction = Date.now();
    for (const name of INTERACTION_EVENTS) document.addEventListener(name, this.onInteraction, { passive: true });
    window.addEventListener('focus', this.onInteraction);
    document.addEventListener('visibilitychange', this.onVisible);
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
    for (const name of INTERACTION_EVENTS) document.removeEventListener(name, this.onInteraction);
    window.removeEventListener('focus', this.onInteraction);
    document.removeEventListener('visibilitychange', this.onVisible);
    this.warning?.close(false);
    this.warning = undefined;
  }

  ngOnDestroy(): void {
    this.stop();
  }

  /** A real interaction: key, click, scroll, or the tab regaining focus. */
  private interact(): void {
    if (document.visibilityState === 'hidden') return;
    this.lastInteraction = Date.now();
    this.interactedSinceHeartbeat = true;
    // Interacting with the page also dismisses the warning: the person is clearly still here.
    this.warning?.close(true);
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    const idle = now - this.lastInteraction;

    if (idle >= SIGN_OUT_AFTER_MS) {
      await this.signOut();
      return;
    }
    if (idle >= WARNING_AFTER_MS && !this.warning) {
      this.warn();
      return;
    }
    const visible = document.visibilityState === 'visible';
    if (visible && this.interactedSinceHeartbeat && now - this.lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
      await this.beat(now);
    }
  }

  private async beat(now: number): Promise<void> {
    this.interactedSinceHeartbeat = false;
    this.lastHeartbeat = now;
    try {
      await this.session.heartbeat();
    } catch {
      // A failed heartbeat is not fatal: the next interaction tries again.
    }
  }

  private warn(): void {
    this.warning = this.dialog.open<IdleWarningDialog, undefined, boolean>(IdleWarningDialog, { disableClose: false });
    this.warning.afterClosed().subscribe((stay) => {
      this.warning = undefined;
      if (stay) {
        // "Stay signed in" (or any interaction) counts as activity and tells the server right away.
        this.lastInteraction = Date.now();
        void this.beat(Date.now());
      }
    });
  }

  private async signOut(): Promise<void> {
    if (this.signingOut) return;
    this.signingOut = true;
    this.warning?.close(false);
    this.stop();
    try {
      await this.session.signOut();
    } finally {
      this.signingOut = false;
    }
  }
}
