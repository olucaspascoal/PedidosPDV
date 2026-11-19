import { CurrencyPipe } from '@angular/common';
import { Component, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, errorMessage } from '../../core/api.service';
import { CartService } from '../../core/cart.service';
import { CatalogStore } from '../../core/catalog.store';
import { ToastService } from '../../core/toast';
import { Icon } from '../../shared/icon';
import { Stepper, Thumb } from '../../shared/ui';

/** Carrinho: usado como painel fixo no desktop e como página no celular. */
@Component({
  selector: 'app-cart-panel',
  imports: [CurrencyPipe, FormsModule, Icon, Stepper, Thumb],
  template: `
    <div class="head">
      @if (cart.target(); as t) {
        <div>
          <span class="eyebrow">Adicionando à comanda</span>
          <h2>#{{ t.id }} {{ t.label ? '· ' + t.label : '' }}</h2>
        </div>
        <button class="btn ghost sm" (click)="cancelTarget()">Cancelar</button>
      } @else {
        <h2>Pedido atual</h2>
        @if (!cart.isEmpty()) { <button class="btn ghost sm" (click)="cart.clear()"><app-icon name="trash" [size]="16" />Limpar</button> }
      }
    </div>

    @if (!cart.target()) {
      <label class="field label-field">
        <span class="sr-only">Nome ou mesa</span>
        <input #labelInput class="input" [ngModel]="cart.label()" (ngModelChange)="cart.label.set($event); labelError.set(false)"
          [class.invalid]="labelError()" maxlength="60" placeholder="Nome do cliente ou mesa (opcional)" autocomplete="off" />
      </label>
      @if (labelError()) { <p class="hint-err">Informe um nome ou mesa para abrir a comanda.</p> }
    }

    <div class="lines">
      @for (l of cart.lines(); track l.key) {
        <div class="line">
          <app-thumb class="th" [src]="l.product.imageUrl" [icon]="l.product.categoryIcon" />
          <div class="info">
            <div class="name">{{ l.product.name }}</div>
            @if (editingNote() === l.key) {
              <input class="note-input" [ngModel]="l.notes" (ngModelChange)="cart.setNotes(l.key, $event)" (blur)="editingNote.set(null)"
                (keydown.enter)="editingNote.set(null)" placeholder="Ex.: sem gelo, com limão" maxlength="200" autofocus />
            } @else {
              <button class="note" (click)="editingNote.set(l.key)">
                <app-icon name="note" [size]="12" />{{ l.notes || 'Observação' }}
              </button>
            }
            <div class="price num">{{ l.product.price * l.quantity | currency }}</div>
          </div>
          <app-stepper [value]="l.quantity" [label]="l.product.name" (step)="cart.setQty(l.key, l.quantity + $event)" />
        </div>
      } @empty {
        <div class="empty">
          <span class="emoji">🍻</span>
          <span>Toque nos produtos para montar o pedido.</span>
        </div>
      }
    </div>

    <div class="foot">
      <div class="row muted"><span>Itens</span><span class="num">{{ cart.count() }}</span></div>
      @if (cart.applied().length) {
        <div class="row muted"><span>Subtotal</span><span class="num">{{ cart.subtotal() | currency }}</span></div>
        @for (a of cart.applied(); track a.productId) {
          <div class="row promo"><span><app-icon name="percent" [size]="14" />{{ a.label }}</span><span class="num">- {{ a.amount | currency }}</span></div>
        }
      }
      <div class="row total"><span>Total</span><span class="num">{{ cart.total() | currency }}</span></div>
      @if (cart.target() && cart.promotions().length) {
        <p class="muted hint">Promoções são recalculadas com os itens que já estão na comanda.</p>
      }
      @if (cart.target()) {
        <button class="btn primary lg block" [disabled]="cart.isEmpty() || busy()" (click)="addToTab()">
          <app-icon name="plus" />Adicionar à comanda
        </button>
      } @else {
        <div class="actions">
          <button class="btn outline lg" [disabled]="cart.isEmpty() || busy()" (click)="openTab()">
            <app-icon name="tabs" />Abrir comanda
          </button>
          <button class="btn primary lg" [disabled]="cart.isEmpty() || busy()" (click)="charge()">
            Cobrar
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; min-height: 0; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 40px; }
    .eyebrow { font-size: 12px; color: var(--brand); font-weight: 500; }
    .label-field { margin-top: 14px; }
    .input.invalid { border-color: var(--danger); }
    .hint-err { color: var(--danger); font-size: 12px; margin-top: 6px; }
    .lines { flex: 1; overflow: auto; margin: 12px -4px 0; padding: 0 4px; }
    .line { display: grid; grid-template-columns: 52px 1fr auto; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--line); }
    .th { width: 52px; height: 52px; border-radius: 14px; --thumb-emoji: 26px; }
    .info { min-width: 0; }
    .name { font-weight: 500; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .note { border: 0; background: none; padding: 2px 0; color: var(--muted); font-size: 12px; display: inline-flex; gap: 4px; align-items: center; cursor: pointer; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .note-input { width: 100%; border: 0; border-bottom: 1px solid var(--brand); outline: none; font-size: 12px; padding: 3px 0; }
    .price { font-weight: 600; font-size: 14px; margin-top: 2px; }
    .foot { padding-top: 14px; display: flex; flex-direction: column; gap: 8px; }
    .row { display: flex; justify-content: space-between; font-size: 14px; }
    .total { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
    .promo { color: var(--ok); font-size: 13px; }
    .promo span:first-child { display: inline-flex; align-items: center; gap: 6px; }
    .hint { font-size: 12px; margin: -4px 0 8px; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  `,
})
export class CartPanel {
  protected cart = inject(CartService);
  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private catalog = inject(CatalogStore);

  readonly compact = input(false);
  protected busy = signal(false);
  protected labelError = signal(false);
  protected editingNote = signal<string | null>(null);
  private labelInput = viewChild<ElementRef<HTMLInputElement>>('labelInput');

  cancelTarget() {
    const t = this.cart.target();
    this.cart.clear();
    if (t) this.router.navigate(['/pdv/comandas', t.id]);
  }

  async charge() {
    const order = await this.create();
    if (order) this.router.navigate(['/pdv/pagar', order.id]);
  }

  async openTab() {
    if (!this.cart.label().trim()) {
      this.labelError.set(true);
      this.labelInput()?.nativeElement.focus();
      return;
    }
    const order = await this.create();
    if (order) {
      this.toast.ok(`Comanda ${order.label} aberta`);
      this.router.navigate(['/pdv/comandas', order.id]);
    }
  }

  async addToTab() {
    const t = this.cart.target();
    if (!t || this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.addItems(t.id, this.cart.items());
      this.cart.clear();
      this.catalog.invalidate();
      this.toast.ok('Itens adicionados à comanda');
      this.router.navigate(['/pdv/comandas', t.id]);
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  private async create() {
    if (this.busy()) return null;
    this.busy.set(true);
    try {
      const order = await this.api.createOrder(this.cart.label().trim() || null, this.cart.items());
      this.cart.clear();
      this.catalog.invalidate();
      return order;
    } catch (e) {
      this.toast.error(errorMessage(e));
      return null;
    } finally {
      this.busy.set(false);
    }
  }
}
