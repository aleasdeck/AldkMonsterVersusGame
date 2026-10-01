import { describe, expect, it } from 'vitest';
import { renderTake, takeSeconds } from '../src/ui/sfx/render';
import { renderOrder, SFX, SFX_GROUPS, SFX_LIST, sfxTake } from '../src/ui/sfx/sounds';
import { cueFlip, enemyActionCue, eventCue, shotCue } from '../src/ui/sfx/cues';
import { ENEMY_LIST, enemyDef } from '../src/data/enemies';

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

describe('звуки действий: что у какого действия', () => {
  it('порядок рендера — все звуки каталога, каждый один раз', () => {
    const order = renderOrder();
    expect(new Set(order).size).toBe(order.length);
    expect([...order].sort()).toEqual(SFX_LIST.map((d) => d.id).sort());
  });

  it('у каждого приёма врага звук из каталога (или звук его статуса)', () => {
    const bad: string[] = [];
    for (const e of ENEMY_LIST)
      for (const a of e.actions) {
        const cue = enemyActionCue(a);
        if (cue && !SFX[cue.id]) bad.push(`${e.id}:${a.name} → ${cue.id}`);
      }
    expect(bad).toEqual([]);
    const wolf = enemyDef('wolf').actions.find((a) => a.effects.some((x) => x.type === 'attack'))!;
    expect(enemyActionCue(wolf)).toEqual({ id: 'enemy_strike', strike: true, flip: false });
    const arrow = enemyDef('skeleton_archer').actions.find((a) => a.fx?.kind === 'arrow')!;
    expect(enemyActionCue(arrow)?.flip).toBe(true);
  });

  it('снаряды и события боя звучат звуками каталога', () => {
    for (const kind of ['melee', 'arrow', 'orb', 'flask'] as const)
      for (const sculpt of [undefined, 'fire', 'ice', 'bolt', 'stone'] as const) expect(SFX[shotCue({ kind, sculpt }, 'sword')], `${kind}/${sculpt}`).toBeDefined();
    expect(shotCue({ kind: 'melee' }, 'mace')).toBe('hit_blunt');
    expect(shotCue({ kind: 'melee' }, 'bow')).toBe('hit_blade');
    const statuses = ['bleed', 'burn', 'poison', 'stun', 'cold', 'frozen', 'weak', 'vulnerable', 'exhaust', 'decay', 'strength'] as const;
    for (const status of statuses) {
      const id = eventCue({ type: 'status', target: 1, status, value: 1 }, false);
      if (id) expect(SFX[id], status).toBeDefined();
    }
    expect(eventCue({ type: 'damage', target: 'hero', amount: 3, kind: 'blocked' }, true)).toBe('block_hit');
    expect(eventCue({ type: 'damage', target: 'hero', amount: 3, kind: 'hit' }, true)).toBe('hurt_hero');
    expect(eventCue({ type: 'damage', target: 2, amount: 3, kind: 'hit' }, false)).toBeNull();
    expect(eventCue({ type: 'damage', target: 2, amount: 3, kind: 'crit' }, false)).toBe('crit');
    expect(eventCue({ type: 'death', target: 2 }, false, true)).toBe('boss_death');
    expect(cueFlip('block_hit', 2)).toBe(true);
    expect(cueFlip('crit', 'hero')).toBe(true);
    expect(cueFlip('hurt_hero', 'hero')).toBe(false);
  });
});
