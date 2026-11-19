import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth';
import { Icon } from '../../shared/icon';
import { Logo } from '../../shared/ui';

@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Logo],
  template: `
    <div class="shell">
      <aside class="side" [class.open]="menu()">
        <div class="brand"><app-logo /><span class="tag">Gestão</span></div>
        <nav (click)="menu.set(false)">
          @for (l of links; track l.path) {
            <a [routerLink]="l.path" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: l.path === '/gestao' }">
              <app-icon [name]="l.icon" [size]="19" />{{ l.label }}
            </a>
          }
        </nav>
        <a class="to-pos btn primary block" routerLink="/pdv"><app-icon name="grid" [size]="18" />Abrir PDV</a>
        <div class="me">
          <span class="avatar">{{ auth.user()?.name?.[0] }}</span>
          <div class="who"><b>{{ auth.user()?.name }}</b><span class="muted">Administrador</span></div>
          <button class="icon-btn" (click)="auth.logout()" title="Sair"><app-icon name="logout" [size]="18" /></button>
        </div>
      </aside>
      @if (menu()) { <div class="scrim" (click)="menu.set(false)"></div> }

      <main class="main">
        <header class="mobile-top">
          <button class="icon-btn" (click)="menu.set(true)" aria-label="Menu"><app-icon name="menu" /></button>
          <app-logo />
          <a class="icon-btn dark" routerLink="/pdv" aria-label="Abrir PDV"><app-icon name="grid" [size]="18" /></a>
        </header>
        <router-outlet />
      </main>
    </div>
  `,
  styles: `
    .shell { min-height: 100dvh; display: grid; grid-template-columns: 1fr; }
    .side { position: fixed; z-index: 60; inset: 0 auto 0 0; width: 260px; transform: translateX(-100%); transition: transform .2s;
      background: #fff; border-right: 1px solid var(--line); display: flex; flex-direction: column; padding: 24px 16px; gap: 8px; }
    .side.open { transform: none; }
    .scrim { position: fixed; inset: 0; z-index: 55; background: rgba(0,0,0,.3); }
    .brand { display: flex; align-items: center; gap: 10px; padding: 0 8px 20px; }
    .tag { font-size: 11px; padding: 3px 8px; border-radius: 999px; background: var(--bg); color: var(--muted); }
    nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    nav a { display: flex; align-items: center; gap: 12px; padding: 11px 12px; border-radius: 12px; text-decoration: none; color: var(--ink-2); font-size: 14px; }
    nav a:hover { background: var(--bg); }
    nav a.on { background: var(--brand-50); color: var(--brand); font-weight: 500; }
    .to-pos { margin: 8px 0; }
    .me { display: flex; align-items: center; gap: 10px; padding: 12px 8px 0; border-top: 1px solid var(--line); }
    .avatar { width: 38px; height: 38px; border-radius: 50%; background: var(--ink); color: #fff; display: grid; place-items: center; font-weight: 600; }
    .who { flex: 1; display: flex; flex-direction: column; font-size: 13px; min-width: 0; }
    .who b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .who span { font-size: 12px; }
    .main { min-width: 0; padding: 0 16px 32px; }
    .mobile-top { display: flex; align-items: center; justify-content: space-between; padding: calc(12px + env(safe-area-inset-top)) 0 12px; }
    @media (min-width: 1024px) {
      .shell { grid-template-columns: 260px 1fr; }
      .side { position: sticky; top: 0; height: 100dvh; transform: none; }
      .scrim, .mobile-top { display: none; }
      .main { padding: 32px 40px 48px; }
    }
  `,
})
export class AdminShell {
  protected auth = inject(AuthService);
  protected menu = signal(false);
  protected links = [
    { path: '/gestao', label: 'Visão geral', icon: 'chart' },
    { path: '/gestao/vendas', label: 'Vendas', icon: 'receipt' },
    { path: '/gestao/produtos', label: 'Produtos', icon: 'box' },
    { path: '/gestao/promocoes', label: 'Promoções', icon: 'percent' },
    { path: '/gestao/categorias', label: 'Categorias', icon: 'tag' },
    { path: '/gestao/usuarios', label: 'Usuários', icon: 'users' },
    { path: '/gestao/configuracoes', label: 'Configurações', icon: 'settings' },
  ];
}
