import { CurrencyPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../../core/api.service';
import { OrderSummary } from '../../core/models';
import { sinceLabel } from '../../core/storage';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-tabs',
  imports: [CurrencyPipe, FormsModule, RouterLink, Icon],
  template: `
    <div class="page">
      <header class="top">
        <div class="title">
          <div>
            <h1>Comandas abertas</h1>
            <p class="muted small">{{ orders().length }} abertas · {{ openTotal() | currency }} a receber</p>
          </div>
          <button class="icon-btn" (click)="load()" aria-label="Atualizar"><app-icon name="refresh" [size]="18" /></button>
        </div>
        <div class="search">
          <app-icon name="search" [size]="18" />
          <input class="input" type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Buscar por nome, mesa ou número" />
        </div>
      </header>

      @if (loading() && !orders().length) {
        <div class="list">@for (i of [1,2,3]; track i) { <div class="skeleton sk"></div> }</div>
      } @else if (error()) {
        <div class="empty"><app-icon name="alert" [size]="28" /><span>{{ error() }}</span></div>
      } @else {
        <div class="list">
          @for (o of filtered(); track o.id) {
            <a class="tab card" [routerLink]="['/pdv/comandas', o.id]">
              <div class="tag">{{ initial(o) }}</div>
              <div class="info">
                <div class="name">{{ o.label || 'Sem nome' }} <span class="muted">#{{ o.id }}</span></div>
                <div class="meta muted"><app-icon name="clock" [size]="13" /> {{ since(o.createdAt) }} · {{ o.itemCount }} itens · {{ o.userName }}</div>
              </div>
              <div class="amount">
                <div class="num total">{{ o.total - o.paid | currency }}</div>
                @if (o.paid > 0) { <div class="paid num">{{ o.paid | currency }} pago</div> }
              </div>
            </a>
          } @empty {
            <div class="empty">
              <span class="emoji">🧾</span>
              <span>Nenhuma comanda aberta.</span>
              <a class="btn primary sm" routerLink="/pdv">Começar uma venda</a>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .page { padding: 0 16px calc(96px + env(safe-area-inset-bottom)); max-width: 900px; margin: 0 auto; }
    .top { position: sticky; top: 0; z-index: 5; background: var(--bg); padding: calc(16px + env(safe-area-inset-top)) 0 12px; display: flex; flex-direction: column; gap: 12px; }
    .title { display: flex; justify-content: space-between; align-items: center; }
    .title h1 { font-size: 22px; }
    .small { font-size: 13px; margin-top: 2px; }
    .list { display: grid; gap: 10px; }
    @media (min-width: 760px) { .list { grid-template-columns: 1fr 1fr; } .page { padding-top: 8px; } }
    .sk { height: 78px; }
    .tab { display: grid; grid-template-columns: 46px 1fr auto; gap: 12px; align-items: center; padding: 14px; text-decoration: none; }
    .tag { width: 46px; height: 46px; border-radius: 14px; background: var(--brand-50); color: var(--brand); display: grid; place-items: center; font-weight: 600; font-size: 18px; }
    .info { min-width: 0; }
    .name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta { font-size: 12px; display: flex; align-items: center; gap: 4px; margin-top: 2px; }
    .amount { text-align: right; }
    .total { font-weight: 600; }
    .paid { font-size: 11px; color: var(--ok); }
  `,
})
export class TabsPage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  protected orders = signal<OrderSummary[]>([]);
  protected loading = signal(true);
  protected error = signal('');
  protected query = signal('');
  private now = signal(Date.now());
  private timer?: ReturnType<typeof setInterval>;

  protected filtered = computed(() => {
    const q = this.query().trim().toLowerCase().replace('#', '');
    return this.orders().filter(o => !q || (o.label ?? '').toLowerCase().includes(q) || String(o.id) === q);
  });
  protected openTotal = computed(() => this.orders().reduce((s, o) => s + o.total - o.paid, 0));

  ngOnInit() {
    this.load();
    this.timer = setInterval(() => { this.now.set(Date.now()); this.load(true); }, 20_000);
  }
  ngOnDestroy() { clearInterval(this.timer); }

  async load(silent = false) {
    if (!silent) this.loading.set(true);
    try {
      this.orders.set(await this.api.orders({ status: 'Aberta' }));
      this.error.set('');
    } catch (e) {
      if (!silent) this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  initial(o: OrderSummary) { return (o.label?.trim()[0] ?? '#').toUpperCase(); }
  since(iso: string) { return sinceLabel(iso, this.now()); }
}
