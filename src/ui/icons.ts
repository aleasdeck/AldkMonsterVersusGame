import type { StatusId } from '../engine/types';
import type { ActionMark } from '../engine/combat';
import { drawGrid } from './sprites';

/** Пиксельные иконки статусов 8×8: # — цвет статуса, . — пусто. Контур добавляется автоматически. */
const TEMPLATES: Record<StatusId, string[]> = {
  strength: [
    '...##...',
    '..####..',
    '.######.',
    '###..###',
    '...##...',
    '...##...',
    '...##...',
    '...##...',
  ],
  weak: [
    '...##...',
    '...##...',
    '...##...',
    '...##...',
    '###..###',
    '.######.',
    '..####..',
    '...##...',
  ],
  bleed: [
    '...#....',
    '...##...',
    '..####..',
    '..####..',
    '.######.',
    '.######.',
    '..####..',
    '...##...',
  ],
  burn: [
    '....#...',
    '...##...',
    '..###...',
    '..####..',
    '.#####..',
    '.######.',
    '..####..',
    '...##...',
  ],
  stun: [
    '..####..',
    '.#....#.',
    '#..##..#',
    '#.#..#.#',
    '#.#.##.#',
    '#..#...#',
    '.#....#.',
    '..####..',
  ],
  exhaust: [
    '.######.',
    '..####..',
    '...##...',
    '...##...',
    '..#..#..',
    '.#....#.',
    '.######.',
    '........',
  ],
  dodge: [
    '........',
    '.####...',
    '........',
    '...####.',
    '........',
    '.####...',
    '........',
    '........',
  ],
  thorns: [
    '...#....',
    '.#.#.#..',
    '..###...',
    '#######.',
    '..###...',
    '.#.#.#..',
    '...#....',
    '........',
  ],
  regen: [
    '........',
    '...##...',
    '...##...',
    '.######.',
    '.######.',
    '...##...',
    '...##...',
    '........',
  ],
  invuln: [
    '.######.',
    '.######.',
    '.######.',
    '.######.',
    '..####..',
    '..####..',
    '...##...',
    '........',
  ],
  poison: [
    '...##...',
    '...##...',
    '..####..',
    '.##..##.',
    '.#.##.#.',
    '.##..##.',
    '..####..',
    '........',
  ],
  stealth: [
    '........',
    '..####..',
    '.#....#.',
    '#..##..#',
    '#..##..#',
    '.#....#.',
    '..####..',
    '........',
  ],
  vulnerable: [
    '........',
    '...##...',
    '..#..#..',
    '.#....#.',
    '.#....#.',
    '..#..#..',
    '...##...',
    '........',
  ],
  // Череп: пустые глазницы и зубы — метка врага с эффектом при смерти.
  doom: [
    '........',
    '..####..',
    '.######.',
    '##.##.##',
    '########',
    '.######.',
    '.#.##.#.',
    '..####..',
  ],
  enchant: [
    '...#....',
    '..###...',
    '.#####..',
    '..###...',
    '...#....',
    '....#...',
    '.....#..',
    '......#.',
  ],
  echo: [
    '..#..#..',
    '.#..#...',
    '#..#..#.',
    '#..#..#.',
    '#..#..#.',
    '#..#..#.',
    '.#..#...',
    '..#..#..',
  ],
  evade: [
    '........',
    '..##....',
    '.##.##..',
    '##...##.',
    '.....##.',
    '...####.',
    '..##....',
    '........',
  ],
};

/**
 * Иконки свойств удара врага (v0.40.2): пробитый щит — блок не спасёт, клыки — враг вылечится от удара.
 * Те же 8×8, что у статусов, но живут отдельно: это не статус на бойце, а пометка на пилюле намерения.
 */
const MARK_TEMPLATES: Record<ActionMark, string[]> = {
  // Щит с трещиной поперёк: пробитие брони.
  pierce: [
    '########',
    '###..###',
    '##..#.##',
    '##.#..##',
    '###..###',
    '.##..##.',
    '..####..',
    '...##...',
  ],
  // Два клыка и капля под ними: вампиризм. Челюсти-перекладины над клыками нет намеренно — с ней контур
  // смыкает промежуток, и силуэт читается как арка, а не как зубы (перебрано пять вариантов).
  drain: [
    '##....##',
    '###..###',
    '.##..##.',
    '.##..##.',
    '..#..#..',
    '........',
    '...##...',
    '...##...',
  ],
};

export const MARK_COLORS: Record<ActionMark, string> = {
  pierce: '#ff6b6b',
  drain: '#e63946',
};

export const STATUS_COLORS: Record<StatusId, string> = {
  strength: '#f9a825',
  weak: '#b388ff',
  bleed: '#e63946',
  burn: '#ff7b00',
  stun: '#e0e0e0',
  exhaust: '#b388ff',
  dodge: '#ffd166',
  evade: '#7ddc5a',
  thorns: '#c0c0c0',
  regen: '#80ed99',
  invuln: '#ffd166',
  poison: '#7ddc5a',
  stealth: '#9aa6c8',
  vulnerable: '#ff6b6b',
  doom: '#d264ff',
  echo: '#5cf0ff',
  enchant: '#b388ff',
};

const OUTLINE = '#0b0b12';
const cache = new Map<string, string>();

/** Иконка 10×10: шаблон 8×8 с полем в 1 пиксель под контур. */
function iconUrl(key: string, rows: string[], color: string): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && y < 8 && x < 8 && rows[y][x] === '#';
  const url = drawGrid(10, 10, (gx, gy) => {
    const x = gx - 1;
    const y = gy - 1;
    if (filled(x, y)) return color;
    const near = filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1);
    return near ? OUTLINE : null;
  });
  cache.set(key, url);
  return url;
}

export function statusIconUrl(id: StatusId): string {
  return iconUrl(id, TEMPLATES[id], STATUS_COLORS[id]);
}

export function markIconUrl(id: ActionMark): string {
  return iconUrl(`mark:${id}`, MARK_TEMPLATES[id], MARK_COLORS[id]);
}

function iconImg(src: string, alt: string, px: number): HTMLImageElement {
  const img = document.createElement('img');
  img.src = src;
  img.width = px;
  img.height = px;
  img.className = 'sprite status-icon';
  img.alt = alt;
  img.draggable = false;
  return img;
}

export function statusIcon(id: StatusId, px = 20): HTMLImageElement {
  return iconImg(statusIconUrl(id), id, px);
}

/** Иконка свойства удара: пробитый щит («сквозь блок») или клыки («вампиризм»). */
export function markIcon(id: ActionMark, px = 20): HTMLImageElement {
  return iconImg(markIconUrl(id), id, px);
}
