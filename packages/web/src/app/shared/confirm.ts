import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialog, type ConfirmData } from './confirm-dialog';

@Injectable({ providedIn: 'root' })
export class Confirm {
  private readonly dialog = inject(MatDialog);

  /** Resolves true only when the user confirms. Cancelling, Escape or clicking outside is false. */
  async ask(data: ConfirmData): Promise<boolean> {
    const ref = this.dialog.open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, { data, width: '420px' });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }
}
