import { CurrencyPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorMessage } from '../../core/api.service';
import { CatalogStore } from '../../core/catalog.store';
import { Category, Product } from '../../core/models';
import { parseMoney } from '../../core/storage';
import { ToastService } from '../../core/toast';
import { Icon } from '../../shared/icon';
import { Thumb } from '../../shared/ui';

interface Form {
  id?: number; name: string; description: string; price: string; categoryId: number | null; imageUrl: string;
  trackStock: boolean; stock: number; featured: boolean; active: boolean;
}

@Component({
  selector: 'app-products',
  imports: [CurrencyPipe, FormsModule, Icon, Thumb],
  template: `
    <header class="head">
      <div><h1>Produtos</h1><p class="muted">{{ products().length }} cadastrados · {{ activeCount() }} à venda</p></div>
      <button class="btn primary" (click)="edit()"><app-icon name="plus" [size]="18" />Novo produto</button>
    </header>

    <div class="toolbar">
      <div class="search grow">
        <app-icon name="search" [size]="18" />
        <input class="input" type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Buscar produto" />
      </div>
      <div class="chips">
        <button class="chip" [class.active]="cat() === null" (click)="cat.set(null)">Todas</button>
        @for (c of categories(); track c.id) {
          <button class="chip" [class.active]="cat() === c.id" (click)="cat.set(c.id)">{{ c.icon }} {{ c.name }}</button>
        }
      </div>
    </div>

    <section class="card">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Produto</th><th>Categoria</th><th class="r">Preço</th><th class="r">Estoque</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (p of filtered(); track p.id) {
              <tr class="click" (click)="edit(p)">
                <td>
                  <div class="prod">
                    <app-thumb class="th" [src]="p.imageUrl" [icon]="p.categoryIcon" />
                    <div><b>{{ p.name }}</b>@if (p.featured) { <span class="star">⭐</span> }<br /><small class="muted">{{ p.description }}</small></div>
                  </div>
                </td>
                <td>{{ p.categoryIcon }} {{ p.categoryName }}</td>
                <td class="r num">{{ p.price | currency }}</td>
                <td class="r num">
                  @if (p.trackStock) { <span [class.low]="p.stock <= 10">{{ p.stock }}</span> } @else { <span class="muted">—</span> }
                </td>
                <td><span class="badge" [class.Paga]="p.active" [class.Cancelada]="!p.active">{{ p.active ? 'À venda' : 'Inativo' }}</span></td>
                <td class="r"><button class="icon-btn" (click)="$event.stopPropagation(); edit(p)" aria-label="Editar"><app-icon name="edit" [size]="16" /></button></td>
              </tr>
            } @empty {
              <tr><td colspan="6"><div class="empty">{{ loading() ? 'Carregando...' : 'Nenhum produto.' }}</div></td></tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    @if (form(); as f) {
      <div class="backdrop" (click)="form.set(null)">
        <form class="modal wide" (click)="$event.stopPropagation()" (ngSubmit)="save()">
          <div class="modal-head">
            <h2>{{ f.id ? 'Editar produto' : 'Novo produto' }}</h2>
            <button type="button" class="icon-btn" (click)="form.set(null)" aria-label="Fechar"><app-icon name="x" /></button>
          </div>
          <div class="grid-form">
            <label class="field full">Nome
              <input class="input" name="name" [(ngModel)]="f.name" required maxlength="120" autofocus />
            </label>
            <label class="field full">Descrição
              <input class="input" name="description" [(ngModel)]="f.description" maxlength="300" placeholder="Ex.: 330 ml" />
            </label>
            <label class="field">Preço (R$)
              <input class="input" name="price" [(ngModel)]="f.price" inputmode="decimal" placeholder="0,00" required />
            </label>
            <label class="field">Categoria
              <select class="select" name="categoryId" [(ngModel)]="f.categoryId" required>
                @for (c of categories(); track c.id) { <option [ngValue]="c.id">{{ c.icon }} {{ c.name }}</option> }
              </select>
            </label>
            <label class="field full">Imagem (link, opcional)
              <input class="input" name="imageUrl" [(ngModel)]="f.imageUrl" type="url" placeholder="https://..." />
            </label>
            <div class="full toggles">
              <label class="switch"><input type="checkbox" name="trackStock" [(ngModel)]="f.trackStock" />Controlar estoque</label>
              @if (f.trackStock) {
                <label class="field stock">Quantidade
                  <input class="input" name="stock" type="number" [(ngModel)]="f.stock" />
                </label>
              }
            </div>
            <div class="full toggles">
              <label class="switch"><input type="checkbox" name="featured" [(ngModel)]="f.featured" />Destaque (mais pedidos)</label>
              <label class="switch"><input type="checkbox" name="active" [(ngModel)]="f.active" />À venda</label>
            </div>
          </div>
          <div class="modal-foot">
            @if (f.id) { <button type="button" class="btn danger" (click)="remove(f)" [disabled]="busy()"><app-icon name="trash" [size]="16" />Excluir</button> }
            <span class="grow"></span>
            <button type="button" class="btn ghost" (click)="form.set(null)">Cancelar</button>
            <button class="btn primary" [disabled]="busy()">Salvar</button>
          </div>
        </form>
      </div>
    }
  `,
  styles: `
    .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
    .head p { font-size: 14px; margin-top: 4px; }
    .toolbar { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
    .search .input { background: #fff; border-color: var(--line); }
    .prod { display: flex; align-items: center; gap: 12px; }
    .th { width: 44px; height: 44px; border-radius: 12px; --thumb-emoji: 22px; flex: none; }
    .star { font-size: 11px; margin-left: 4px; }
    .low { color: var(--warn); font-weight: 600; }
    .modal.wide { max-width: 600px; }
    .toggles { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; min-height: 46px; }
    .stock { flex-direction: row; align-items: center; gap: 10px; }
    .stock .input { width: 110px; }
    .grow { flex: 1; }
  `,
})
export class ProductsPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private catalog = inject(CatalogStore);
  protected products = signal<Product[]>([]);
  protected categories = signal<Category[]>([]);
  protected loading = signal(true);
  protected busy = signal(false);
  protected query = signal('');
  protected cat = signal<number | null>(null);
  protected form = signal<Form | null>(null);

  protected activeCount = computed(() => this.products().filter(p => p.active).length);
  protected filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.products().filter(p => (this.cat() === null || p.categoryId === this.cat()) && (!q || p.name.toLowerCase().includes(q)));
  });

  ngOnInit() { this.load(); }

  async load() {
    try {
      const [cats, prods] = await Promise.all([this.api.categories(true), this.api.products(true)]);
      this.categories.set(cats);
      this.products.set(prods);
    } catch (e) { this.toast.error(errorMessage(e)); }
    finally { this.loading.set(false); }
  }

  edit(p?: Product) {
    this.form.set(p
      ? { id: p.id, name: p.name, description: p.description ?? '', price: p.price.toFixed(2).replace('.', ','), categoryId: p.categoryId,
          imageUrl: p.imageUrl ?? '', trackStock: p.trackStock, stock: p.stock, featured: p.featured, active: p.active }
      : { name: '', description: '', price: '', categoryId: this.cat() ?? this.categories()[0]?.id ?? null, imageUrl: '',
          trackStock: false, stock: 0, featured: false, active: true });
  }

  async save() {
    const f = this.form();
    if (!f || this.busy()) return;
    if (!f.name.trim() || f.categoryId === null) { this.toast.error('Preencha nome e categoria.'); return; }
    this.busy.set(true);
    try {
      await this.api.saveProduct({
        name: f.name, description: f.description || null, price: parseMoney(f.price), categoryId: f.categoryId,
        imageUrl: f.imageUrl || null, trackStock: f.trackStock, stock: Number(f.stock) || 0, featured: f.featured, active: f.active,
      }, f.id);
      this.toast.ok(f.id ? 'Produto atualizado' : 'Produto criado');
      this.form.set(null);
      this.catalog.invalidate();
      await this.load();
    } catch (e) { this.toast.error(errorMessage(e)); }
    finally { this.busy.set(false); }
  }

  async remove(f: Form) {
    if (!f.id || !confirm(`Excluir "${f.name}"? Se já foi vendido, ele só será desativado.`)) return;
    this.busy.set(true);
    try {
      await this.api.deleteProduct(f.id);
      this.toast.ok('Produto removido');
      this.form.set(null);
      this.catalog.invalidate();
      await this.load();
    } catch (e) { this.toast.error(errorMessage(e)); }
    finally { this.busy.set(false); }
  }
}
