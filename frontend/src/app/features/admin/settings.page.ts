import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService, errorMessage } from '../../core/api.service';
import { PaymentSettings } from '../../core/models';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-settings',
  imports: [Icon],
  template: `
    <header class="head"><h1>Configurações</h1><p class="muted">Integração de pagamentos e informações do sistema.</p></header>

    <section class="card panel">
      <div class="p-head">
        <span class="mp"><app-icon name="pix" [size]="22" /></span>
        <div class="grow"><h2>Pix pelo Mercado Pago</h2><p class="muted small">QR Code dinâmico com confirmação automática do pagamento.</p></div>
        @if (s(); as st) {
          <span class="badge" [class.Paga]="st.pixMode === 'mercadopago'" [class.Pendente]="st.pixMode === 'simulado'">
            {{ st.pixMode === 'mercadopago' ? 'Conectado' : 'Modo simulado' }}</span>
        }
      </div>

      @if (error()) { <p class="err">{{ error() }}</p> }
      @if (s(); as st) {
        <ul class="checks">
          <li [class.ok]="st.pixMode === 'mercadopago'"><app-icon [name]="st.pixMode === 'mercadopago' ? 'check' : 'alert'" [size]="16" />Access token configurado</li>
          <li [class.ok]="st.notificationUrlConfigured"><app-icon [name]="st.notificationUrlConfigured ? 'check' : 'alert'" [size]="16" />URL de notificação (webhook)</li>
          <li [class.ok]="st.webhookSecretConfigured"><app-icon [name]="st.webhookSecretConfigured ? 'check' : 'alert'" [size]="16" />Assinatura secreta do webhook</li>
          <li class="ok"><app-icon name="clock" [size]="16" />QR Code expira em {{ st.pixExpirationMinutes }} minutos</li>
        </ul>
      }

      <div class="how">
        <h3>Como ativar</h3>
        <ol>
          <li>No painel do Mercado Pago, crie uma aplicação em <b>Suas integrações</b> e copie o <b>Access Token</b> de produção.</li>
          <li>No servidor, configure as variáveis de ambiente (os segredos ficam só no backend):
            <pre>MercadoPago__AccessToken=APP_USR-...
MercadoPago__NotificationUrl=https://seu-dominio/api/webhooks/mercadopago
MercadoPago__WebhookSecret=assinatura-secreta-do-webhook</pre>
          </li>
          <li>Reinicie a API. Mesmo sem webhook, o PDV confirma o Pix consultando o Mercado Pago a cada 3 segundos.</li>
        </ol>
      </div>
    </section>
  `,
  styles: `
    .head { margin-bottom: 20px; } .head p { font-size: 14px; margin-top: 4px; }
    .panel { padding: 24px; max-width: 760px; }
    .p-head { display: flex; align-items: center; gap: 14px; }
    .mp { width: 48px; height: 48px; border-radius: 14px; background: #e6f7f4; color: #0f8f7c; display: grid; place-items: center; }
    .grow { flex: 1; }
    .small { font-size: 13px; margin-top: 2px; }
    .err { color: var(--danger); margin-top: 12px; }
    .checks { list-style: none; padding: 0; margin: 20px 0; display: grid; gap: 10px; }
    .checks li { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--warn); }
    .checks li.ok { color: var(--ink); }
    .checks li.ok app-icon { color: var(--ok); }
    .how { border-top: 1px solid var(--line); padding-top: 18px; font-size: 14px; color: var(--ink-2); }
    .how ol { padding-left: 20px; display: grid; gap: 10px; margin: 10px 0 0; }
    pre { background: var(--ink); color: #f5f5f5; padding: 14px; border-radius: 12px; font-size: 12px; overflow-x: auto; margin: 8px 0 0; }
  `,
})
export class SettingsPage implements OnInit {
  private api = inject(ApiService);
  protected s = signal<PaymentSettings | null>(null);
  protected error = signal('');

  async ngOnInit() {
    try { this.s.set(await this.api.paymentSettings()); }
    catch (e) { this.error.set(errorMessage(e)); }
  }
}
