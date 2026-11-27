import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-signed-out-page',
  imports: [MatButtonModule],
  template: `
    <h1>You're signed out</h1>
    <p>Sign in again to carry on.</p>
    <a mat-flat-button href="/auth/login">Sign in</a>
  `,
})
export class SignedOutPage {}
