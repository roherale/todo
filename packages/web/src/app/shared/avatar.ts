import { Component, computed, input, signal } from '@angular/core';

/** The user's picture, or their initials when there is none or it fails to load. */
@Component({
  selector: 'app-avatar',
  template: `
    @if (src() && !failed()) {
      <img [src]="src()" alt="" referrerpolicy="no-referrer" (error)="failed.set(true)" />
    } @else {
      <span class="initials" aria-hidden="true">{{ initials() }}</span>
    }
  `,
  styles: `
    :host { display: inline-flex; width: 36px; height: 36px; border-radius: 50%; overflow: hidden; background: var(--mat-sys-primary-container); color: var(--mat-sys-on-primary-container); align-items: center; justify-content: center; font-size: 14px; }
    img { width: 100%; height: 100%; object-fit: cover; }
  `,
})
export class Avatar {
  readonly src = input<string | null | undefined>(null);
  readonly name = input('');
  protected readonly failed = signal(false);
  protected readonly initials = computed(() => {
    const words = this.name().trim().split(/\s+/).filter(Boolean);
    const letters = words.length > 1 ? [words[0]![0], words[words.length - 1]![0]] : [words[0]?.slice(0, 2)];
    return letters.join('').toUpperCase() || '?';
  });
}
