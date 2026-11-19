import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../../core/api.service';
import { AuthService } from '../../core/auth';
import { CartService } from '../../core/cart.service';
import { METHOD_LABEL, Order } from '../../core/models';
import { parseMoney } from '../../core/storage';
import { ToastService } from '../../core/toast';
import { Icon } from '../../shared/icon';
import { Stepper } from '../../shared/ui';

@Component({
  selector: 'app-order',
  imports: [CurrencyPipe, DatePipe, FormsModule, RouterLink, Icon, Stepper],
  template: `
    <div class="page">
      <header class="bar">
        <a class="icon-btn" routerLink="/pdv/comandas" aria-label="Voltar"><app-icon name="back" /></a>
        <span>Comanda #{{ id() }}</span>
        @if (order()?.status === 'Aberta') {
          <button class="icon-btn" (click)="editing.set(true)" aria-label="Editar nome"><app-icon name="edit" [size]="18" /></button>
        } @else { <span class="spacer"></span> }
      </header>

      @if (!order()) {
        @if (error()) { <div class="empty"><app-icon name="alert" [size]="28" /><span>{{ error() }}</span></div> }
        @else { <div class="skeleton" style="height: 320px"></div> }
      } @else {
        @let o = order()!;
        <section class="card summary">
          <div class="label-row">
            <div>
              <h1>{{ o.label || 'Sem nome' }}</h1>
              <p class="muted small">Aberta às {{ o.createdAt | date: 'HH:mm' }} por {{ o.userName }}</p>
            </div>
            <span class="badge" [class]="'badge ' + o.status">{{ o.status }}</span>
          </div>

          <div class="items">
            @for (i of o.items; track i.id) {
              <div class="item">
                <div class="info">
                  <div class="name">{{ i.productName }}</div>
                  @if (i.notes) { <div class="note muted">{{ i.notes }}</div> }
                  <div class="unit muted num">{{ i.unitPrice | currency }} cada</div>
                </div>
                @if (o.status === 'Aberta') {
                  <app-stepper [value]="i.quantity" [label]="i.productName" (step)="setQty(i.id, i.quantity + $event)" />
                } @else { <span class="qty">{{ i.quantity }}x</span> }
                <div class="total num">{{ i.total | currency }}</div>
              </div>
            }
          </div>

          <div class="totals">
            <div class="row"><span class="muted">Subtotal</span><span class="num">{{ o.subtotal | currency }}</span></div>
            @for (pr of o.promotions; track $index) {
              <div class="row promo"><span>{{ pr.description }}</span><span class="num">- {{ pr.amount | currency }}</span></div>
            }
            @if (o.discount > 0 || (o.status === 'Aberta' && auth.isAdmin())) {
              <div class="row">
                <span class="muted">Desconto</span>
                @if (o.status === 'Aberta' && auth.isAdmin()) {
                  <button class="link num" (click)="discountOpen.set(true)">- {{ o.discount | currency }} <app-icon name="edit" [size]="12" /></button>
                } @else { <span class="num">- {{ o.discount | currency }}</span> }
              </div>
            }
            @for (p of approved(o); track p.id) {
              <div class="row paid"><span>{{ methodLabel[p.method] }} pago</span><span class="num">- {{ p.amount | currency }}</span></div>
            }
            <div class="row big"><span>{{ o.status === 'Aberta' ? 'A pagar' : 'Total' }}</span>
              <span class="num">{{ (o.status === 'Aberta' ? o.remaining : o.total) | currency }}</span></div>
          </div>
        </section>

        @if (o.status === 'Aberta') {
          <div class="actions">
            <button class="btn outline lg" (click)="addItems(o)"><app-icon name="plus" />Adicionar itens</button>
            <a class="btn primary lg" [routerLink]="['/pdv/pagar', o.id]" [class.disabled]="!o.items.length">Cobrar {{ o.remaining | currency }}</a>
          </div>
          <button class="btn ghost block cancel" (click)="cancel(o)" [disabled]="busy()"><app-icon name="trash" [size]="16" />Cancelar comanda</button>
        } @else {
          <a class="btn dark lg block" routerLink="/pdv">Nova venda</a>
        }
      }
    </div>

    @if (editing() && order(); as o) {
      <div class="backdrop" (click)="editing.set(false)">
        <form class="modal" (click)="$event.stopPropagation()" (ngSubmit)="saveLabel(labelValue.value)">
          <div class="modal-head"><h2>Nome da comanda</h2></div>
          <input #labelValue class="input" [value]="o.label ?? ''" maxlength="60" placeholder="Nome do cliente ou mesa" autofocus />
          <div class="modal-foot">
            <button type="button" class="btn ghost" (click)="editing.set(false)">Cancelar</button>
            <button class="btn primary">Salvar</button>
          </div>
        </form>
      </div>
    }

    @if (discountOpen() && order(); as o) {
      <div class="backdrop" (click)="discountOpen.set(false)">
        <form class="modal" (click)="$event.stopPropagation()" (ngSubmit)="saveDiscount(discountValue.value)">
          <div class="modal-head"><h2>Desconto</h2></div>
          <label class="field">Valor do desconto (R$)
            <input #discountValue class="input" inputmode="decimal" [value]="o.discount ? o.discount.toFixed(2).replace('.', ',') : ''" placeholder="0,00" autofocus />
          </label>
          <div class="chips quick">
            @for (pct of [5, 10, 15]; track pct) {
              <button type="button" class="chip" (click)="discountValue.value = pctValue(o.subtotal - o.promoDiscount, pct)">{{ pct }}%</button>
            }
          </div>
          <div class="modal-foot">
            <button type="button" class="btn ghost" (click)="discountOpen.set(false)">Cancelar</button>
            <button class="btn primary">Aplicar</button>
          </div>
        </form>
      </div>
    }
  `,
  styles: `
    .page { max-width: 640px; margin: 0 auto; padding: calc(12px + env(safe-area-inset-top)) 16px calc(100px + env(safe-area-inset-bottom)); }
    .bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; font-weight: 500; }
    .spacer { width: 42px; }
    .summary { padding: 20px; }
    .label-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
    .small { font-size: 13px; margin-top: 2px; }
    .item { display: grid; grid-template-columns: 1fr auto 84px; gap: 12px; align-items: center; padding: 14px 0; border-bottom: 1px solid var(--line); }
    .name { font-weight: 500; font-size: 14px; }
    .note, .unit { font-size: 12px; }
    .note { color: var(--brand-600); }
    .qty { color: var(--muted); }
    .total { text-align: right; font-weight: 600; font-size: 14px; }
    .totals { padding-top: 14px; display: flex; flex-direction: column; gap: 8px; font-size: 14px; }
    .promo { color: var(--ok); }
    .row { display: flex; justify-content: space-between; align-items: center; }
    .row.paid { color: var(--ok); }
    .row.big { font-size: 20px; font-weight: 600; padding-top: 6px; }
    .link { border: 0; background: none; color: var(--brand); cursor: pointer; display: inline-flex; gap: 4px; align-items: center; font-size: 14px; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
    .actions .disabled { pointer-events: none; opacity: .45; }
    .cancel { margin-top: 8px; color: var(--danger); }
    .quick { margin-top: 12px; }
  `,
})
export class OrderPage {
  private api = inject(ApiService);
  private cart = inject(CartService);
  private router = inject(Router);
  private toast = inject(ToastService);
  protected auth = inject(AuthService);

  readonly id = input.required<string>();
  protected order = signal<Order | null>(null);
  protected error = signal('');
  protected busy = signal(false);
  protected editing = signal(false);
  protected discountOpen = signal(false);
  protected methodLabel = METHOD_LABEL;

  constructor() {
    effect(() => { this.load(Number(this.id())); });
  }

  async load(id: number) {
    try { this.order.set(await this.api.order(id)); }
    catch (e) { this.error.set(errorMessage(e)); }
  }

  approved(o: Order) { return o.payments.filter(p => p.status === 'Aprovado'); }

  async setQty(itemId: number, qty: number) {
    const o = this.order();
    if (!o) return;
    if (qty === 0 && o.items.length === 1 && !confirm('Remover o último item da comanda?')) return;
    try { this.order.set(await this.api.updateItem(o.id, itemId, qty)); }
    catch (e) { this.toast.error(errorMessage(e)); }
  }

  addItems(o: Order) {
    this.cart.startAddingTo({ id: o.id, label: o.label });
    this.router.navigateByUrl('/pdv');
  }

  async saveLabel(label: string) {
    const o = this.order()!;
    try {
      this.order.set(await this.api.updateOrder(o.id, { label: label.trim() || null, notes: o.notes }));
      this.editing.set(false);
    } catch (e) { this.toast.error(errorMessage(e)); }
  }

  pctValue(subtotal: number, pct: number) {
    return (Math.round(subtotal * pct) / 100).toFixed(2).replace('.', ',');
  }

  async saveDiscount(value: string) {
    const o = this.order()!;
    try {
      const updated = await this.api.updateOrder(o.id, { label: o.label, notes: o.notes, discount: parseMoney(value) });
      this.order.set(updated);
      this.discountOpen.set(false);
      if (updated.status === 'Paga') this.toast.ok('Venda quitada');
    } catch (e) { this.toast.error(errorMessage(e)); }
  }

  async cancel(o: Order) {
    if (!confirm(`Cancelar a comanda #${o.id}? Essa ação não pode ser desfeita.`)) return;
    this.busy.set(true);
    try {
      await this.api.cancelOrder(o.id);
      this.toast.ok('Comanda cancelada');
      this.router.navigateByUrl('/pdv/comandas');
    } catch (e) { this.toast.error(errorMessage(e)); }
    finally { this.busy.set(false); }
  }
}
