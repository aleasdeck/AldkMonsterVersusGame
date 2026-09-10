import { h, type Child } from './dom';
import { findEnemy, previewOnTarget, rangeText, type DamageRange } from '../engine/combat';
import { markKeywords } from './keywords';
import type { App } from './app';

/**
 * Ридаут над плитками и предпросмотр урона на полоске цели. Наведение пишет текст и ширину штриховки
 * прямо в готовые узлы и ничего не сохраняет в App: любое действие всё равно перерисует экран
 * и вернёт согласованный вид. Иначе каждое движение мыши пересобирало бы сотни узлов.
 */

export interface PreviewSpec {
  title: string;
  /** Части через « · »: цена, число, перезарядка. */
  parts: Child[];
  /** Причина недоступности — красным хвостом. */
  err?: string | null;
  /** Цель и разброс урона: полоска цели получает штриховку, ридаут — хвост «останется N HP». */
  target?: number;
  range?: DamageRange;
  kind?: 'hit' | 'spell';
}

function readoutNode(app: App): HTMLElement | null {
  return app.root.querySelector<HTMLElement>('.readout');
}

/** Ридаут в покое: выбранная цель, её HP и блок; во время хода врагов и после боя — состояние боя. */
export function defaultReadout(app: App): Child[] {
  const b = app.run?.battle;
  if (!b) return [];
  if (b.phase === 'won')
    return b.fled ? [h('b', null, 'Вор ушёл.'), ' Добыча уплыла вместе с ним.'] : [h('b', null, 'Победа!'), ' Заберите награду.'];
  if (b.phase === 'lost') return [h('b', null, 'Герой пал.')];
  if (b.phase === 'enemy' || app.busy) return ['Ход врагов…'];
  const e = findEnemy(b, app.currentTarget());
  if (!e) return ['Нет цели'];
  return [h('span', { class: 'dim' }, 'Цель: '), h('b', null, e.name), ` · ${e.hp}/${e.maxHp} HP`, e.block > 0 ? ` · блок ${e.block}` : '', h('span', { class: 'dim' }, ' · наведи на приём'), ''];
}

function joinParts(parts: Child[]): Child[] {
  const out: Child[] = [];
  parts.forEach((p, i) => {
    if (p === null || p === undefined || p === false || p === '') return;
    if (out.length > 0 || i > 0) out.push(' · ');
    out.push(p);
  });
  return out;
}

function clearGhosts(app: App): void {
  for (const g of app.root.querySelectorAll('.bar-ghost')) g.remove();
  for (const e of app.root.querySelectorAll('.enemy.preview')) e.classList.remove('preview');
}

export function showPreview(app: App, spec: PreviewSpec): void {
  const readout = readoutNode(app);
  const b = app.run?.battle;
  if (!readout || !b) return;
  const parts = joinParts(spec.parts);
  const children: Child[] = [h('b', null, spec.title), parts.length ? ' · ' : '', ...parts.map((c) => (typeof c === 'string' ? markKeywords(c) : [c])).flat()];
  clearGhosts(app);
  const e = spec.target !== undefined ? findEnemy(b, spec.target) : undefined;
  if (e && spec.range) {
    const left = previewOnTarget(b, e, spec.range, spec.kind);
    const tail = left.max === 0 ? 'погибнет' : `останется ${rangeText(left)} HP`;
    children.push(' · ', h('span', { class: 'readout-target' }, `${e.name}: ${tail}`));
    const bar = app.root.querySelector<HTMLElement>(`.enemy[data-uid="${e.uid}"] .bar-hp`);
    if (bar && e.maxHp > 0) {
      // Штриховка от остатка до текущего HP: светлая — что снимет максимум, плотная — что снимет наверняка.
      const pct = (v: number) => (v / e.maxHp) * 100;
      bar.appendChild(h('div', { class: 'bar-ghost max', style: `left:${pct(left.min)}%;width:${pct(e.hp - left.min)}%` }));
      bar.appendChild(h('div', { class: 'bar-ghost min', style: `left:${pct(left.max)}%;width:${pct(e.hp - left.max)}%` }));
    }
    bar?.closest('.enemy')?.classList.add('preview');
  }
  if (spec.err) children.push(' ', h('span', { class: 'readout-err' }, `— ${spec.err}`));
  readout.replaceChildren(...children.filter((c): c is Node | string => c !== null && c !== undefined && c !== false).map((c) => (typeof c === 'string' ? document.createTextNode(c) : c)));
}

export function clearPreview(app: App): void {
  const readout = readoutNode(app);
  if (!readout) return;
  clearGhosts(app);
  readout.replaceChildren(...defaultReadout(app).filter((c): c is Node | string => !!c).map((c) => (typeof c === 'string' ? document.createTextNode(c) : c)));
}

/** Навесить предпросмотр на элемент: вход — показать, выход — вернуть покой. */
export function bindPreview(app: App, el: HTMLElement, spec: () => PreviewSpec): HTMLElement {
  el.addEventListener('mouseenter', () => showPreview(app, spec()));
  el.addEventListener('mouseleave', () => clearPreview(app));
  return el;
}
