import { Injectable, inject, signal } from '@angular/core';
import { ApiService, errorMessage } from './api.service';
import { CartService } from './cart.service';
import { Category, Product } from './models';

/** Catálogo em memória para o PDV: carrega uma vez e atualiza em segundo plano. */
@Injectable({ providedIn: 'root' })
export class CatalogStore {
  private api = inject(ApiService);
  private cart = inject(CartService);

  readonly products = signal<Product[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  private loadedAt = 0;

  async load(force = false) {
    if (this.loading()) return;
    if (!force && this.loadedAt && Date.now() - this.loadedAt < 60_000) return;
    this.loading.set(this.products().length === 0);
    this.error.set('');
    try {
      const [categories, products, promotions] = await Promise.all([
        this.api.categories(), this.api.products(), this.api.promotions().catch(() => this.cart.promotions()),
      ]);
      this.categories.set(categories);
      this.cart.promotions.set(promotions);
      this.products.set(products);
      this.cart.refresh(products);
      this.loadedAt = Date.now();
    } catch (e) {
      this.error.set(errorMessage(e, 'Não foi possível carregar o cardápio.'));
    } finally {
      this.loading.set(false);
    }
  }

  invalidate() { this.loadedAt = 0; }
}
