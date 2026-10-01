import { describe, expect, it } from 'vitest';
import { renderTake, takeSeconds } from '../src/ui/sfx/render';
import { SFX, SFX_GROUPS, SFX_LIST, sfxTake } from '../src/ui/sfx/sounds';

/** Тест рендерит на 11 кГц ради скорости: он проверяет, что звук собирается, а не как звучит. */
const SR = 11025;

describe('звуки действий: каталог', () => {
  it('у каждой группы есть звуки, id уникальны', () => {
    expect(new Set(SFX_LIST.map((d) => d.id)).size).toBe(SFX_LIST.length);
    for (const g of SFX_GROUPS) expect(SFX_LIST.some((d) => d.group === g.id), g.id).toBe(true);
  });

  it('варианты: ключи уникальны, рекомендация среди них, надстройка ссылается на звук', () => {
    for (const d of SFX_LIST) {
      const keys = d.variants.map((v) => v.key);
      expect(keys.length, d.id).toBeGreaterThan(0);
      expect(new Set(keys).size, d.id).toBe(keys.length);
      expect(d.uses.length, d.id).toBeGreaterThan(0);
      if (keys.length > 1) {
        expect(d.rec && keys.includes(d.rec), `${d.id}: рекомендация`).toBeTruthy();
        expect(d.why, `${d.id}: почему`).toBeTruthy();
      }
      if (d.over) expect(SFX[d.over], `${d.id}: поверх ${d.over}`).toBeDefined();
    }
  });
});

describe('звуки действий: рендер', () => {
  it('каждый вариант звучит: не тишина, без не-чисел, пик не выше единицы, короче 7 с', () => {
    const bad: string[] = [];
    for (const d of SFX_LIST)
      for (const v of d.variants) {
        const { take, room } = sfxTake(d, v.key);
        expect(takeSeconds(take), `${d.id}-${v.key}`).toBeLessThan(7);
        const r = renderTake(d.id, take, room, d.level ?? 0, SR);
        let peak = 0;
        let nan = 0;
        for (let i = 0; i < r.left.length; i++) {
          if (!Number.isFinite(r.left[i]) || !Number.isFinite(r.right[i])) nan++;
          peak = Math.max(peak, Math.abs(r.left[i]), Math.abs(r.right[i]));
        }
        if (nan || peak < 0.01 || peak > 1) bad.push(`${d.id}-${v.key}: пик ${peak.toFixed(3)}, не чисел ${nan}`);
      }
    expect(bad).toEqual([]);
  });

  it('детерминизм: тот же звук — те же отсчёты', () => {
    for (const id of ['hit_blade', 'fire', 'gold']) {
      const d = SFX[id];
      const a = renderTake(d.id, sfxTake(d).take, sfxTake(d).room, 0, SR);
      const b = renderTake(d.id, sfxTake(d).take, sfxTake(d).room, 0, SR);
      expect(a.left.length).toBe(b.left.length);
      let diff = 0;
      for (let i = 0; i < a.left.length; i++) if (a.left[i] !== b.left[i] || a.right[i] !== b.right[i]) diff++;
      expect(diff, id).toBe(0);
    }
  });

  it('надстройка звучит вместе с основой: крит длиннее себя самого на замах клинка', () => {
    const crit = SFX.crit;
    expect(takeSeconds(sfxTake(crit).take)).toBeGreaterThan(takeSeconds(sfxTake(crit, undefined, true).take));
  });
});
