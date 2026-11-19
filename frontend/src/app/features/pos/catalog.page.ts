import { CurrencyPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { CartService } from '../../core/cart.service';
import { CatalogStore } from '../../core/catalog.store';
import { Product } from '../../core/models';
import { Icon } from '../../shared/icon';
import { Stepper, Thumb } from '../../shared/ui';
import { CartPanel } from './cart-panel';

const FEATURED = -1;

@Component({
  selector: 'app-catalog',
  imports: [CurrencyPipe, FormsModule, RouterLink, Icon, Stepper, Thumb, CartPanel],
  template: `
    <div class="layout">
      <section class="main">
        <header class="top">
          <div class="hello">
            <div>
              <p class="muted small">Olá, {{ firstName() }}</p>
              <h1>O que vai sair hoje?</h1>
            </div>
            <button class="icon-btn" (click)="store.load(true)" aria-label="Atualizar cardápio" [disabled]="store.loading()">
              <app-icon name="refresh" [size]="18" />
            </button>
          </div>
          <div class="search">
            <app-icon name="search" [size]="18" />
            <input class="input" type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Buscar produto..." />
          </div>
          <div class="chips">
            <button class="chip" [class.active]="cat() === null" (click)="cat.set(null)">Todos</button>
            <button class="chip" [class.active]="cat() === FEATURED" (click)="cat.set(FEATURED)">⭐ Mais pedidos</button>
            @for (c of store.categories(); track c.id) {
              <button class="chip" [class.active]="cat() === c.id" (click)="cat.set(c.id)">{{ c.icon }} {{ c.name }}</button>
            }
          </div>
        </header>

        @if (cart.target(); as t) {
          <div class="target">
            <app-icon name="tabs" [size]="18" />
            <span>Adicionando à comanda <b>#{{ t.id }}{{ t.label ? ' · ' + t.label : '' }}</b></span>
          </div>
        }

        @if (store.loading()) {
          <div class="grid">@for (i of [1,2,3,4,5,6]; track i) { <div class="skeleton sk"></div> }</div>
        } @else if (store.error()) {
          <div class="empty"><app-icon name="alert" [size]="28" /><span>{{ store.error() }}</span>
            <button class="btn outline sm" (click)="store.load(true)">Tentar de novo</button></div>
        } @else {
          <div class="grid">
            @for (p of visible(); track p.id) {
              <article class="product" [class.out]="soldOut(p)" (click)="add(p)">
                <app-thumb class="th" [src]="p.imageUrl" [icon]="p.categoryIcon" />
                @if (promoOf(p); as promo) { <span class="promo-tag">{{ promo }}</span> }
                @if (p.trackStock && p.stock <= 5) {
                  <span class="stock" [class.zero]="p.stock <= 0">{{ p.stock <= 0 ? 'Esgotado' : 'Restam ' + p.stock }}</span>
                }
                <div class="body">
                  <h3>{{ p.name }}</h3>
                  @if (p.description) { <p class="desc">{{ p.description }}</p> }
                  <div class="bottom">
                    <span class="price num">{{ p.price | currency }}</span>
                    @if (cart.qtyOf(p.id); as q) {
                      <app-stepper [value]="q" [label]="p.name" (step)="step(p, $event)" (click)="$event.stopPropagation()" />
                    } @else {
                      <button class="add-btn" [disabled]="soldOut(p)" (click)="$event.stopPropagation(); add(p)">
                        <app-icon name="plus" [size]="14" [stroke]="2.5" />Add
                      </button>
                    }
                  </div>
                </div>
              </article>
            } @empty {
              <div class="empty wide"><span class="emoji">🔎</span><span>Nenhum produto encontrado.</span></div>
            }
          </div>
        }
      </section>

      <aside class="side card"><app-cart-panel /></aside>
    </div>

    @if (!cart.isEmpty()) {
      <a class="floating" routerLink="/pdv/pedido">
        <span class="count">{{ cart.count() }}</span>
        <span>Ver pedido</span>
        <span class="num">{{ cart.total() | currency }}</span>
      </a>
    }
  `,
  styles: `
    .layout { padding: 0 16px calc(150px + env(safe-area-inset-bottom)); }
    .top { position: sticky; top: 0; z-index: 10; background: var(--bg); padding: calc(16px + env(safe-area-inset-top)) 0 12px; display: flex; flex-direction: column; gap: 12px; }
    .hello { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .hello h1 { font-size: 22px; }
    .small { font-size: 13px; }
    .target { display: flex; align-items: center; gap: 8px; padding: 12px 14px; margin-bottom: 12px; border-radius: var(--radius-sm);
      background: var(--brand-50); color: var(--brand-600); font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .sk { height: 230px; }
    .product { position: relative; background: #fff; border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow);
      display: flex; flex-direction: column; cursor: pointer; transition: transform .08s; user-select: none; }
    .product:active { transform: scale(.985); }
    .product.out { opacity: .55; }
    .th { aspect-ratio: 4 / 3; width: 100%; border-radius: 0; --thumb-emoji: 44px; }
    .stock { position: absolute; top: 10px; left: 10px; padding: 3px 9px; border-radius: 999px; background: #fff; font-size: 11px; font-weight: 500; color: var(--warn); }
    .stock.zero { color: var(--danger); }
    .promo-tag { position: absolute; top: 10px; right: 10px; padding: 3px 9px; border-radius: 999px; background: var(--brand); color: #fff; font-size: 11px; font-weight: 600; }
    .body { padding: 12px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
    h3 { font-size: 14px; line-height: 1.3; }
    .desc { font-size: 12px; color: var(--muted); line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .bottom { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: auto; padding-top: 8px; flex-wrap: wrap; }
    .price { font-weight: 600; font-size: 15px; }
    .wide { grid-column: 1 / -1; }
    .side { display: none; }
    .floating { position: fixed; z-index: 30; left: 16px; right: 16px; bottom: calc(76px + env(safe-area-inset-bottom));
      display: flex; align-items: center; gap: 12px; height: 56px; padding: 0 20px 0 10px; border-radius: 999px;
      background: var(--brand); color: #fff; text-decoration: none; font-weight: 500; box-shadow: 0 10px 30px rgba(255, 79, 31, .35); }
    .floating span:nth-child(2) { flex: 1; }
    .count { min-width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,.22); display: grid; place-items: center; font-size: 14px; }
    @media (min-width: 640px) { .grid { grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); } }
    @media (min-width: 1024px) {
      .layout { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 24px; padding: 0 24px 24px; align-items: start; }
      .top { padding-top: 24px; }
      .side { display: flex; position: sticky; top: 24px; height: calc(100dvh - 48px); padding: 20px; margin-top: 24px; }
      .side app-cart-panel { flex: 1; }
      .floating { display: none; }
    }
  `,
})
export class CatalogPage implements OnInit {
  protected store = inject(CatalogStore);
  protected cart = inject(CartService);
  private auth = inject(AuthService);
  private router = inject(Router);
  protected readonly FEATURED = FEATURED;

  protected query = signal('');
  protected cat = signal<number | null>(null);
  protected firstName = computed(() => this.auth.user()?.name.split(' ')[0] ?? '');

  protected visible = computed(() => {
    const q = normalize(this.query());
    const cat = this.cat();
    return this.store.products().filter(p =>
      (cat === null || (cat === FEATURED ? p.featured : p.categoryId === cat)) &&
      (!q || normalize(`${p.name} ${p.description ?? ''} ${p.categoryName}`).includes(q)));
  });

  ngOnInit() { this.store.load(); }

  /** Texto do selo de promoção (as regras do produto, ex.: "3 por R$ 10,00"). */
  promoOf(p: Product) {
    return this.cart.promotions().filter(x => x.productId === p.id).map(x => x.rule).join(' · ');
  }

  soldOut(p: Product) { return p.trackStock && this.cart.qtyOf(p.id) >= p.stock; }

  add(p: Product) {
    if (this.soldOut(p)) return;
    this.cart.add(p, 1);
    navigator.vibrate?.(8);
  }

  step(p: Product, delta: number) {
    if (delta > 0) this.add(p);
    else this.cart.add(p, -1);
  }
}

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
