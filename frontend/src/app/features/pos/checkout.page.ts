import { CurrencyPipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../../core/api.service';
import { CatalogStore } from '../../core/catalog.store';
import { METHOD_ICON, METHOD_LABEL, Order, Payment, PaymentMethod } from '../../core/models';
import { money, parseMoney } from '../../core/storage';
import { ToastService } from '../../core/toast';
import { Icon } from '../../shared/icon';
import { QrCodeView } from '../../shared/ui';

type Step = 'choose' | 'pix' | 'done';

@Component({
  selector: 'app-checkout',
  imports: [CurrencyPipe, FormsModule, RouterLink, Icon, QrCodeView],
  template: `
    <div class="page">
      <header class="bar">
        @if (step() === 'pix') {
          <button class="icon-btn" (click)="leavePix()" aria-label="Voltar"><app-icon name="back" /></button>
        } @else if (step() === 'choose') {
          <a class="icon-btn" [routerLink]="['/pdv/comandas', id()]" aria-label="Voltar"><app-icon name="back" /></a>
        } @else { <span class="spacer"></span> }
        <span>{{ step() === 'done' ? 'Venda concluída' : 'Pagamento' }}</span>
        <span class="spacer"></span>
      </header>

      @if (!order()) {
        @if (error()) { <div class="empty"><app-icon name="alert" [size]="28" /><span>{{ error() }}</span></div> }
        @else { <div class="skeleton" style="height: 360px"></div> }
      } @else {
        @let o = order()!;

        @switch (step()) {
          @case ('choose') {
            <section class="due card">
              <span class="muted">Venda #{{ o.id }}{{ o.label ? ' · ' + o.label : '' }}</span>
              <div class="due-value num">{{ o.remaining | currency }}</div>
              @if (o.paid > 0) { <span class="paid-note">{{ o.paid | currency }} já pago de {{ o.total | currency }}</span> }
              <details class="items">
                <summary>{{ itemCount() }} itens</summary>
                @for (i of o.items; track i.id) {
                  <div class="it"><span>{{ i.quantity }}x {{ i.productName }}</span><span class="num">{{ i.total | currency }}</span></div>
                }
                @for (pr of o.promotions; track $index) {
                  <div class="it"><span>🏷️ {{ pr.description }}</span><span class="num">- {{ pr.amount | currency }}</span></div>
                }
                @if (o.discount > 0) {
                  <div class="it"><span>Desconto</span><span class="num">- {{ o.discount | currency }}</span></div>
                }
              </details>
            </section>

            <h3 class="section">Forma de pagamento</h3>
            <div class="methods">
              @for (m of methods; track m) {
                <button class="method" [class.on]="method() === m" (click)="method.set(m)">
                  <span class="m-ico"><app-icon [name]="methodIcon[m]" [size]="22" /></span>
                  <span>{{ methodLabel[m] }}</span>
                </button>
              }
            </div>

            <section class="card form">
              <!-- Valor travado no saldo da venda: não é editável na cobrança, para evitar cobrar a mais ou a menos. -->
              <div class="due-row"><span class="lbl">Valor a cobrar</span><b class="num">{{ amount() | currency }}</b></div>

              @if (method() === 'Dinheiro') {
                <label class="field">
                  <span class="lbl">Valor recebido</span>
                  <div class="money">
                    <span>R$</span>
                    <input class="input num" inputmode="decimal" [ngModel]="receivedText()" (ngModelChange)="receivedText.set($event)" placeholder="0,00" (focus)="$any($event.target).select()" />
                  </div>
                </label>
                <div class="chips">
                  <button class="chip" (click)="receivedText.set(fmt(amount()))">Exato</button>
                  @for (b of bills(); track b) { <button class="chip" (click)="receivedText.set(fmt(b))">{{ b | currency: 'BRL' : 'symbol' : '1.0-0' }}</button> }
                </div>
                <div class="change" [class.neg]="change() < 0">
                  <span>{{ change() < 0 ? 'Falta receber' : 'Troco' }}</span>
                  <span class="num">{{ abs(change()) | currency }}</span>
                </div>
              }
              @if (method() === 'Credito' || method() === 'Debito') {
                <p class="hint">Passe o cartão na maquininha e confirme aqui quando for aprovado.</p>
              }
            </section>

            <div class="footer">
              <button class="btn primary lg block" [disabled]="!canPay() || busy()" (click)="pay()">
                @if (busy()) { <span class="spinner light"></span> }
                @else if (method() === 'Pix') { <app-icon name="qr" /> Gerar QR Code Pix }
                @else { Confirmar {{ amount() | currency }} }
              </button>
            </div>
          }

          @case ('pix') {
            @let p = pix()!;
            <section class="pix card">
              <div class="pix-head">
                <span class="pix-logo"><app-icon name="pix" [size]="18" /></span>
                <span>Pague com Pix</span>
              </div>
              <div class="pix-value num">{{ p.amount | currency }}</div>

              @if (p.status === 'Pendente') {
                <div class="qr-box">
                  @if (p.qrCode) { <app-qr [code]="p.qrCode" /> }
                  @else if (p.qrCodeBase64) { <img [src]="'data:image/png;base64,' + p.qrCodeBase64" alt="QR Code Pix" /> }
                </div>
                <div class="waiting"><span class="pulse"></span>Aguardando pagamento · expira em {{ countdown() }}</div>
                <button class="btn outline block" (click)="copy(p.qrCode)"><app-icon name="copy" [size]="18" />Copiar código Pix</button>
                @if (p.simulated) {
                  <div class="sim">
                    <p><b>Modo simulado.</b> Configure o access token do Mercado Pago para gerar cobranças reais.</p>
                    <button class="btn dark sm" (click)="simulate(p)" [disabled]="busy()">Simular pagamento aprovado</button>
                  </div>
                }
              } @else {
                <div class="pix-end">
                  <app-icon name="alert" [size]="32" />
                  <p>Este Pix foi {{ p.status === 'Expirado' ? 'expirado' : p.status === 'Recusado' ? 'recusado' : 'cancelado' }}.</p>
                  <button class="btn primary" (click)="pay()" [disabled]="busy()">Gerar novo QR Code</button>
                </div>
              }
            </section>
            @if (p.status === 'Pendente') {
              <button class="btn ghost block" (click)="cancelPix(p)" [disabled]="busy()">Cancelar Pix e escolher outra forma</button>
            }
          }

          @case ('done') {
            <section class="done">
              <div class="ok-ring"><app-icon name="check" [size]="44" [stroke]="2.5" /></div>
              <h1>Pagamento aprovado!</h1>
              <p class="muted">Venda #{{ o.id }}{{ o.label ? ' · ' + o.label : '' }}</p>
              <div class="done-total num">{{ o.total | currency }}</div>
              @if (lastChange() > 0) {
                <div class="change big"><span>Troco</span><span class="num">{{ lastChange() | currency }}</span></div>
              }
              <div class="paid-list">
                @for (pm of approved(); track pm.id) {
                  <div class="it"><span><app-icon [name]="methodIcon[pm.method]" [size]="16" /> {{ methodLabel[pm.method] }}</span><span class="num">{{ pm.amount | currency }}</span></div>
                }
              </div>
            </section>
            <div class="footer">
              <a class="btn primary lg block" routerLink="/pdv">Nova venda</a>
              <a class="btn ghost block" routerLink="/pdv/comandas">Ver comandas</a>
            </div>
          }
        }
      }
    </div>
  `,
  styles: `
    .page { max-width: 560px; margin: 0 auto; padding: calc(12px + env(safe-area-inset-top)) 16px calc(110px + env(safe-area-inset-bottom)); }
    .bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; font-weight: 500; }
    .spacer { width: 42px; }
    .due { padding: 20px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 4px;
      background: linear-gradient(160deg, var(--brand) 0%, #ff7a4d 100%); color: #fff; }
    .due .muted { color: rgba(255,255,255,.85); font-size: 13px; }
    .due-value { font-size: 40px; font-weight: 600; letter-spacing: -0.02em; }
    .paid-note { font-size: 12px; background: rgba(255,255,255,.2); padding: 3px 10px; border-radius: 999px; }
    .items { width: 100%; margin-top: 8px; text-align: left; font-size: 13px; }
    .items summary { cursor: pointer; text-align: center; color: rgba(255,255,255,.9); list-style: none; }
    .items summary::after { content: ' ▾'; }
    .it { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,.18); }
    .section { margin: 22px 0 10px; }
    .methods { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .method { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px 4px; border-radius: var(--radius-sm); border: 0;
      background: #fff; box-shadow: inset 0 0 0 1px var(--line); cursor: pointer; font-size: 13px; color: var(--ink-2); }
    .method.on { box-shadow: inset 0 0 0 2px var(--brand); color: var(--brand); background: var(--brand-50); font-weight: 500; }
    .m-ico { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: var(--bg); }
    .method.on .m-ico { background: #fff; }
    .form { margin-top: 14px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
    .lbl { font-size: 13px; color: var(--muted); }
    .money { position: relative; display: flex; align-items: center; }
    .money span { position: absolute; left: 16px; color: var(--muted); font-weight: 500; }
    .money .input { padding-left: 46px; font-size: 20px; font-weight: 600; height: 54px; }
    .err { color: var(--danger); font-size: 12px; }
    .hint { color: var(--muted); font-size: 13px; }
    .due-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .due-row b { font-size: 20px; font-weight: 600; }
    .change { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-radius: var(--radius-sm); background: var(--ok-50); color: var(--ok); font-weight: 600; }
    .change.neg { background: var(--warn-50); color: var(--warn); }
    .change.big { font-size: 20px; width: 100%; }
    .footer { position: fixed; left: 0; right: 0; bottom: 0; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); background: linear-gradient(transparent, var(--bg) 30%);
      display: flex; flex-direction: column; gap: 4px; max-width: 560px; margin: 0 auto; }
    .spinner.light { border-color: rgba(255,255,255,.35); border-top-color: #fff; }
    .pix { padding: 22px; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
    .pix-head { display: flex; align-items: center; gap: 8px; font-weight: 500; }
    .pix-logo { width: 32px; height: 32px; border-radius: 10px; background: #e6f7f4; color: #0f8f7c; display: grid; place-items: center; }
    .pix-value { font-size: 34px; font-weight: 600; }
    .qr-box { width: min(280px, 78vw); padding: 12px; border-radius: 20px; background: #fff; box-shadow: inset 0 0 0 1px var(--line); }
    .qr-box img { width: 100%; display: block; }
    .waiting { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
    .pulse { width: 10px; height: 10px; border-radius: 50%; background: var(--brand); animation: pulse 1.2s infinite; }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(255, 79, 31, .5); } 100% { box-shadow: 0 0 0 10px rgba(255, 79, 31, 0); } }
    .sim { width: 100%; padding: 14px; border-radius: var(--radius-sm); border: 1.5px dashed var(--line); font-size: 12px; color: var(--muted); display: flex; flex-direction: column; gap: 10px; align-items: center; }
    .pix-end { display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--muted); padding: 20px 0; }
    .done { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; padding: 24px 0; }
    .ok-ring { width: 96px; height: 96px; border-radius: 50%; background: var(--ok); color: #fff; display: grid; place-items: center;
      box-shadow: 0 0 0 12px var(--ok-50); margin-bottom: 16px; animation: pop .35s ease-out; }
    @keyframes pop { from { transform: scale(.6); opacity: 0; } }
    .done-total { font-size: 36px; font-weight: 600; margin: 4px 0 12px; }
    .paid-list { width: 100%; }
    .paid-list .it { border-color: var(--line); font-size: 14px; }
    .paid-list .it span { display: inline-flex; gap: 6px; align-items: center; }
  `,
})
export class CheckoutPage {
  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private catalog = inject(CatalogStore);

  readonly id = input.required<string>();
  protected order = signal<Order | null>(null);
  protected error = signal('');
  protected step = signal<Step>('choose');
  protected method = signal<PaymentMethod>('Pix');
  protected receivedText = signal('');
  protected pix = signal<Payment | null>(null);
  protected busy = signal(false);
  protected lastChange = signal(0);
  private now = signal(Date.now());
  private poll?: ReturnType<typeof setInterval>;
  private tick?: ReturnType<typeof setInterval>;

  protected methods: PaymentMethod[] = ['Pix', 'Dinheiro', 'Credito', 'Debito'];
  protected methodLabel = METHOD_LABEL;
  protected methodIcon = METHOD_ICON;

  /** Sempre o saldo da venda: o valor da cobrança não pode ser editado. */
  protected amount = computed(() => this.order()?.remaining ?? 0);
  protected change = computed(() => Math.round((parseMoney(this.receivedText()) - this.amount()) * 100) / 100);
  protected itemCount = computed(() => this.order()?.items.reduce((s, i) => s + i.quantity, 0) ?? 0);
  protected approved = computed(() => this.order()?.payments.filter(p => p.status === 'Aprovado') ?? []);
  protected bills = computed(() => {
    const a = this.amount();
    const opts = [10, 20, 50, 100, 200].filter(b => b > a);
    const roundUp = Math.ceil(a / 10) * 10;
    return [...new Set([roundUp > a ? roundUp : null, ...opts].filter((x): x is number => !!x))].slice(0, 4);
  });
  protected canPay = computed(() => {
    const o = this.order();
    if (!o || o.status !== 'Aberta') return false;
    const a = this.amount();
    if (a <= 0 || a > o.remaining + 0.001) return false;
    return this.method() !== 'Dinheiro' || this.change() >= 0;
  });
  protected countdown = computed(() => {
    const exp = this.pix()?.expiresAt;
    if (!exp) return '--:--';
    const s = Math.max(0, Math.floor((new Date(exp).getTime() - this.now()) / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  });

  constructor() {
    effect(() => { this.load(Number(this.id())); });
    inject(DestroyRef).onDestroy(() => this.stopPolling());
  }

  async load(id: number) {
    try {
      const o = await this.api.order(id);
      this.setOrder(o);
      if (o.status === 'Paga') { this.step.set('done'); return; }
      if (o.status === 'Cancelada') { this.error.set('Esta venda foi cancelada.'); this.order.set(null); return; }
      // Retoma um Pix pendente (ex.: a página foi recarregada).
      const pending = o.payments.find(p => p.method === 'Pix' && p.status === 'Pendente');
      if (pending) this.showPix(pending);
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  private setOrder(o: Order) {
    this.order.set(o);
    this.receivedText.set('');
  }

  fmt(v: number) { return v.toFixed(2).replace('.', ','); }
  abs(v: number) { return Math.abs(v); }

  async pay() {
    const o = this.order();
    if (!o || this.busy()) return;
    const method = this.step() === 'pix' ? 'Pix' : this.method();
    const amount = this.step() === 'pix' ? this.pix()?.amount ?? this.amount() : this.amount();
    this.busy.set(true);
    try {
      const res = await this.api.pay(o.id, {
        method, amount,
        cashReceived: method === 'Dinheiro' ? parseMoney(this.receivedText()) || amount : undefined,
      });
      if (method === 'Pix' && res.payment.status === 'Pendente') {
        this.showPix(res.payment);
      } else {
        this.lastChange.set(res.payment.change ?? 0);
        await this.afterApproval(res.orderStatus);
      }
    } catch (e) {
      this.toast.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  private showPix(p: Payment) {
    this.pix.set(p);
    this.step.set('pix');
    this.stopPolling();
    this.now.set(Date.now());
    this.tick = setInterval(() => this.now.set(Date.now()), 1000);
    this.poll = setInterval(() => this.checkPix(), 3000);
  }

  private async checkPix() {
    const p = this.pix();
    if (!p || p.status !== 'Pendente') return;
    try {
      const res = await this.api.payment(p.id);
      this.pix.set(res.payment);
      if (res.payment.status === 'Aprovado') {
        this.toast.ok('Pix recebido!');
        await this.afterApproval(res.orderStatus);
      } else if (res.payment.status !== 'Pendente') {
        this.stopPolling();
      }
    } catch { /* tenta de novo no próximo ciclo */ }
  }

  private async afterApproval(orderStatus: string) {
    this.stopPolling();
    navigator.vibrate?.([30, 40, 30]);
    const o = await this.api.order(this.order()!.id);
    this.setOrder(o);
    this.catalog.invalidate();
    if (orderStatus === 'Paga' || o.status === 'Paga') {
      this.step.set('done');
    } else {
      this.toast.ok(`Pagamento registrado. Faltam ${money(o.remaining)}.`);
      this.pix.set(null);
      this.step.set('choose');
    }
  }

  async simulate(p: Payment) {
    this.busy.set(true);
    try {
      const res = await this.api.simulateApproval(p.id);
      this.pix.set(res.payment);
      await this.afterApproval(res.orderStatus);
    } catch (e) { this.toast.error(errorMessage(e)); }
    finally { this.busy.set(false); }
  }

  async cancelPix(p: Payment) {
    this.busy.set(true);
    try {
      const res = await this.api.cancelPayment(p.id);
      if (res.payment.status === 'Aprovado') { await this.afterApproval(res.orderStatus); return; }
      this.stopPolling();
      this.pix.set(null);
      this.step.set('choose');
      this.method.set('Dinheiro');
    } catch (e) { this.toast.error(errorMessage(e)); }
    finally { this.busy.set(false); }
  }

  leavePix() {
    const p = this.pix();
    if (p?.status === 'Pendente') { this.cancelPix(p); return; }
    this.pix.set(null);
    this.step.set('choose');
  }

  async copy(code: string | null) {
    if (!code) return;
    try { await navigator.clipboard.writeText(code); this.toast.ok('Código Pix copiado'); }
    catch { this.toast.error('Não foi possível copiar.'); }
  }

  private stopPolling() {
    clearInterval(this.poll);
    clearInterval(this.tick);
  }
}
