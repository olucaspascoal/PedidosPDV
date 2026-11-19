import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService, errorMessage } from '../../core/api.service';
import { METHOD_LABEL, Order, OrderStatus, OrderSummary } from '../../core/models';
import { localDate } from '../../core/storage';
import { ToastService } from '../../core/toast';
import { Icon } from '../../shared/icon';
import { DateRange, RangeFilter } from './range-filter';

@Component({
  selector: 'app-sales',
  imports: [CurrencyPipe, DatePipe, Icon, RangeFilter],
  template: `
    <header class="head">
      <div><h1>Vendas</h1><p class="muted">{{ list().length }} vendas · {{ paidTotal() | currency }} pagos</p></div>
      <div class="filters">
        <app-range-filter [value]="range()" (changed)="range.set($event); load()" />
        <div class="chips">
          @for (s of statuses; track s.label) {
            <button class="chip" [class.active]="status() === s.value" (click)="status.set(s.value); load()">{{ s.label }}</button>
          }
        </div>
      </div>
    </header>

    <section class="card">
      @if (loading()) {
        <div class="empty"><span class="spinner"></span></div>
      } @else if (error()) {
        <div class="empty"><app-icon name="alert" [size]="28" /><span>{{ error() }}</span></div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>#</th><th>Cliente / mesa</th><th>Aberta em</th><th>Atendente</th><th>Pagamento</th><th>Status</th><th class="r">Itens</th><th class="r">Total</th></tr></thead>
            <tbody>
              @for (o of list(); track o.id) {
                <tr class="click" (click)="open(o)">
                  <td class="num muted">{{ o.id }}</td>
                  <td>{{ o.label || '—' }}</td>
                  <td class="num">{{ o.createdAt | date: 'dd/MM HH:mm' }}</td>
                  <td>{{ o.userName }}</td>
                  <td>{{ methods(o) }}</td>
                  <td><span class="badge" [class]="'badge ' + o.status">{{ o.status }}</span></td>
                  <td class="r num">{{ o.itemCount }}</td>
                  <td class="r num"><b>{{ o.total | currency }}</b></td>
                </tr>
              } @empty {
                <tr><td colspan="8"><div class="empty">Nenhuma venda no período.</div></td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>

    @if (selected(); as o) {
      <div class="backdrop drawer-backdrop" (click)="selected.set(null)">
        <aside class="drawer" (click)="$event.stopPropagation()">
          <div class="d-head">
            <div><h2>Venda #{{ o.id }}</h2><p class="muted small">{{ o.label || 'Sem nome' }} · {{ o.userName }}</p></div>
            <button class="icon-btn" (click)="selected.set(null)" aria-label="Fechar"><app-icon name="x" /></button>
          </div>
          <div class="meta">
            <span class="badge" [class]="'badge ' + o.status">{{ o.status }}</span>
            <span class="muted small">Aberta {{ o.createdAt | date: 'dd/MM/yyyy HH:mm' }}@if (o.closedAt) { · fechada {{ o.closedAt | date: 'HH:mm' }} }</span>
          </div>
          <h3 class="sec">Itens</h3>
          @for (i of o.items; track i.id) {
            <div class="line"><span>{{ i.quantity }}x {{ i.productName }}@if (i.notes) { <small class="muted"> · {{ i.notes }}</small> }</span><span class="num">{{ i.total | currency }}</span></div>
          }
          <div class="line"><span class="muted">Subtotal</span><span class="num">{{ o.subtotal | currency }}</span></div>
          @if (o.discount) { <div class="line"><span class="muted">Desconto</span><span class="num">- {{ o.discount | currency }}</span></div> }
          <div class="line big"><span>Total</span><span class="num">{{ o.total | currency }}</span></div>

          <h3 class="sec">Pagamentos</h3>
          @for (p of o.payments; track p.id) {
            <div class="line">
              <span>{{ methodLabel[p.method] }} <span class="badge" [class]="'badge ' + p.status">{{ p.status }}</span>
                <br /><small class="muted">{{ p.createdAt | date: 'dd/MM HH:mm' }}@if (p.change) { · troco {{ p.change | currency }} }</small></span>
              <span class="num">{{ p.amount | currency }}</span>
            </div>
          } @empty { <p class="muted small">Nenhum pagamento.</p> }

          @if (o.status === 'Aberta') {
            <button class="btn danger block cancel" (click)="cancel(o)">Cancelar venda</button>
          }
        </aside>
      </div>
    }
  `,
  styles: `
    .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
    .head p { font-size: 14px; margin-top: 4px; }
    .filters { display: flex; flex-direction: column; gap: 10px; align-items: flex-end; }
    @media (max-width: 1023px) { .filters { align-items: flex-start; } }
    .small { font-size: 13px; }
    .d-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .meta { display: flex; gap: 10px; align-items: center; margin: 14px 0 6px; flex-wrap: wrap; }
    .sec { margin: 22px 0 6px; font-size: 14px; color: var(--muted); }
    .line { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
    .line.big { font-weight: 600; font-size: 17px; border: 0; }
    .cancel { margin-top: 24px; }
  `,
})
export class SalesPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  protected list = signal<OrderSummary[]>([]);
  protected loading = signal(true);
  protected error = signal('');
  protected range = signal<DateRange>({ from: localDate(), to: localDate() });
  protected status = signal<OrderStatus | undefined>(undefined);
  protected selected = signal<Order | null>(null);
  protected methodLabel = METHOD_LABEL;
  protected statuses: { label: string; value: OrderStatus | undefined }[] = [
    { label: 'Todas', value: undefined }, { label: 'Pagas', value: 'Paga' },
    { label: 'Abertas', value: 'Aberta' }, { label: 'Canceladas', value: 'Cancelada' },
  ];
  protected paidTotal = computed(() => this.list().filter(o => o.status === 'Paga').reduce((s, o) => s + o.total, 0));

  ngOnInit() { this.load(); }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const { from, to } = this.range();
      this.list.set(await this.api.orders({ from, to, status: this.status(), take: 1000 }));
    } catch (e) { this.error.set(errorMessage(e)); }
    finally { this.loading.set(false); }
  }

  methods(o: OrderSummary) { return o.methods.map(m => METHOD_LABEL[m]).join(' + ') || '—'; }

  async open(o: OrderSummary) {
    try { this.selected.set(await this.api.order(o.id)); }
    catch (e) { this.toast.error(errorMessage(e)); }
  }

  async cancel(o: Order) {
    if (!confirm(`Cancelar a venda #${o.id}?`)) return;
    try {
      this.selected.set(await this.api.cancelOrder(o.id));
      this.toast.ok('Venda cancelada');
      this.load();
    } catch (e) { this.toast.error(errorMessage(e)); }
  }
}
