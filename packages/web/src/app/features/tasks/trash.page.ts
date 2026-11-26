import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { Task } from '@todo/shared';
import { ProfileStore } from '../../core/profile.store';
import { Confirm } from '../../shared/confirm';
import { DuePipe } from '../../shared/due';
import { TasksApi } from './tasks.api';

@Component({
  selector: 'app-trash-page',
  imports: [MatButtonModule, DuePipe],
  template: `
    <div class="bar">
      <h1>Trash</h1>
      <button mat-flat-button color="warn" (click)="empty()" [disabled]="tasks().length === 0">Empty trash</button>
    </div>
    @if (loaded() && tasks().length === 0) {
      <p>The trash is empty.</p>
    }
    <ul class="tasks">
      @for (task of tasks(); track task.id) {
        <li [attr.data-testid]="'task-' + task.number">
          <span class="number">#{{ task.number }}</span>
          <span class="title">{{ task.title }}</span>
          <span class="due">{{ task | due: timeZone() }}</span>
          <button mat-button (click)="restore(task)">Restore</button>
          <button mat-button color="warn" (click)="purge(task)">Delete permanently</button>
        </li>
      }
    </ul>
    @if (nextCursor()) {
      <button mat-stroked-button (click)="more()">Load more</button>
    }
  `,
  styles: `
    .bar { display: flex; justify-content: space-between; align-items: center; }
    .tasks { list-style: none; padding: 0; }
    li { display: grid; grid-template-columns: 56px 1fr 200px auto auto; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--mat-sys-outline-variant); }
  `,
})
export class TrashPage implements OnInit {
  private readonly api = inject(TasksApi);
  private readonly confirm = inject(Confirm);
  private readonly store = inject(ProfileStore);

  protected readonly tasks = signal<Task[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly loaded = signal(false);
  protected readonly timeZone = computed(() => this.store.profile()?.timezone ?? 'UTC');
  private readonly limit = computed(() => this.store.profile()?.pageSize ?? 10);

  ngOnInit(): void {
    this.api.listTrash({ limit: this.limit() }).subscribe((page) => {
      this.tasks.set(page.items);
      this.nextCursor.set(page.nextCursor);
      this.loaded.set(true);
    });
  }

  protected more(): void {
    this.api.listTrash({ limit: this.limit(), cursor: this.nextCursor() }).subscribe((page) => {
      this.tasks.update((current) => [...current, ...page.items]);
      this.nextCursor.set(page.nextCursor);
    });
  }

  protected restore(task: Task): void {
    this.api.restore(task.id).subscribe(() => this.tasks.update((current) => current.filter((t) => t.id !== task.id)));
  }

  protected async purge(task: Task): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Delete permanently?',
      message: `"${task.title}" will be gone for good. This cannot be undone.`,
      confirmLabel: 'Delete permanently',
    });
    if (ok) this.api.purge(task.id).subscribe(() => this.tasks.update((current) => current.filter((t) => t.id !== task.id)));
  }

  protected async empty(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Empty trash?',
      message: 'Every task in the trash will be deleted for good. This cannot be undone.',
      confirmLabel: 'Empty trash',
    });
    if (ok) this.api.emptyTrash().subscribe(() => this.tasks.set([]));
  }
}
