import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppUpdate } from './core/app-update';
import { Toasts } from './core/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toasts],
  template: `<router-outlet /><app-toasts />`,
})
export class App {
  constructor() { inject(AppUpdate).start(); }
}
