import { h } from './dom';

/**
 * Свои подсказки вместо нативного `title`: один слой на кадр, появление мгновенное,
 * текст из `data-tip`, заголовок из `data-tip-title`. Слой живёт внутри кадра #app,
 * поэтому масштаб кадра (transform: scale в main.ts) на него действует сам собой,
 * а координаты элементов пересчитываются из экранных в кадровые делением на масштаб.
 */

const FRAME_W = 960;
const FRAME_H = 540;
const GAP = 6;

let root: HTMLElement | null = null;
let layer: HTMLElement | null = null;
let current: Element | null = null;

function tipOf(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest('[data-tip]') : null;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function show(t: Element): void {
  if (!root || !layer) return;
  const text = t.getAttribute('data-tip') ?? '';
  const title = t.getAttribute('data-tip-title');
  if (!text && !title) return;
  current = t;
  const parts: HTMLElement[] = [];
  if (title) parts.push(h('div', { class: 'tip-title' }, title));
  if (text) parts.push(h('div', { class: 'tip-text' }, text));
  layer.replaceChildren(...parts);
  // Перерисовка экрана сносит слой вместе с остальным — возвращаем его на место при первом показе.
  if (!layer.isConnected) root.appendChild(layer);
  layer.hidden = false;
  const rr = root.getBoundingClientRect();
  const scale = rr.width / FRAME_W || 1;
  const tr = t.getBoundingClientRect();
  const left = (tr.left - rr.left) / scale;
  const top = (tr.top - rr.top) / scale;
  const w = tr.width / scale;
  const hgt = tr.height / scale;
  // offsetWidth не учитывает transform — это уже кадровые пиксели.
  const tw = layer.offsetWidth;
  const th = layer.offsetHeight;
  const x = clamp(left + w / 2 - tw / 2, 4, FRAME_W - tw - 4);
  let y = top + hgt + GAP;
  if (y + th > FRAME_H - 4) y = top - th - GAP;
  if (y < 4) y = 4;
  layer.style.left = `${Math.round(x)}px`;
  layer.style.top = `${Math.round(y)}px`;
}

export function hideTooltip(): void {
  current = null;
  if (layer) layer.hidden = true;
}

export function installTooltips(el: HTMLElement): void {
  root = el;
  layer = h('div', { class: 'tip-layer', hidden: true });
  el.addEventListener('mouseover', (ev) => {
    const t = tipOf(ev.target);
    if (!t) return;
    if (t !== current) show(t);
  });
  el.addEventListener('mouseout', (ev) => {
    const t = tipOf(ev.target);
    if (!t || t !== current) return;
    const to = ev.relatedTarget;
    if (to instanceof Node && t.contains(to)) return;
    hideTooltip();
  });
  // Сенсорный экран: наведения нет, подсказка открывается касанием и закрывается следующим.
  el.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType !== 'touch') return;
    const t = tipOf(ev.target);
    if (!t || t === current) hideTooltip();
    else show(t);
  });
}
