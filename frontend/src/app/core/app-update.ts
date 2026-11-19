import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

/**
 * PWA: quando sai uma versão nova do site, o service worker baixa em segundo plano.
 * A troca acontece na próxima mudança de tela (nunca no meio de um pagamento),
 * para o caixa não ficar preso numa versão antiga.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdate {
  private sw = inject(SwUpdate);
  private router = inject(Router);
  private ready = false;

  start() {
    if (!this.sw.isEnabled) return;

    this.sw.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => (this.ready = true));

    // Se o cache ficou inconsistente (ex.: arquivos removidos no servidor), recarrega do zero.
    this.sw.unrecoverable.subscribe(() => location.reload());

    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(e => {
      if (this.ready && !e.urlAfterRedirects.startsWith('/pdv/pagar')) location.reload();
    });

    // O app fica aberto o dia todo no balcão: procura atualização a cada 30 min e ao voltar para a aba.
    const check = () => this.sw.checkForUpdate().catch(() => {});
    setInterval(check, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }
}
