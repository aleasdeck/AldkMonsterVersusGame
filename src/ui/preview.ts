import { h, type Child } from './dom';
import { findEnemy, previewOnTarget, rangeText, type DamageRange } from '../engine/combat';
import { markKeywords } from './keywords';
import type { App } from './app';

/**
 * Ридаут над плитками, подсветка досягаемых врагов и предпросмотр урона на полоске цели. Наведение пишет текст,
 * классы и ширину штриховки прямо в готовые узлы и ничего не сохраняет в App: любое действие всё равно перерисует
 * экран и вернёт согласованный вид. Иначе каждое движение мыши пересобирало бы сотни узлов.
 * Покой зависит от выбранного приёма (`app.armed`, v0.26): его цели подсвечены, ридаут ждёт цель.
 */

export interface PreviewSpec {
  title: string;
  /** Части через « · »: цена, число, перезарядка. */
  parts: Child[];
  /** Причина недоступности — красным хвостом. */
  err?: string | null;
  /** Кого приём достанет: рамка у них, остальные тускнеют. Без поля подсветка врагов не трогается. */
  targets?: number[];
  /** Цель и разброс урона: полоска цели получает штриховку, ридаут — хвост «останется N HP». */
  target?: number;
  range?: DamageRange;
  kind?: 'hit' | 'spell';
}

function readoutNode(app: App): HTMLElement | null {
  return app.root.querySelector<HTMLElement>('.readout');
}

/** Ридаут в покое: выбранный приём ждёт цель, без приёма — подсказка; во время хода врагов и после боя — состояние боя. */
export function defaultReadout(app: App): Child[] {
  const b = app.run?.battle;
  if (!b) return [];
  if (b.phase === 'won') return [h('b', null, 'Победа!'), ' Заберите награду.'];
  if (b.phase === 'lost') return [h('b', null, 'Герой пал.')];
  if (b.phase === 'enemy' || app.busy) return ['Ход врагов…'];
  const armed = app.armedInfo();
  if (armed) return [h('b', null, armed.name), h('span', { class: 'readout-target' }, ' · выберите цель'), ` · ${armed.reach}`, h('span', { class: 'dim' }, ' · Enter — первая цель, Esc — отмена')];
  return [h('span', { class: 'dim' }, 'Выберите приём: плитка или 1–9, потом цель')];
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

/** Рамка досягаемым, тусклость остальным; null — снять подсветку совсем. */
export function paintTargets(app: App, targets: number[] | null): void {
  for (const el of app.root.querySelectorAll<HTMLElement>('.enemy')) {
    const uid = Number(el.dataset.uid);
    el.classList.toggle('ok', !!targets && targets.includes(uid));
    el.classList.toggle('far', !!targets && !targets.includes(uid));
  }
}

export function showPreview(app: App, spec: PreviewSpec): void {
  const readout = readoutNode(app);
  const b = app.run?.battle;
  if (!readout || !b) return;
  const parts = joinParts(spec.parts);
  const children: Child[] = [h('b', null, spec.title), parts.length ? ' · ' : '', ...parts.map((c) => (typeof c === 'string' ? markKeywords(c) : [c])).flat()];
  clearGhosts(app);
  if (spec.targets) paintTargets(app, spec.targets);
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

/** Вернуть покой: ридаут по выбранному приёму, подсветка — его целей, штриховки нет. */
export function clearPreview(app: App): void {
  const readout = readoutNode(app);
  if (!readout) return;
  clearGhosts(app);
  paintTargets(app, app.armedTargets());
  readout.replaceChildren(...defaultReadout(app).filter((c): c is Node | string => !!c).map((c) => (typeof c === 'string' ? document.createTextNode(c) : c)));
}

/** Навесить предпросмотр на элемент: вход — показать, выход — вернуть покой. */
export function bindPreview(app: App, el: HTMLElement, spec: () => PreviewSpec): HTMLElement {
  el.addEventListener('mouseenter', () => showPreview(app, spec()));
  el.addEventListener('mouseleave', () => clearPreview(app));
  return el;
}
