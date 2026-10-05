import { canvasUrl } from './preload';

/**
 * Кольцо подсветки цели (решение пользователя — вариант «Круг» из пяти, вместо рамки вокруг колонки врага): эллипс на земле
 * под ногами клетками лепки, а не гладкой рамкой CSS — гладкий овал рядом с пиксельной фигурой смотрится наклейкой
 * из другой игры. Размер и клетки считаются без DOM (tests/targetMark.test.ts), картинки — по размеру один раз.
 */

/** Клетка кольца в пикселях поля — та же, что у лепки врагов (MOB_STYLE, пиксель 2). */
export const RING_CELL = 2;

const even = (v: number): number => Math.round(v / RING_CELL) * RING_CELL;

/** Ширина и высота кольца по ширине тела: чуть уже фигуры и с запасом на тонких; плоское, как тень на полу. */
export function ringSize(bodyW: number): { w: number; h: number } {
  const w = even(bodyW * 0.9 + 28);
  return { w, h: even(Math.max(16, Math.min(22, w * 0.2))) };
}

/**
 * Клетки кольца `cw`×`ch` строками: 1 — край эллипса. Край берётся дважды — крайние клетки каждого столбца и каждой строки,
 * как рисуют эллипс от руки: кольцо «между двумя эллипсами» рвалось на крутых боках маленьких колец (пропадал столбец).
 */
export function ringCells(cw: number, ch: number): Uint8Array {
  const out = new Uint8Array(cw * ch);
  const a = cw / 2, b = ch / 2;
  const inside = (i: number, j: number): boolean => ((i + 0.5 - a) / a) ** 2 + ((j + 0.5 - b) / b) ** 2 <= 1;
  for (let i = 0; i < cw; i++) {
    let top = -1, bottom = -1;
    for (let j = 0; j < ch; j++) {
      if (!inside(i, j)) continue;
      if (top < 0) top = j;
      bottom = j;
    }
    if (top >= 0) out[top * cw + i] = out[bottom * cw + i] = 1;
  }
  for (let j = 0; j < ch; j++) {
    let left = -1, right = -1;
    for (let i = 0; i < cw; i++) {
      if (!inside(i, j)) continue;
      if (left < 0) left = i;
      right = i;
    }
    if (left >= 0) out[j * cw + left] = out[j * cw + right] = 1;
  }
  return out;
}

const urls = new Map<string, string>();

/** Картинка кольца цветом `color` в клетку на пиксель: CSS растягивает её на `w`×`h` без сглаживания. */
export function ringUrl(w: number, h: number, color: string): string {
  const key = `${w}x${h}:${color}`;
  const hit = urls.get(key);
  if (hit) return hit;
  const cw = w / RING_CELL, ch = h / RING_CELL;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    const cells = ringCells(cw, ch);
    for (let k = 0; k < cells.length; k++) if (cells[k]) ctx.fillRect(k % cw, Math.floor(k / cw), 1, 1);
  }
  const url = canvasUrl(canvas);
  urls.set(key, url);
  return url;
}

/** Тусклое кольцо досягаемого и золотое — цели. */
export const RING_COLORS = { ok: '#e8dfc4a0', target: '#ffd166' };

/** Переменные кольца для метки цели `.tmark`: размер и обе картинки. */
export function ringVars(bodyW: number): string {
  const { w, h } = ringSize(bodyW);
  return `--ring-w:${w}px;--ring-h:${h}px;--ring-ok:url(${ringUrl(w, h, RING_COLORS.ok)});--ring-target:url(${ringUrl(w, h, RING_COLORS.target)})`;
}
