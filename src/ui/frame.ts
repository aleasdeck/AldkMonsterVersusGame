import { h } from './dom';
import { topbar } from './topbar';
import { consoleBar, type ConsoleParts } from './console';
import type { App } from './app';

export interface FrameParts extends ConsoleParts {
  /** Класс экрана: `battle`, `reward`… */
  cls: string;
  /** Полоса 320 px между топбаром и консолью: поле боя или содержимое хаба. */
  center: HTMLElement;
  /** Модалки и плашки поверх кадра. */
  overlays?: (HTMLElement | null)[];
}

/**
 * Обёртка экрана забега: топбар 40 + центр 320 + консоль 180. Все шесть экранов забега
 * зовут её вместо своей разметки, поэтому топбар и блок героя везде одинаковы.
 */
export function runFrame(app: App, parts: FrameParts): HTMLElement {
  const el = h('div', { class: `screen run ${parts.cls}` }, topbar(app), h('div', { class: 'run-center' }, parts.center), consoleBar(app, parts));
  for (const o of parts.overlays ?? []) if (o) el.appendChild(o);
  return el;
}
