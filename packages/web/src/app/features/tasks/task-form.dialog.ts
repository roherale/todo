import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CreateTaskBodySchema, TASK_STATUSES, type CreateTaskBody, type Task } from '@todo/shared';
import { dateInZone, instantInZone, timeInZone } from '../../shared/due';

export interface TaskFormData {
  timeZone: string;
  task?: Task;
}

export const STATUS_LABELS: Record<(typeof TASK_STATUSES)[number], string> = {
  new: 'New',
  queued: 'Queued',
  in_progress: 'In progress',
  paused: 'Paused',
  completed: 'Completed',
};

/** Create or edit a task. Due dates are typed in the profile timezone. */
@Component({
  selector: 'app-task-form',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, FormsModule],
  template: `
    <h2 mat-dialog-title>{{ data.task ? 'Edit task' : 'New task' }}</h2>
    <mat-dialog-content class="form">
      <mat-form-field appearance="outline">
        <mat-label>Title</mat-label>
        <input matInput name="title" [ngModel]="title()" (ngModelChange)="title.set($event)" maxlength="200" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Notes</mat-label>
        <textarea matInput name="notes" rows="3" [ngModel]="notes()" (ngModelChange)="notes.set($event)"></textarea>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Status</mat-label>
        <mat-select name="status" [value]="status()" (valueChange)="status.set($event)">
          @for (s of statuses; track s) {
            <mat-option [value]="s">{{ labels[s] }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Due date ({{ data.timeZone }})</mat-label>
        <input matInput type="date" name="dueDate" [ngModel]="dueDate()" (ngModelChange)="dueDate.set($event)" />
      </mat-form-field>
      <mat-checkbox name="allDay" [checked]="allDay()" (change)="allDay.set($event.checked)">All day</mat-checkbox>
      @if (!allDay()) {
        <mat-form-field appearance="outline">
          <mat-label>Due time</mat-label>
          <input matInput type="time" name="dueTime" [ngModel]="dueTime()" (ngModelChange)="dueTime.set($event)" />
        </mat-form-field>
      }
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="undefined">Cancel</button>
      <button mat-flat-button (click)="save()">Save</button>
    </mat-dialog-actions>
  `,
  styles: `
    .form { display: flex; flex-direction: column; gap: 4px; min-width: 340px; }
    .error { color: var(--mat-sys-error); }
  `,
})
export class TaskFormDialog {
  protected readonly data = inject<TaskFormData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<TaskFormDialog, CreateTaskBody>>(MatDialogRef);
  protected readonly statuses = TASK_STATUSES;
  protected readonly labels = STATUS_LABELS;

  protected readonly title = signal(this.data.task?.title ?? '');
  protected readonly notes = signal(this.data.task?.notes ?? '');
  protected readonly status = signal(this.data.task?.status ?? 'new');
  protected readonly dueDate = signal(this.data.task?.dueAt ? dateInZone(this.data.task.dueAt, this.data.timeZone) : '');
  protected readonly allDay = signal(this.data.task?.dueAllDay ?? false);
  protected readonly dueTime = signal(this.data.task?.dueAt && !this.data.task.dueAllDay ? timeInZone(this.data.task.dueAt, this.data.timeZone) : '09:00');
  protected readonly error = signal('');

  protected save(): void {
    const date = this.dueDate();
    const body: Record<string, unknown> = {
      title: this.title(),
      notes: this.notes() || undefined,
      status: this.status(),
    };
    if (date) {
      // The API takes the date as written for all-day tasks, so midnight UTC of that date carries it.
      body['dueAt'] = this.allDay() ? `${date}T00:00:00Z` : instantInZone(date, this.dueTime() || '00:00', this.data.timeZone);
      body['dueAllDay'] = this.allDay();
    }
    const parsed = CreateTaskBodySchema.safeParse(body);
    if (!parsed.success) {
      this.error.set(parsed.error.issues.map((i) => `${i.path.join('.') || 'task'}: ${i.message}`).join('; '));
      return;
    }
    this.ref.close(parsed.data);
  }
}
