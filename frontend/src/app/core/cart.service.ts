import { Injectable, computed, effect, signal } from '@angular/core';
import { OrderItemInput, Product, Promotion } from './models';
import { bestPromo } from './promotions';
import { storage } from './storage';

export interface CartLine { key: string; product: Product; quantity: number; notes: string; }
export interface CartTarget { id: number; label: string | null; }

const KEY = 'pdv.cart';
interface Saved { lines: CartLine[]; label: string; target: CartTarget | null; }

/** Pedido em montagem no PDV. Pode ser uma venda nova ou itens para uma comanda já aberta. */
@Injectable({ providedIn: 'root' })
export class CartService {
  private saved = storage.get<Saved>(KEY);

  readonly lines = signal<CartLine[]>(this.saved?.lines ?? []);
  readonly label = signal(this.saved?.label ?? '');
  readonly target = signal<CartTarget | null>(this.saved?.target ?? null);

  /** Promoções válidas hoje (carregadas com o cardápio). */
  readonly promotions = signal<Promotion[]>([]);

  readonly count = computed(() => this.lines().reduce((s, l) => s + l.quantity, 0));
  readonly subtotal = computed(() => this.lines().reduce((s, l) => s + l.quantity * l.product.price, 0));
  /** Prévia das promoções: por produto, somando as linhas (com e sem observação). */
  readonly applied = computed(() => {
    const byProduct = new Map<number, { product: Product; quantity: number }>();
    for (const l of this.lines()) {
      const cur = byProduct.get(l.product.id);
      byProduct.set(l.product.id, { product: l.product, quantity: (cur?.quantity ?? 0) + l.quantity });
    }
    const list: { productId: number; label: string; amount: number }[] = [];
    for (const { product, quantity } of byProduct.values()) {
      const best = bestPromo(this.promotions(), product.id, quantity, product.price);
      if (best) list.push({ productId: product.id, label: `${product.name}: ${best.promo.rule}`, amount: best.amount });
    }
    return list;
  });
  readonly promoTotal = computed(() => this.applied().reduce((s, a) => s + a.amount, 0));
  readonly total = computed(() => Math.max(0, this.subtotal() - this.promoTotal()));
  readonly isEmpty = computed(() => this.lines().length === 0);

  constructor() {
    effect(() => storage.set(KEY, { lines: this.lines(), label: this.label(), target: this.target() }));
  }

  qtyOf(productId: number) {
    return this.lines().filter(l => l.product.id === productId).reduce((s, l) => s + l.quantity, 0);
  }

  /** Soma (ou subtrai) na linha sem observação daquele produto. */
  add(product: Product, delta = 1) {
    this.lines.update(lines => {
      const key = `${product.id}:`;
      const line = lines.find(l => l.key === key) ?? lines.find(l => l.product.id === product.id);
      if (!line) return delta > 0 ? [...lines, { key, product, quantity: delta, notes: '' }] : lines;
      const quantity = line.quantity + delta;
      return quantity <= 0 ? lines.filter(l => l !== line) : lines.map(l => (l === line ? { ...l, quantity, product } : l));
    });
  }

  setQty(key: string, quantity: number) {
    this.lines.update(lines =>
      quantity <= 0 ? lines.filter(l => l.key !== key) : lines.map(l => (l.key === key ? { ...l, quantity } : l)));
  }

  setNotes(key: string, notes: string) {
    this.lines.update(lines => lines.map(l => (l.key === key ? { ...l, notes, key: `${l.product.id}:${notes.trim()}` } : l)));
  }

  /** Atualiza preço/nome com o catálogo atual e remove itens que saíram de linha. */
  refresh(products: Product[]) {
    const byId = new Map(products.map(p => [p.id, p]));
    this.lines.update(lines => lines.filter(l => byId.has(l.product.id)).map(l => ({ ...l, product: byId.get(l.product.id)! })));
  }

  startAddingTo(target: CartTarget) {
    this.clear();
    this.target.set(target);
  }

  items(): OrderItemInput[] {
    return this.lines().map(l => ({ productId: l.product.id, quantity: l.quantity, notes: l.notes.trim() || null }));
  }

  clear() {
    this.lines.set([]);
    this.label.set('');
    this.target.set(null);
  }
}
