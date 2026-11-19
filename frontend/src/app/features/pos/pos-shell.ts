import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/auth';
import { CartService } from '../../core/cart.service';
import { Icon } from '../../shared/icon';
import { Logo } from '../../shared/ui';

@Component({
  selector: 'app-pos-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Logo],
  template: `
    <div class="shell">
      <nav class="rail" aria-label="Navegação">
        <app-logo [compact]="true" />
        <a routerLink="/pdv" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }" title="Vender"><app-icon name="grid" /></a>
        <a routerLink="/pdv/comandas" routerLinkActive="on" title="Comandas"><app-icon name="tabs" /></a>
        @if (auth.isAdmin()) { <a routerLink="/gestao" title="Gestão"><app-icon name="chart" /></a> }
        <span class="grow"></span>
        <button (click)="auth.logout()" title="Sair"><app-icon name="logout" /></button>
      </nav>

      <div class="content"><router-outlet /></div>

      @if (showTabbar()) {
        <nav class="tabbar" aria-label="Navegação">
          <a routerLink="/pdv" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">
            <app-icon name="grid" /><span>Vender</span>
          </a>
          <a routerLink="/pdv/comandas" routerLinkActive="on">
            <app-icon name="tabs" /><span>Comandas</span>
          </a>
          <a routerLink="/pdv/pedido" routerLinkActive="on" class="cart-tab">
            <span class="ico"><app-icon name="bag" />@if (cart.count()) { <b>{{ cart.count() }}</b> }</span><span>Pedido</span>
          </a>
          @if (auth.isAdmin()) {
            <a routerLink="/gestao"><app-icon name="chart" /><span>Gestão</span></a>
          } @else {
            <button (click)="auth.logout()"><app-icon name="logout" /><span>Sair</span></button>
          }
        </nav>
      }
    </div>
  `,
  styles: `
    .shell { min-height: 100dvh; }
    .content { min-height: 100dvh; }
    .rail { display: none; }
    .tabbar { position: fixed; z-index: 40; left: 0; right: 0; bottom: 0; display: grid; grid-template-columns: repeat(4, 1fr);
      background: rgba(255,255,255,.96); backdrop-filter: blur(12px); border-top: 1px solid var(--line);
      padding: 6px 8px calc(6px + env(safe-area-inset-bottom)); }
    .tabbar a, .tabbar button { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 0; border: 0;
      background: none; color: var(--muted); font-size: 11px; text-decoration: none; cursor: pointer; }
    .tabbar .on { color: var(--brand); font-weight: 500; }
    .ico { position: relative; display: inline-flex; }
    .ico b { position: absolute; top: -6px; right: -10px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px;
      background: var(--brand); color: #fff; font-size: 10px; display: grid; place-items: center; }
    @media (min-width: 1024px) {
      .shell { display: grid; grid-template-columns: 76px minmax(0, 1fr); }
      .tabbar { display: none; }
      .rail { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 20px 0; position: sticky; top: 0;
        height: 100dvh; background: #fff; border-right: 1px solid var(--line); }
      .rail app-logo { margin-bottom: 18px; }
      .rail a, .rail button { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; color: var(--muted);
        border: 0; background: none; cursor: pointer; }
      .rail a:hover, .rail button:hover { background: var(--bg); color: var(--ink); }
      .rail a.on { background: var(--brand); color: #fff; }
      .grow { flex: 1; }
    }
  `,
})
export class PosShell {
  protected auth = inject(AuthService);
  protected cart = inject(CartService);
  private router = inject(Router);

  private url = toSignal(
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url },
  );
  /** Telas com barra de ação própria no rodapé escondem a navegação. */
  protected showTabbar = computed(() => !/\/pdv\/(pagar|pedido)/.test(this.url()));
}
