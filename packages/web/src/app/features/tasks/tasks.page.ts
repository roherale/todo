import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { PAGE_SIZES, TASK_STATUSES, type CreateTaskBody, type Task, type TaskStatus } from '@todo/shared';
import { firstValueFrom } from 'rxjs';
import { ProfileStore } from '../../core/profile.store';
import { DuePipe, isOverdue } from '../../shared/due';
import { STATUS_LABELS, TaskFormDialog, type TaskFormData } from './task-form.dialog';
import { TasksApi } from './tasks.api';

@Component({
  selector: 'app-tasks-page',
  imports: [MatButtonModule, MatFormFieldModule, MatSelectModule, MatIconModule, DuePipe],
  template: `
    <div class="bar">
      <h1>Tasks</h1>
      <button mat-flat-button (click)="create()">New task</button>
    </div>
    <div class="filters">
      <mat-form-field appearance="outline">
        <mat-label>Status</mat-label>
        <mat-select aria-label="Filter by status" [value]="status()" (valueChange)="setStatus($event)">
          <mat-option value="">All</mat-option>
          @for (s of statuses; track s) {
            <mat-option [value]="s">{{ labels[s] }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Page size</mat-label>
        <mat-select aria-label="Page size" [value]="pageSize()" (valueChange)="setPageSize($event)">
          @for (n of pageSizes; track n) {
            <mat-option [value]="n">{{ n }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>
    @if (loaded() && tasks().length === 0) {
      <p>No tasks yet.</p>
    }
    <ul class="tasks">
      @for (task of tasks(); track task.id) {
        <li [class.overdue]="overdue(task)" [attr.data-testid]="'task-' + task.number">
          <span class="number">#{{ task.number }}</span>
          <span class="title">{{ task.title }}</span>
          <span class="status">{{ labels[task.status] }}</span>
          <span class="due">
            @if (task.dueAt) {
              {{ task | due: timeZone() }}
              @if (overdue(task)) {
                <span class="overdue-flag" role="img" aria-label="Overdue">Overdue</span>
              }
            }
          </span>
          <button mat-button (click)="edit(task)">Edit</button>
          <button mat-button (click)="trash(task)">Move to trash</button>
        </li>
      }
    </ul>
    @if (nextCursor()) {
      <button mat-stroked-button (click)="more()">Load more</button>
    }
  `,
  styles: `
    .bar { display: flex; justify-content: space-between; align-items: center; }
    .filters { display: flex; gap: 16px; }
    .tasks { list-style: none; padding: 0; }
    li { display: grid; grid-template-columns: 56px 1fr 120px 200px auto auto; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--mat-sys-outline-variant); }
    li.overdue .due { color: var(--mat-sys-error); font-weight: 600; }
    .overdue-flag { margin-left: 8px; padding: 0 6px; border-radius: 4px; background: var(--mat-sys-error-container); color: var(--mat-sys-on-error-container); }
    .number { color: var(--mat-sys-on-surface-variant); }
  `,
})
export class TasksPage implements OnInit {
  private readonly api = inject(TasksApi);
  private readonly dialog = inject(MatDialog);
  private readonly store = inject(ProfileStore);

  protected readonly statuses = TASK_STATUSES;
  protected readonly labels = STATUS_LABELS;
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly tasks = signal<Task[]>([]);
  protected readonly status = signal<TaskStatus | ''>('');
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly loaded = signal(false);
  protected readonly timeZone = computed(() => this.store.profile()?.timezone ?? 'UTC');
  protected readonly pageSize = computed(() => this.store.profile()?.pageSize ?? 10);

  ngOnInit(): void {
    this.reload();
  }

  protected overdue = (task: Task) => isOverdue(task);

  private reload(): void {
    this.api.list({ limit: this.pageSize(), status: this.status() }).subscribe((page) => {
      this.tasks.set(page.items);
      this.nextCursor.set(page.nextCursor);
      this.loaded.set(true);
    });
  }

  protected more(): void {
    this.api.list({ limit: this.pageSize(), status: this.status(), cursor: this.nextCursor() }).subscribe((page) => {
      this.tasks.update((current) => [...current, ...page.items]);
      this.nextCursor.set(page.nextCursor);
    });
  }

  protected setStatus(status: TaskStatus | ''): void {
    this.status.set(status);
    this.reload();
  }

  /** The chosen size is saved to the profile, so it sticks across reloads, sign-ins and devices. */
  protected setPageSize(size: number): void {
    this.store.update({ pageSize: size as (typeof PAGE_SIZES)[number] }).subscribe(() => this.reload());
  }

  private async form(task?: Task): Promise<CreateTaskBody | undefined> {
    const data: TaskFormData = { timeZone: this.timeZone(), ...(task ? { task } : {}) };
    const ref = this.dialog.open<TaskFormDialog, TaskFormData, CreateTaskBody>(TaskFormDialog, { data });
    return firstValueFrom(ref.afterClosed());
  }

  protected async create(): Promise<void> {
    const body = await this.form();
    if (body) this.api.create(body).subscribe(() => this.reload());
  }

  protected async edit(task: Task): Promise<void> {
    const body = await this.form(task);
    if (!body) return;
    // The form always sends a complete task, so clearing a field means setting it to null.
    this.api
      .update(task.id, {
        title: body.title,
        notes: body.notes ?? null,
        status: body.status,
        dueAt: body.dueAt ?? null,
        ...(body.dueAt ? { dueAllDay: body.dueAllDay ?? false } : {}),
      })
      .subscribe(() => this.reload());
  }

  protected trash(task: Task): void {
    this.api.trash(task.id).subscribe(() => this.tasks.update((current) => current.filter((t) => t.id !== task.id)));
  }
}
