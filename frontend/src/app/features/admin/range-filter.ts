import { Component, computed, input, output } from '@angular/core';
import { localDate } from '../../core/storage';

export interface DateRange { from: string; to: string; }

function shift(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localDate(d);
}

/** Atalhos de período + intervalo personalizado. */
@Component({
  selector: 'app-range-filter',
  template: `
    <div class="wrap">
      <div class="chips">
        @for (p of presets; track p.key) {
          <button class="chip" [class.active]="active() === p.key" (click)="changed.emit(p.range())">{{ p.label }}</button>
        }
      </div>
      <div class="custom">
        <input class="input" type="date" [value]="value().from" [max]="value().to" (change)="set('from', $any($event.target).value)" aria-label="De" />
        <span class="muted">até</span>
        <input class="input" type="date" [value]="value().to" [min]="value().from" (change)="set('to', $any($event.target).value)" aria-label="Até" />
      </div>
    </div>
  `,
  styles: `
    .wrap { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .custom { display: flex; align-items: center; gap: 8px; }
    .custom .input { height: 36px; width: 150px; font-size: 13px; padding: 0 10px; border-radius: 999px; }
  `,
})
export class RangeFilter {
  readonly value = input.required<DateRange>();
  readonly changed = output<DateRange>();

  protected presets = [
    { key: 'today', label: 'Hoje', range: () => ({ from: localDate(), to: localDate() }) },
    { key: 'yesterday', label: 'Ontem', range: () => ({ from: shift(-1), to: shift(-1) }) },
    { key: '7d', label: '7 dias', range: () => ({ from: shift(-6), to: localDate() }) },
    { key: '30d', label: '30 dias', range: () => ({ from: shift(-29), to: localDate() }) },
  ];

  protected active = computed(() => {
    const v = this.value();
    return this.presets.find(p => { const r = p.range(); return r.from === v.from && r.to === v.to; })?.key ?? null;
  });

  set(which: 'from' | 'to', val: string) {
    if (!val) return;
    const next = { ...this.value(), [which]: val };
    if (next.from > next.to) next[which === 'from' ? 'to' : 'from'] = val;
    this.changed.emit(next);
  }
}
