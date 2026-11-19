import { Component, Injectable, inject, signal } from '@angular/core';
import { Icon } from '../shared/icon';

export interface Toast { id: number; text: string; kind: 'ok' | 'error' | 'info'; }

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  show(text: string, kind: Toast['kind'] = 'info', ms = 3200) {
    const id = ++this.seq;
    this.toasts.update(t => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => this.dismiss(id), ms);
  }
  ok(text: string) { this.show(text, 'ok'); }
  error(text: string) { this.show(text, 'error', 4500); }
  dismiss(id: number) { this.toasts.update(t => t.filter(x => x.id !== id)); }
}

@Component({
  selector: 'app-toasts',
  imports: [Icon],
  template: `
    <div class="toasts" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <button class="toast" [class]="'toast ' + t.kind" (click)="toast.dismiss(t.id)">
          <app-icon [name]="t.kind === 'error' ? 'alert' : 'check'" [size]="18" />
          <span>{{ t.text }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    .toasts { position: fixed; left: 50%; top: calc(12px + env(safe-area-inset-top)); transform: translateX(-50%);
      z-index: 200; display: flex; flex-direction: column; gap: 8px; width: min(420px, calc(100vw - 32px)); pointer-events: none; }
    .toast { pointer-events: auto; display: flex; align-items: center; gap: 10px; padding: 12px 16px; border: 0;
      border-radius: 14px; background: var(--ink); color: #fff; font: inherit; font-size: 14px; text-align: left;
      box-shadow: 0 10px 30px rgba(0,0,0,.18); animation: drop .2s ease-out; cursor: pointer; }
    .toast.ok app-icon { color: #4ade80; }
    .toast.error { background: #b42318; }
    @keyframes drop { from { opacity: 0; transform: translateY(-8px); } }
  `,
})
export class Toasts {
  protected toast = inject(ToastService);
}
