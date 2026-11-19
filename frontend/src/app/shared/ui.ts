import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { toDataURL } from 'qrcode';
import { Icon } from './icon';

/** Marca do produto. */
@Component({
  selector: 'app-logo',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="mark"><app-icon name="glass" [size]="compact() ? 16 : 18" [stroke]="2.2" /></span>
    @if (!compact()) { <span class="word">brinde</span> }
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 8px; }
    .mark { width: 34px; height: 34px; border-radius: 50%; background: var(--ink); color: #fff; display: grid; place-items: center; }
    .word { font-size: 24px; font-weight: 600; letter-spacing: -0.04em; color: var(--brand); }
  `,
})
export class Logo {
  readonly compact = input(false);
}

/** Miniatura do produto: imagem quando houver, senão o ícone da categoria. */
@Component({
  selector: 'app-thumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src() && !failed()) {
      <img [src]="src()" [alt]="" loading="lazy" (error)="failed.set(true)" />
    } @else {
      <span class="emoji">{{ icon() }}</span>
    }
  `,
  styles: `
    :host { display: grid; place-items: center; overflow: hidden; background: var(--brand-50); border-radius: inherit; }
    img { width: 100%; height: 100%; object-fit: cover; }
    .emoji { font-size: var(--thumb-emoji, 40px); line-height: 1; filter: saturate(1.1); }
  `,
})
export class Thumb {
  readonly src = input<string | null>(null);
  readonly icon = input('🍺');
  protected failed = signal(false);
}

/** Desenha o QR Code a partir do código Pix copia-e-cola. */
@Component({
  selector: 'app-qr',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (url()) { <img [src]="url()" alt="QR Code Pix" /> } @else { <div class="ph"></div> }`,
  styles: `
    :host { display: block; aspect-ratio: 1; }
    img, .ph { width: 100%; height: 100%; display: block; image-rendering: pixelated; }
    .ph { background: var(--bg); border-radius: 12px; }
  `,
})
export class QrCodeView {
  readonly code = input.required<string>();
  protected url = signal<string | null>(null);

  constructor() {
    effect(() => {
      const code = this.code();
      toDataURL(code, { margin: 1, width: 560, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } })
        .then(u => this.url.set(u))
        .catch(() => this.url.set(null));
    });
  }
}

/** Controle - n + usado nos cards e no carrinho. */
@Component({
  selector: 'app-stepper',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="b minus" (click)="$event.stopPropagation(); dec()" [attr.aria-label]="'Diminuir ' + label()">
      <app-icon [name]="value() === 1 && trashAtOne() ? 'trash' : 'minus'" [size]="14" [stroke]="2.5" />
    </button>
    <span class="v">{{ value() }}</span>
    <button type="button" class="b plus" (click)="$event.stopPropagation(); inc()" [attr.aria-label]="'Aumentar ' + label()">
      <app-icon name="plus" [size]="14" [stroke]="2.5" />
    </button>
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 4px; background: var(--bg); border-radius: 999px; padding: 3px; }
    .b { width: 30px; height: 30px; border-radius: 50%; border: 0; display: grid; place-items: center; cursor: pointer; }
    .minus { background: #fff; color: var(--ink); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
    .plus { background: var(--ink); color: #fff; }
    .v { min-width: 20px; text-align: center; font-weight: 600; font-size: 14px; font-variant-numeric: tabular-nums; }
  `,
})
export class Stepper {
  readonly value = input.required<number>();
  readonly label = input('');
  readonly trashAtOne = input(true);
  readonly step = output<number>();
  inc() { this.step.emit(1); }
  dec() { this.step.emit(-1); }
}
