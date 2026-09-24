import { describe, expect, it } from 'vitest';
import { renderSheet, type Sheet } from '../src/ui/mobs/pixel';
import { MOB_STYLES } from '../src/ui/mobs/styles';
import { FOREST_MODELS } from '../src/ui/mobs/forest';
import { ENEMY_LIST } from '../src/data/enemies';
import { ENEMY_BODY_HEIGHT } from '../src/data/characterSizes';

/** Последняя строка кадра, где есть непрозрачный пиксель (тень на земле полупрозрачна и не считается). */
function lowestRow(sheet: Sheet, f: Uint8ClampedArray): number {
  for (let j = sheet.h - 1; j >= 0; j--) {
    for (let i = 0; i < sheet.w; i++) if (f[(j * sheet.w + i) * 4 + 3] === 255) return j;
  }
  return -1;
}

/** Отпечаток кадра (FNV-1a): сравнить кадры без Buffer — в tsconfig нет типов Node. */
function print(f: Uint8ClampedArray): number {
  let h = 0x811c9dc5;
  for (let k = 0; k < f.length; k++) h = Math.imul(h ^ f[k], 16777619);
  return h >>> 0;
}

describe('пиксельная лепка (прототип v0.52)', () => {
  it('у каждого врага Леса есть модель, лишних моделей нет', () => {
    const forest = ENEMY_LIST.filter((e) => e.location === 'forest').map((e) => e.id).sort();
    expect(Object.keys(FOREST_MODELS).sort()).toEqual(forest);
  });

  for (const sid of ['a', 'b'] as const) {
    it(`вариант ${sid}: кадры цикла непустые, враг стоит на земле, рост по таблице`, () => {
      const st = MOB_STYLES[sid];
      for (const [id, model] of Object.entries(FOREST_MODELS)) {
        const sh = renderSheet(model, st);
        expect(sh.frames, id).toHaveLength(st.frames);
        const ground = sh.h - sh.foot;
        for (const f of sh.frames) {
          let opaque = 0;
          for (let k = 3; k < f.length; k += 4) if (f[k] === 255) opaque++;
          expect(opaque, id).toBeGreaterThan(40);
          // Ступни на линии земли (контур может уйти на пиксель ниже); мышь парит над полом по замыслу.
          if (id !== 'bat') expect(Math.abs(lowestRow(sh, f) + 1 - ground), id).toBeLessThanOrEqual(2);
        }
        // Рост от макушки до земли — как в ENEMY_BODY_HEIGHT. Крыса длинная и низкая (по «массе» как прежний
        // квадратный спрайт), у мыши в рамку входит просвет до пола — у обеих рост свой.
        if (id !== 'rat' && id !== 'bat') {
          const body = (ground - sh.top) * sh.d;
          expect(Math.abs(body - ENEMY_BODY_HEIGHT[id]) / ENEMY_BODY_HEIGHT[id], `${id}: ${body}`).toBeLessThan(0.12);
        }
      }
    });
  }

  it('рисунок детерминирован: та же модель — те же пиксели, без Math.random', () => {
    const a = renderSheet(FOREST_MODELS.wolf, MOB_STYLES.c);
    const b = renderSheet(FOREST_MODELS.wolf, MOB_STYLES.c);
    expect(a.frames).toHaveLength(MOB_STYLES.c.frames);
    for (let f = 0; f < a.frames.length; f += 7) expect(print(a.frames[f])).toBe(print(b.frames[f]));
  });

  it('покой живой: больше половины кадров цикла различаются', () => {
    const sh = renderSheet(FOREST_MODELS.goblin_shaman, MOB_STYLES.b);
    const distinct = new Set(sh.frames.map(print));
    expect(distinct.size).toBeGreaterThan(sh.frames.length / 2);
  });
});
