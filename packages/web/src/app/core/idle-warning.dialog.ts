import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';

@Component({
  selector: 'app-idle-warning',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Still there?</h2>
    <mat-dialog-content>You'll be signed out in 5 minutes because there's been no activity.</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button [mat-dialog-close]="true" cdkFocusInitial>Stay signed in</button>
    </mat-dialog-actions>
  `,
})
export class IdleWarningDialog {}
