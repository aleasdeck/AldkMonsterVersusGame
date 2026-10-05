import { describe, expect, it } from 'vitest';
import { RING_CELL, ringCells, ringSize } from '../src/ui/targetMark';
import { MOB_MODELS, mobMetrics } from '../src/ui/mobs';

// Кольцо подсветки цели: клетки лепки, замкнутое, симметричное — по нему глаз находит цель, рваное или кривое кольцо читается как мусор на полу.
describe('кольцо подсветки цели', () => {
  it('размер — целые клетки и плоский эллипс у любого врага', () => {
    for (const id of Object.keys(MOB_MODELS)) {
      const m = mobMetrics(id);
      const { w, h } = ringSize(m.w - m.left - m.right);
      expect(w % RING_CELL, id).toBe(0);
      expect(h % RING_CELL, id).toBe(0);
      expect(h, id).toBeLessThan(w);
      expect(h, id).toBeGreaterThanOrEqual(16);
      expect(h, id).toBeLessThanOrEqual(22);
    }
  });

  it('кольцо замкнуто и симметрично, середина пуста', () => {
    for (const bodyW of [40, 80, 140, 220]) {
      const { w, h } = ringSize(bodyW);
      const cw = w / RING_CELL, ch = h / RING_CELL;
      const c = ringCells(cw, ch);
      const at = (i: number, j: number): number => c[j * cw + i];
      for (let j = 0; j < ch; j++) {
        for (let i = 0; i < cw; i++) {
          expect(at(i, j), `${bodyW}: ${i},${j}`).toBe(at(cw - 1 - i, j));
          expect(at(i, j), `${bodyW}: ${i},${j}`).toBe(at(i, ch - 1 - j));
        }
      }
      // В каждом столбце — клетка сверху и снизу, в средней строке — слева и справа: без дыр по краю.
      for (let i = 0; i < cw; i++) expect([...Array(ch).keys()].some((j) => at(i, j)), `${bodyW}: столбец ${i}`).toBe(true);
      expect(at(0, Math.floor(ch / 2))).toBe(1);
      expect(at(Math.floor(cw / 2), Math.floor(ch / 2))).toBe(0);
      // Одна связная линия по восьми соседям: обход от первой клетки находит все.
      const cells = [...c.keys()].filter((k) => c[k]);
      const seen = new Set([cells[0]]);
      for (const q = [cells[0]]; q.length; ) {
        const k = q.pop()!;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const i = (k % cw) + di, j = Math.floor(k / cw) + dj, n = j * cw + i;
          if (i >= 0 && j >= 0 && i < cw && j < ch && c[n] && !seen.has(n)) (seen.add(n), q.push(n));
        }
      }
      expect(seen.size, `${bodyW}: связность`).toBe(cells.length);
    }
  });
});
