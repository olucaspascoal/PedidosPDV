import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../../core/api.service';
import { Dashboard, METHOD_ICON, METHOD_LABEL, SeriesPoint } from '../../core/models';
import { localDate, money } from '../../core/storage';
import { Icon } from '../../shared/icon';
import { DateRange, RangeFilter } from './range-filter';

@Component({
  selector: 'app-dashboard',
  imports: [CurrencyPipe, DatePipe, RouterLink, Icon, RangeFilter],
  template: `
    <header class="head">
      <div><h1>Visão geral</h1><p class="muted">{{ rangeLabel() }}</p></div>
      <app-range-filter [value]="range()" (changed)="setRange($event)" />
    </header>

    @if (error()) {
      <div class="card empty"><app-icon name="alert" [size]="28" /><span>{{ error() }}</span>
        <button class="btn outline sm" (click)="load()">Tentar de novo</button></div>
    } @else if (!data()) {
      <div class="kpis">@for (i of [1,2,3,4]; track i) { <div class="skeleton" style="height:120px"></div> }</div>
    } @else {
      @let d = data()!;
      <section class="kpis">
        <div class="kpi hero">
          <span>Faturamento</span>
          <strong class="num">{{ d.revenue | currency }}</strong>
          <small>{{ d.orderCount }} vendas pagas</small>
        </div>
        <div class="kpi card"><span>Ticket médio</span><strong class="num">{{ d.averageTicket | currency }}</strong><small class="muted">por venda</small></div>
        <div class="kpi card"><span>Itens vendidos</span><strong class="num">{{ d.itemsSold }}</strong><small class="muted">{{ d.canceledOrders }} vendas canceladas</small></div>
        <a class="kpi card link" routerLink="/pdv/comandas"><span>Comandas abertas</span><strong class="num">{{ d.openOrders }}</strong>
          <small class="muted">{{ d.openOrdersValue | currency }} a receber</small></a>
      </section>

      <section class="row-2">
        <div class="card panel">
          <div class="p-head"><h2>{{ series().title }}</h2><span class="muted small">Faturamento</span></div>
          @if (series().max === 0) {
            <div class="empty">Sem vendas no período.</div>
          } @else {
            <div class="bars" role="img" [attr.aria-label]="series().aria">
              @for (p of series().points; track p.label) {
                <div class="bar-col" [title]="p.label + ': ' + fmt(p.amount) + ' (' + p.count + ' vendas)'">
                  <div class="tip">{{ p.amount | currency: 'BRL' : 'symbol' : '1.0-0' }}<br /><span>{{ p.count }} vendas</span></div>
                  <div class="track"><div class="fill" [style.height.%]="p.amount / series().max * 100"></div></div>
                  <span class="x">{{ p.label }}</span>
                </div>
              }
            </div>
          }
        </div>

        <div class="card panel">
          <div class="p-head"><h2>Formas de pagamento</h2></div>
          <div class="methods">
            @for (m of d.byMethod; track m.method) {
              <div class="method">
                <div class="m-top">
                  <span class="m-name"><app-icon [name]="methodIcon[m.method]" [size]="16" />{{ methodLabel[m.method] }}</span>
                  <span class="num"><b>{{ m.amount | currency }}</b> <span class="muted">· {{ pct(m.amount) }}%</span></span>
                </div>
                <div class="hbar"><div [style.width.%]="pct(m.amount)"></div></div>
              </div>
            }
          </div>
        </div>
      </section>

      <section class="row-3">
        <div class="card panel">
          <div class="p-head"><h2>Mais vendidos</h2></div>
          @for (t of d.topProducts; track t.productId; let i = $index) {
            <div class="top-item">
              <span class="rank">{{ i + 1 }}</span>
              <span class="t-name">{{ t.name }}</span>
              <span class="num muted">{{ t.quantity }} un</span>
              <span class="num t-rev">{{ t.revenue | currency }}</span>
            </div>
          } @empty { <div class="empty">Nada vendido ainda.</div> }
        </div>

        <div class="card panel">
          <div class="p-head"><h2>Estoque baixo</h2><a class="small link-a" routerLink="/gestao/produtos">Produtos</a></div>
          @for (s of d.lowStock; track s.id) {
            <div class="top-item">
              <span class="t-name">{{ s.name }}</span>
              <span class="badge plain" [class.Cancelada]="s.stock <= 0" [class.Pendente]="s.stock > 0">{{ s.stock <= 0 ? 'Esgotado' : s.stock + ' un' }}</span>
            </div>
          } @empty { <div class="empty">Estoque em dia. 👍</div> }
        </div>

        <div class="card panel">
          <div class="p-head"><h2>Últimas vendas</h2><a class="small link-a" routerLink="/gestao/vendas">Ver todas</a></div>
          @for (o of d.recent; track o.id) {
            <div class="top-item">
              <span class="t-name">#{{ o.id }} {{ o.label || '' }}<br /><small class="muted">{{ o.closedAt | date: 'dd/MM HH:mm' }} · {{ o.userName }}</small></span>
              <span class="num t-rev">{{ o.total | currency }}</span>
            </div>
          } @empty { <div class="empty">Sem vendas no período.</div> }
        </div>
      </section>
    }
  `,
  styles: `
    .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
    .head p { font-size: 14px; margin-top: 4px; }
    .small { font-size: 13px; }
    .kpis { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    @media (min-width: 1100px) { .kpis { grid-template-columns: repeat(4, 1fr); } }
    .kpi { padding: 20px; display: flex; flex-direction: column; gap: 4px; border-radius: var(--radius); text-decoration: none; }
    .kpi span { font-size: 13px; color: var(--muted); }
    .kpi strong { font-size: 28px; font-weight: 500; letter-spacing: -0.02em; }
    .kpi small { font-size: 12px; }
    .kpi.hero { background: var(--brand); color: #fff; }
    .kpi.hero span, .kpi.hero small { color: rgba(255,255,255,.85); }
    .kpi.link:hover { box-shadow: inset 0 0 0 1.5px var(--brand), var(--shadow); }
    .row-2 { display: grid; gap: 12px; margin-top: 12px; }
    .row-3 { display: grid; gap: 12px; margin-top: 12px; }
    @media (min-width: 1100px) { .row-2 { grid-template-columns: 1.7fr 1fr; } .row-3 { grid-template-columns: repeat(3, 1fr); } }
    .panel { padding: 20px; min-width: 0; }
    .p-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; }
    .link-a { color: var(--brand); text-decoration: none; }
    .bars { display: flex; align-items: flex-end; gap: 4px; height: 220px; overflow-x: auto; padding-top: 8px; }
    .bar-col { flex: 1 0 18px; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; position: relative; }
    .track { flex: 1; width: 100%; max-width: 26px; display: flex; align-items: flex-end; border-radius: 6px; background: var(--bg); }
    .fill { width: 100%; background: var(--brand); border-radius: 4px 4px 2px 2px; min-height: 0; transition: height .3s; }
    .bar-col:hover .fill { background: var(--brand-600); }
    .x { font-size: 10px; color: var(--muted); white-space: nowrap; }
    .tip { display: none; position: absolute; bottom: calc(100% - 20px); z-index: 2; background: var(--ink); color: #fff; font-size: 12px;
      padding: 6px 9px; border-radius: 8px; white-space: nowrap; text-align: center; pointer-events: none; }
    .tip span { color: rgba(255,255,255,.7); font-size: 11px; }
    .bar-col:hover .tip { display: block; }
    .methods { display: flex; flex-direction: column; gap: 16px; }
    .m-top { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 6px; gap: 8px; }
    .m-name { display: inline-flex; gap: 8px; align-items: center; }
    .m-top b { font-weight: 500; }
    .hbar { height: 10px; border-radius: 999px; background: var(--bg); overflow: hidden; }
    .hbar div { height: 100%; background: var(--brand); border-radius: 999px; }
    .top-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
    .top-item:last-child { border-bottom: 0; }
    .rank { width: 24px; height: 24px; border-radius: 50%; background: var(--bg); display: grid; place-items: center; font-size: 12px; font-weight: 600; flex: none; }
    .t-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
    .t-rev { font-weight: 500; }
    .empty { padding: 32px 0; }
  `,
})
export class DashboardPage implements OnInit {
  private api = inject(ApiService);
  protected data = signal<Dashboard | null>(null);
  protected error = signal('');
  protected range = signal<DateRange>({ from: localDate(), to: localDate() });
  protected methodLabel = METHOD_LABEL;
  protected methodIcon = METHOD_ICON;

  protected rangeLabel = computed(() => {
    const { from, to } = this.range();
    const f = (s: string) => s.split('-').reverse().join('/');
    return from === to ? (from === localDate() ? `Hoje, ${f(from)}` : f(from)) : `${f(from)} a ${f(to)}`;
  });

  /** Um dia: barras por hora (só o horário de funcionamento). Vários dias: barras por dia. */
  protected series = computed(() => {
    const d = this.data();
    if (!d) return { title: '', points: [] as SeriesPoint[], max: 0, aria: '' };
    let points: SeriesPoint[];
    let title: string;
    if (d.from === d.to) {
      const active = d.byHour.map((p, i) => (p.count ? i : -1)).filter(i => i >= 0);
      const first = active.length ? Math.min(active[0], 16) : 16;
      const last = active.length ? Math.max(active[active.length - 1], 23) : 23;
      points = d.byHour.slice(first, last + 1);
      title = 'Vendas por hora';
    } else {
      points = d.byDay;
      title = 'Vendas por dia';
    }
    const max = Math.max(0, ...points.map(p => p.amount));
    const aria = `${title}: ` + points.filter(p => p.amount).map(p => `${p.label} ${money(p.amount)}`).join(', ');
    return { title, points, max, aria };
  });

  ngOnInit() { this.load(); }

  setRange(r: DateRange) { this.range.set(r); this.load(); }

  async load() {
    this.error.set('');
    try {
      const { from, to } = this.range();
      this.data.set(await this.api.dashboard(from, to));
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  pct(v: number) {
    const total = this.data()?.byMethod.reduce((s, m) => s + m.amount, 0) ?? 0;
    return total ? Math.round((v / total) * 100) : 0;
  }
  fmt(v: number) { return money(v); }
}
