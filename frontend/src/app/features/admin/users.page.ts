import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorMessage } from '../../core/api.service';
import { User, UserRole } from '../../core/models';
import { ToastService } from '../../core/toast';
import { Icon } from '../../shared/icon';

interface Form { id?: number; name: string; role: UserRole; active: boolean; pin: string; }

@Component({
  selector: 'app-users',
  imports: [FormsModule, Icon],
  template: `
    <header class="head">
      <div><h1>Usuários</h1><p class="muted">Quem pode entrar no PDV. Cada pessoa usa o próprio PIN.</p></div>
      <button class="btn primary" (click)="edit()"><app-icon name="plus" [size]="18" />Novo usuário</button>
    </header>

    <section class="card">
      <table class="table">
        <thead><tr><th>Nome</th><th>Perfil</th><th>Status</th><th></th></tr></thead>
        <tbody>
          @for (u of list(); track u.id) {
            <tr class="click" (click)="edit(u)">
              <td><div class="who"><span class="avatar">{{ u.name[0] }}</span><b>{{ u.name }}</b></div></td>
              <td>{{ u.role === 'Admin' ? 'Administrador' : 'Atendente' }}</td>
              <td><span class="badge" [class.Paga]="u.active" [class.Cancelada]="!u.active">{{ u.active ? 'Ativo' : 'Inativo' }}</span></td>
              <td class="r"><app-icon name="edit" [size]="16" /></td>
            </tr>
          }
        </tbody>
      </table>
    </section>

    @if (form(); as f) {
      <div class="backdrop" (click)="form.set(null)">
        <form class="modal" (click)="$event.stopPropagation()" (ngSubmit)="save()">
          <div class="modal-head"><h2>{{ f.id ? 'Editar usuário' : 'Novo usuário' }}</h2>
            <button type="button" class="icon-btn" (click)="form.set(null)" aria-label="Fechar"><app-icon name="x" /></button></div>
          <div class="grid-form">
            <label class="field full">Nome<input class="input" name="name" [(ngModel)]="f.name" required maxlength="80" autofocus /></label>
            <label class="field">Perfil
              <select class="select" name="role" [(ngModel)]="f.role">
                <option value="Atendente">Atendente (só PDV)</option>
                <option value="Admin">Administrador</option>
              </select>
            </label>
            <label class="field">{{ f.id ? 'Novo PIN (opcional)' : 'PIN' }}
              <input class="input" name="pin" [(ngModel)]="f.pin" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password"
                [placeholder]="f.id ? 'Manter atual' : '4 a 8 números'" type="password" />
            </label>
            <label class="switch full"><input type="checkbox" name="active" [(ngModel)]="f.active" />Pode entrar no sistema</label>
          </div>
          <div class="modal-foot">
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
    .who { display: flex; align-items: center; gap: 12px; }
    .who b { font-weight: 500; }
    .avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--ink); color: #fff; display: grid; place-items: center; font-size: 13px; font-weight: 600; }
  `,
})
export class UsersPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  protected list = signal<User[]>([]);
  protected form = signal<Form | null>(null);
  protected busy = signal(false);

  ngOnInit() { this.load(); }

  async load() {
    try { this.list.set(await this.api.users()); }
    catch (e) { this.toast.error(errorMessage(e)); }
  }

  edit(u?: User) {
    this.form.set(u ? { id: u.id, name: u.name, role: u.role, active: u.active, pin: '' } : { name: '', role: 'Atendente', active: true, pin: '' });
  }

  async save() {
    const f = this.form();
    if (!f || this.busy()) return;
    if (f.pin && !/^\d{4,8}$/.test(f.pin)) { this.toast.error('O PIN deve ter de 4 a 8 números.'); return; }
    this.busy.set(true);
    try {
      await this.api.saveUser({ name: f.name, role: f.role, active: f.active, pin: f.pin || null }, f.id);
      this.form.set(null);
      await this.load();
      this.toast.ok('Usuário salvo');
    } catch (e) { this.toast.error(errorMessage(e)); }
    finally { this.busy.set(false); }
  }
}
