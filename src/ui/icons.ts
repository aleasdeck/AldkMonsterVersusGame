import type { StatusId } from '../engine/types';
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
};

export const STATUS_COLORS: Record<StatusId, string> = {
  strength: '#f9a825',
  weak: '#b388ff',
  bleed: '#e63946',
  burn: '#ff7b00',
  stun: '#e0e0e0',
  exhaust: '#b388ff',
  dodge: '#ffd166',
  thorns: '#c0c0c0',
  regen: '#80ed99',
  invuln: '#ffd166',
};

const OUTLINE = '#0b0b12';
const cache = new Map<string, string>();

/** Иконка 10×10: шаблон 8×8 с полем в 1 пиксель под контур. */
export function statusIconUrl(id: StatusId): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const rows = TEMPLATES[id];
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && y < 8 && x < 8 && rows[y][x] === '#';
  const url = drawGrid(10, 10, (gx, gy) => {
    const x = gx - 1;
    const y = gy - 1;
    if (filled(x, y)) return STATUS_COLORS[id];
    const near = filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1);
    return near ? OUTLINE : null;
  });
  cache.set(id, url);
  return url;
}

export function statusIcon(id: StatusId, px = 20): HTMLImageElement {
  const img = document.createElement('img');
  img.src = statusIconUrl(id);
  img.width = px;
  img.height = px;
  img.className = 'sprite status-icon';
  img.alt = id;
  img.draggable = false;
  return img;
}
