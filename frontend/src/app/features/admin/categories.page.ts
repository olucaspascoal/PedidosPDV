import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorMessage } from '../../core/api.service';
import { CatalogStore } from '../../core/catalog.store';
import { Category } from '../../core/models';
import { ToastService } from '../../core/toast';
import { Icon } from '../../shared/icon';

interface Form { id?: number; name: string; icon: string; sortOrder: number; active: boolean; }
const ICONS = ['🍺', '🍻', '🍹', '🍸', '🥃', '🍷', '🥂', '🍾', '🥤', '🧃', '💧', '☕', '🍟', '🍖', '🌭', '🍕', '🥜', '🧊', '🚬', '🎉'];

@Component({
  selector: 'app-categories',
  imports: [FormsModule, Icon],
  template: `
    <header class="head">
      <div><h1>Categorias</h1><p class="muted">Organizam os produtos nas abas do PDV.</p></div>
      <button class="btn primary" (click)="edit()"><app-icon name="plus" [size]="18" />Nova categoria</button>
    </header>

    <section class="grid">
      @for (c of list(); track c.id) {
        <button class="cat card" (click)="edit(c)" [class.off]="!c.active">
          <span class="ico">{{ c.icon }}</span>
          <span class="name">{{ c.name }}</span>
          <span class="muted small">{{ c.productCount }} produtos{{ c.active ? '' : ' · oculta' }}</span>
          <span class="order muted">#{{ c.sortOrder }}</span>
        </button>
      }
    </section>

    @if (form(); as f) {
      <div class="backdrop" (click)="form.set(null)">
        <form class="modal" (click)="$event.stopPropagation()" (ngSubmit)="save()">
          <div class="modal-head"><h2>{{ f.id ? 'Editar categoria' : 'Nova categoria' }}</h2>
            <button type="button" class="icon-btn" (click)="form.set(null)" aria-label="Fechar"><app-icon name="x" /></button></div>
          <div class="grid-form">
            <label class="field full">Nome<input class="input" name="name" [(ngModel)]="f.name" required maxlength="60" autofocus /></label>
            <div class="field full">Ícone
              <div class="icons">
                @for (i of icons; track i) { <button type="button" class="ic" [class.on]="f.icon === i" (click)="f.icon = i">{{ i }}</button> }
              </div>
            </div>
            <label class="field">Ordem<input class="input" name="sortOrder" type="number" [(ngModel)]="f.sortOrder" /></label>
            <div class="field"><span>&nbsp;</span><label class="switch"><input type="checkbox" name="active" [(ngModel)]="f.active" />Visível no PDV</label></div>
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
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
    .cat { position: relative; border: 0; padding: 20px; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; cursor: pointer; text-align: left; }
    .cat:hover { box-shadow: inset 0 0 0 1.5px var(--brand), var(--shadow); }
    .cat.off { opacity: .55; }
    .ico { font-size: 30px; width: 52px; height: 52px; border-radius: 16px; background: var(--brand-50); display: grid; place-items: center; margin-bottom: 8px; }
    .name { font-weight: 500; }
    .small { font-size: 12px; }
    .order { position: absolute; top: 16px; right: 16px; font-size: 12px; }
    .icons { display: flex; flex-wrap: wrap; gap: 6px; }
    .ic { width: 42px; height: 42px; border-radius: 12px; border: 0; background: var(--bg); font-size: 20px; cursor: pointer; }
    .ic.on { background: var(--brand-50); box-shadow: inset 0 0 0 2px var(--brand); }
    .grow { flex: 1; }
  `,
})
export class CategoriesPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private catalog = inject(CatalogStore);
  protected list = signal<Category[]>([]);
  protected form = signal<Form | null>(null);
  protected busy = signal(false);
  protected icons = ICONS;

  ngOnInit() { this.load(); }

  async load() {
    try { this.list.set(await this.api.categories(true)); }
    catch (e) { this.toast.error(errorMessage(e)); }
  }

  edit(c?: Category) {
    this.form.set(c ? { id: c.id, name: c.name, icon: c.icon, sortOrder: c.sortOrder, active: c.active }
      : { name: '', icon: '🍺', sortOrder: (this.list().at(-1)?.sortOrder ?? 0) + 1, active: true });
  }

  async save() {
    const f = this.form();
    if (!f || this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.saveCategory({ name: f.name, icon: f.icon, sortOrder: Number(f.sortOrder) || 0, active: f.active }, f.id);
      this.form.set(null);
      this.catalog.invalidate();
      await this.load();
      this.toast.ok('Categoria salva');
    } catch (e) { this.toast.error(errorMessage(e)); }
    finally { this.busy.set(false); }
  }

  async remove(f: Form) {
    if (!f.id || !confirm(`Excluir a categoria "${f.name}"?`)) return;
    try {
      await this.api.deleteCategory(f.id);
      this.form.set(null);
      this.catalog.invalidate();
      await this.load();
      this.toast.ok('Categoria excluída');
    } catch (e) { this.toast.error(errorMessage(e)); }
  }
}
