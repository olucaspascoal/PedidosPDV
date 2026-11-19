import { CurrencyPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorMessage } from '../../core/api.service';
import { CatalogStore } from '../../core/catalog.store';
import { Product, Promotion, PromotionType } from '../../core/models';
import { promoDiscount } from '../../core/promotions';
import { localDate } from '../../core/storage';
import { ToastService } from '../../core/toast';
import { Icon } from '../../shared/icon';

interface Form {
  id?: number; name: string; type: PromotionType; productId: number | null; quantity: number;
  price: string; payQuantity: number; startsOn: string; endsOn: string; active: boolean;
}

@Component({
  selector: 'app-promotions',
  imports: [FormsModule, CurrencyPipe, Icon],
  template: `
    <header class="head">
      <div><h1>Promoções</h1><p class="muted">Aplicadas sozinhas no PDV quando o cliente leva a quantidade da promoção.</p></div>
      <button class="btn primary" (click)="edit()"><app-icon name="plus" [size]="18" />Nova promoção</button>
    </header>

    <section class="card">
      @if (loading()) {
        <div class="empty"><span class="spinner"></span></div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Promoção</th><th>Produto</th><th>Regra</th><th>Validade</th><th>Status</th></tr></thead>
            <tbody>
              @for (p of list(); track p.id) {
                <tr class="click" (click)="edit(p)">
                  <td><b>{{ p.name }}</b></td>
                  <td>{{ p.productName }} <span class="muted small">({{ p.productPrice | currency }})</span></td>
                  <td><span class="rule">{{ p.rule }}</span></td>
                  <td class="num small">{{ validity(p) }}</td>
                  <td><span class="badge" [class]="'badge ' + status(p).css">{{ status(p).label }}</span></td>
                </tr>
              } @empty {
                <tr><td colspan="5"><div class="empty">
                  <app-icon name="percent" [size]="28" />
                  <span>Nenhuma promoção ainda. Ex.: "3 por R$ 10" ou "compre 1, leve 2".</span>
                </div></td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>

    @if (form(); as f) {
      <div class="backdrop" (click)="form.set(null)">
        <form class="modal" (click)="$event.stopPropagation()" (ngSubmit)="save()">
          <div class="modal-head"><h2>{{ f.id ? 'Editar promoção' : 'Nova promoção' }}</h2>
            <button type="button" class="icon-btn" (click)="form.set(null)" aria-label="Fechar"><app-icon name="x" /></button></div>

          <div class="types">
            <button type="button" class="type" [class.on]="f.type === 'LevePorPreco'" (click)="f.type = 'LevePorPreco'; touch()">
              <b>Leve N por R$</b><span class="muted small">Ex.: 3 por R$ 10,00</span>
            </button>
            <button type="button" class="type" [class.on]="f.type === 'LeveXPagueY'" (click)="f.type = 'LeveXPagueY'; touch()">
              <b>Leve N, pague M</b><span class="muted small">Ex.: compre 1, leve 2</span>
            </button>
          </div>

          <div class="grid-form">
            <label class="field full">Produto
              <select class="select" name="productId" [(ngModel)]="f.productId" (ngModelChange)="touch()" required>
                <option [ngValue]="null" disabled>Escolha o produto</option>
                @for (p of products(); track p.id) { <option [ngValue]="p.id">{{ p.name }} — {{ p.price | currency }}{{ p.active ? '' : ' (inativo)' }}</option> }
              </select>
            </label>

            <label class="field">{{ f.type === 'LevePorPreco' ? 'Quantidade' : 'Leve (unidades)' }}
              <input class="input" name="quantity" type="number" min="2" max="99" [(ngModel)]="f.quantity" (ngModelChange)="touch()" required />
            </label>
            @if (f.type === 'LevePorPreco') {
              <label class="field">Preço das {{ f.quantity || 'N' }} unidades
                <input class="input" name="price" inputmode="decimal" placeholder="0,00" [(ngModel)]="f.price" (ngModelChange)="touch()" required />
              </label>
            } @else {
              <label class="field">Pague (unidades)
                <input class="input" name="payQuantity" type="number" min="1" [max]="f.quantity - 1" [(ngModel)]="f.payQuantity" (ngModelChange)="touch()" required />
              </label>
            }

            @if (preview(); as pv) {
              <div class="preview full" [class.bad]="pv.saving <= 0">
                @if (pv.saving > 0) {
                  {{ pv.qty }}x {{ pv.name }}: de <s>{{ pv.full | currency }}</s> por <b>{{ pv.full - pv.saving | currency }}</b>
                  · economia de {{ pv.saving | currency }}
                } @else {
                  Com esses valores não há desconto ({{ pv.qty }}x {{ pv.name }} = {{ pv.full | currency }}).
                }
              </div>
            }

            <label class="field full">Nome (opcional)
              <input class="input" name="name" maxlength="80" [(ngModel)]="f.name" placeholder="Gerado automaticamente se ficar vazio" />
            </label>
            <label class="field">Começa em (opcional)<input class="input" name="startsOn" type="date" [(ngModel)]="f.startsOn" /></label>
            <label class="field">Termina em (opcional)<input class="input" name="endsOn" type="date" [(ngModel)]="f.endsOn" /></label>
            <div class="field full"><label class="switch"><input type="checkbox" name="active" [(ngModel)]="f.active" />Promoção ativa</label></div>
          </div>

          <div class="modal-foot">
            @if (f.id) { <button type="button" class="btn danger" (click)="remove(f)">Excluir</button> }
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
    .small { font-size: 12px; }
    .rule { display: inline-block; padding: 3px 10px; border-radius: 999px; background: var(--brand-50); color: var(--brand); font-weight: 500; font-size: 13px; white-space: nowrap; }
    .types { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
    .type { border: 0; border-radius: 14px; padding: 14px; background: var(--bg); display: flex; flex-direction: column; gap: 4px; text-align: left; cursor: pointer; font: inherit; }
    .type.on { background: var(--brand-50); box-shadow: inset 0 0 0 2px var(--brand); }
    .preview { padding: 12px 14px; border-radius: 12px; background: var(--ok-50); color: var(--ok); font-size: 14px; }
    .preview.bad { background: var(--danger-50); color: var(--danger); }
    .grow { flex: 1; }
  `,
})
export class PromotionsPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private catalog = inject(CatalogStore);
  protected list = signal<Promotion[]>([]);
  protected products = signal<Product[]>([]);
  protected loading = signal(true);
  protected form = signal<Form | null>(null);
  protected busy = signal(false);
  private version = signal(0); // força recalcular a prévia (o form é mutado pelo ngModel)

  protected preview = computed(() => {
    this.version();
    const f = this.form();
    const product = this.products().find(p => p.id === f?.productId);
    if (!f || !product || !(f.quantity >= 2)) return null;
    const promo = {
      type: f.type, quantity: Number(f.quantity), price: parseMoney(f.price), payQuantity: Number(f.payQuantity),
    } as Promotion;
    return { name: product.name, qty: promo.quantity, full: promo.quantity * product.price, saving: promoDiscount(promo, promo.quantity, product.price) };
  });

  ngOnInit() { this.load(); }

  async load() {
    try {
      const [list, products] = await Promise.all([this.api.promotions(true), this.api.products(true)]);
      this.list.set(list);
      this.products.set(products);
    } catch (e) { this.toast.error(errorMessage(e)); }
    finally { this.loading.set(false); }
  }

  touch() { this.version.update(v => v + 1); }

  edit(p?: Promotion) {
    this.form.set(p
      ? { id: p.id, name: p.name, type: p.type, productId: p.productId, quantity: p.quantity,
          price: p.price != null ? p.price.toFixed(2).replace('.', ',') : '', payQuantity: p.payQuantity ?? 1,
          startsOn: p.startsOn ?? '', endsOn: p.endsOn ?? '', active: p.active }
      : { name: '', type: 'LevePorPreco', productId: null, quantity: 3, price: '', payQuantity: 1, startsOn: '', endsOn: '', active: true });
    this.touch();
  }

  async save() {
    const f = this.form();
    if (!f || this.busy()) return;
    if (f.productId == null) { this.toast.error('Escolha o produto da promoção.'); return; }
    this.busy.set(true);
    try {
      await this.api.savePromotion({
        name: f.name.trim() || null, type: f.type, productId: f.productId, quantity: Number(f.quantity),
        price: f.type === 'LevePorPreco' ? parseMoney(f.price) : null,
        payQuantity: f.type === 'LeveXPagueY' ? Number(f.payQuantity) : null,
        startsOn: f.startsOn || null, endsOn: f.endsOn || null, active: f.active,
      }, f.id);
      this.form.set(null);
      this.catalog.invalidate();
      await this.load();
      this.toast.ok('Promoção salva');
    } catch (e) { this.toast.error(errorMessage(e)); }
    finally { this.busy.set(false); }
  }

  async remove(f: Form) {
    if (!f.id || !confirm('Excluir esta promoção? Vendas já feitas mantêm o desconto que tiveram.')) return;
    try {
      await this.api.deletePromotion(f.id);
      this.form.set(null);
      this.catalog.invalidate();
      await this.load();
      this.toast.ok('Promoção excluída');
    } catch (e) { this.toast.error(errorMessage(e)); }
  }

  validity(p: Promotion) {
    const fmt = (d: string) => d.split('-').reverse().slice(0, 2).join('/') + '/' + d.slice(2, 4);
    if (p.startsOn && p.endsOn) return `${fmt(p.startsOn)} a ${fmt(p.endsOn)}`;
    if (p.startsOn) return `A partir de ${fmt(p.startsOn)}`;
    if (p.endsOn) return `Até ${fmt(p.endsOn)}`;
    return 'Sem prazo';
  }

  status(p: Promotion): { label: string; css: string } {
    if (!p.active) return { label: 'Desativada', css: 'Cancelada' };
    if (p.validToday) return { label: 'Valendo', css: 'Paga' };
    const today = localDate();
    if (p.startsOn && p.startsOn > today) return { label: 'Agendada', css: 'Pendente' };
    return { label: 'Encerrada', css: 'Estornada' };
  }
}

function parseMoney(v: string | null | undefined): number {
  const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
