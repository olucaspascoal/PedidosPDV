import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth';
import { LoginUser } from '../../core/models';
import { Icon } from '../../shared/icon';
import { Logo } from '../../shared/ui';

@Component({
  selector: 'app-login',
  imports: [Icon, Logo],
  template: `
    <main class="wrap">
      <section class="hero">
        <app-logo />
        <h1>Vendas rápidas no balcão,<br /><span>gestão completa no computador.</span></h1>
        <p class="muted">Pix com QR Code do Mercado Pago, comandas abertas e caixa em um só lugar.</p>
      </section>

      <app-logo class="mobile-logo" />
      <section class="panel card">
        @if (!selected()) {
          <h2>Quem está no caixa?</h2>
          <p class="muted sub">Toque no seu nome para entrar com o PIN.</p>
          @if (loading()) {
            <div class="users">@for (i of [1, 2]; track i) { <div class="skeleton user-sk"></div> }</div>
          } @else if (loadError()) {
            <div class="empty"><app-icon name="alert" [size]="28" /><span>{{ loadError() }}</span>
              <button class="btn outline sm" (click)="load()">Tentar de novo</button></div>
          } @else {
            <div class="users">
              @for (u of users(); track u.id) {
                <button class="user" (click)="choose(u)">
                  <span class="avatar">{{ initials(u.name) }}</span>
                  <span class="uname">{{ u.name }}</span>
                  <span class="role">{{ u.role === 'Admin' ? 'Administrador' : 'Atendente' }}</span>
                </button>
              }
            </div>
          }
        } @else {
          <button class="icon-btn back" (click)="reset()" aria-label="Trocar usuário"><app-icon name="back" /></button>
          <div class="who">
            <span class="avatar lg">{{ initials(selected()!.name) }}</span>
            <h2>{{ selected()!.name }}</h2>
            <p class="muted">Digite seu PIN para continuar</p>
          </div>

          <div class="dots" [class.shake]="error()" aria-live="polite">
            @for (i of dotSlots(); track $index) { <span [class.on]="i"></span> }
          </div>
          <p class="err">{{ error() }}</p>

          <div class="pad">
            @for (k of keys; track k) {
              <button class="key" (click)="press(k)" [disabled]="busy()">{{ k }}</button>
            }
            <button class="key soft" (click)="pin.set('')" [disabled]="busy()">Limpar</button>
            <button class="key" (click)="press('0')" [disabled]="busy()">0</button>
            <button class="key soft" (click)="backspace()" [disabled]="busy()" aria-label="Apagar"><app-icon name="backspace" /></button>
          </div>

          <button class="btn primary lg block" (click)="submit()" [disabled]="pin().length < 4 || busy()">
            @if (busy()) { <span class="spinner light"></span> } @else { Entrar }
          </button>
        }
      </section>
    </main>
  `,
  styles: `
    .wrap { min-height: 100dvh; display: grid; gap: 24px; padding: 24px 16px; align-content: center; justify-items: center;
      background: radial-gradient(1200px 600px at 0% 0%, var(--brand-50), transparent 60%), var(--bg); }
    .hero { max-width: 440px; display: none; }
    .hero h1 { margin: 28px 0 12px; font-size: 40px; line-height: 1.15; font-weight: 400; }
    .hero h1 span { color: var(--muted); }
    @media (min-width: 960px) {
      .wrap { grid-template-columns: 1fr 440px; gap: 80px; padding: 48px; max-width: 1100px; margin: 0 auto; }
      .hero { display: block; }
      .mobile-logo { display: none; }
    }
    .panel { width: 100%; max-width: 440px; padding: 28px 24px; position: relative; }
    .sub { margin: 6px 0 20px; font-size: 14px; }
    .users { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
    .user-sk { height: 132px; }
    .user { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 20px 12px; border: 0; border-radius: var(--radius);
      background: var(--bg); cursor: pointer; transition: background .15s, transform .08s; }
    .user:hover { background: var(--brand-50); }
    .user:active { transform: scale(.98); }
    .avatar { width: 52px; height: 52px; border-radius: 50%; background: var(--ink); color: #fff; display: grid; place-items: center; font-weight: 600; }
    .avatar.lg { width: 64px; height: 64px; font-size: 20px; background: var(--brand); }
    .uname { font-weight: 500; margin-top: 4px; }
    .role { font-size: 12px; color: var(--muted); }
    .back { position: absolute; top: 20px; left: 20px; }
    .who { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
    .who .muted { font-size: 13px; }
    .dots { display: flex; justify-content: center; gap: 12px; margin: 22px 0 4px; min-height: 16px; }
    .dots span { width: 14px; height: 14px; border-radius: 50%; background: var(--line); transition: background .1s; }
    .dots span.on { background: var(--ink); }
    .shake { animation: shake .3s; }
    @keyframes shake { 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
    .err { text-align: center; color: var(--danger); font-size: 13px; min-height: 20px; margin-bottom: 8px; }
    .pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
    .key { height: 58px; border-radius: 16px; border: 0; background: var(--bg); font-size: 22px; font-weight: 500; cursor: pointer;
      display: grid; place-items: center; transition: background .1s; }
    .key:active { background: var(--brand-100); }
    .key.soft { font-size: 13px; color: var(--muted); }
    .spinner.light { border-color: rgba(255,255,255,.35); border-top-color: #fff; }
  `,
})
export class LoginPage implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);

  protected users = signal<LoginUser[]>([]);
  protected loading = signal(true);
  protected loadError = signal('');
  protected selected = signal<LoginUser | null>(null);
  protected pin = signal('');
  protected error = signal('');
  protected busy = signal(false);
  protected keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  protected dotSlots = computed(() => {
    const n = this.pin().length;
    return Array.from({ length: Math.max(4, n) }, (_, i) => i < n);
  });

  ngOnInit() { this.load(); }

  async load() {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const users = await this.api.loginUsers();
      this.users.set(users);
      if (users.length === 1) this.choose(users[0]);
    } catch (e) {
      this.loadError.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  initials(name: string) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }

  choose(u: LoginUser) { this.selected.set(u); this.pin.set(''); this.error.set(''); }
  reset() { this.selected.set(null); this.pin.set(''); this.error.set(''); }

  press(d: string) {
    if (this.pin().length >= 8) return;
    this.error.set('');
    this.pin.update(p => p + d);
  }
  backspace() { this.pin.update(p => p.slice(0, -1)); }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (!this.selected() || this.busy()) return;
    const handled = /^\d$/.test(e.key) || ['Backspace', 'Enter', 'Escape'].includes(e.key);
    if (!handled) return;
    // Evita que Enter/Espaço também "clique" no botão do teclado numérico que estiver com foco.
    e.preventDefault();
    if (/^\d$/.test(e.key)) this.press(e.key);
    else if (e.key === 'Backspace') this.backspace();
    else if (e.key === 'Enter') this.submit();
    else this.reset();
  }

  async submit() {
    const user = this.selected();
    if (!user || this.pin().length < 4 || this.busy()) return;
    this.busy.set(true);
    try {
      const res = await this.api.login(user.id, this.pin());
      this.auth.setSession(res.token, res.user);
      this.router.navigateByUrl(this.auth.homeUrl());
    } catch (e) {
      this.error.set(errorMessage(e));
      this.pin.set('');
    } finally {
      this.busy.set(false);
    }
  }
}
