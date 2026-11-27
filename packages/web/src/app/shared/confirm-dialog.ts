import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface ConfirmData {
  title: string;
  message: string;
  confirmLabel: string;
  /** When set, the confirm button stays disabled until this exact text is typed. */
  requireText?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, FormsModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
      @if (data.requireText) {
        <mat-form-field appearance="outline" class="full">
          <mat-label>Type {{ data.requireText }} to confirm</mat-label>
          <input matInput [ngModel]="typed()" (ngModelChange)="typed.set($event)" autocomplete="off" />
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancel</button>
      <button mat-flat-button color="warn" [mat-dialog-close]="true" [disabled]="!allowed()">
        {{ data.confirmLabel }}
      </button>
    </mat-dialog-actions>
  `,
  styles: '.full { width: 100%; }',
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
  protected readonly typed = signal('');
  /** The typed text must match exactly: no trimming, no case folding. */
  protected allowed = () => this.data.requireText === undefined || this.typed() === this.data.requireText;
}
