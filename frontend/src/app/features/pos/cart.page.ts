import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Icon } from '../../shared/icon';
import { CartPanel } from './cart-panel';

@Component({
  selector: 'app-cart-page',
  imports: [Icon, CartPanel],
  template: `
    <div class="page">
      <header class="bar">
        <button class="icon-btn" (click)="location.back()" aria-label="Voltar"><app-icon name="back" /></button>
        <span>Revisar pedido</span>
        <span class="spacer"></span>
      </header>
      <app-cart-panel class="panel" />
    </div>
  `,
  styles: `
    .page { min-height: 100dvh; display: flex; flex-direction: column; padding: calc(12px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));
      max-width: 640px; margin: 0 auto; background: #fff; }
    .bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; font-weight: 500; }
    .spacer { width: 42px; }
    .panel { flex: 1; }
  `,
})
export class CartPage {
  protected location = inject(Location);
}
