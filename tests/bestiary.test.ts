import { describe, expect, it } from 'vitest';
import { ENEMY_LIST, enemyDef } from '../src/data/enemies';
import { LOCATIONS } from '../src/data/locations';
import { BASE_SCALE, describeAction } from '../src/engine/combat';

describe('бестиарий: описание приёмов по родным числам', () => {
  it('рядовой приём описывается без множителей акта и статусов', () => {
    const wolf = enemyDef('wolf');
    const bite = describeAction(wolf, wolf.actions[0], BASE_SCALE);
    expect(bite.kind).toBe('attack');
    expect(bite.label).toBe('5');
    expect(bite.text).toBe('Укус: Атака 5');
    const howl = describeAction(wolf, wolf.actions[1]);
    expect(howl.kind).toBe('buff');
    expect(howl.label).toBe('');
  });

  it('множители акта и Сила врага меняют числа так же, как в бою', () => {
    const wolf = enemyDef('wolf');
    const bite = describeAction(wolf, wolf.actions[0], { hpMult: 2, dmgMult: 1.5, strength: 2, weak: false });
    expect(bite.text).toBe('Укус: Атака 10');
  });

  it('приём с ударом и дебафом: главный вид — атака, хвост — дебаф с именем статуса', () => {
    const rat = enemyDef('rat');
    const gnaw = describeAction(rat, rat.actions[1]);
    expect(gnaw.kind).toBe('attack');
    expect(gnaw.kinds).toEqual(['attack', 'debuff']);
    expect(gnaw.statuses).toEqual(['bleed']);
    const bite = describeAction(rat, rat.actions[0]);
    expect(bite.kinds).toEqual(['attack']);
    expect(bite.statuses).toEqual([]);
  });

  it('эффект при смерти описывается тем же способом', () => {
    const slime = enemyDef('grave_slime');
    expect(slime.onDeath).toBeTruthy();
    const info = describeAction(slime, slime.onDeath!);
    expect(info.kind).toBe('summon');
    expect(info.text).toContain('Призыв: Слизнёнок ×2');
  });

  it('каждый приём каждого врага описывается, у каждой локации есть враги всех рангов', () => {
    for (const def of ENEMY_LIST) {
      for (const a of def.actions) expect(describeAction(def, a).text.length).toBeGreaterThan(0);
      if (def.onDeath) expect(describeAction(def, def.onDeath).text.length).toBeGreaterThan(0);
    }
    for (const loc of LOCATIONS) {
      const own = ENEMY_LIST.filter((e) => e.location === loc.id);
      expect(own.some((e) => e.rank === 'normal')).toBe(true);
      expect(own.some((e) => e.rank === 'boss')).toBe(true);
    }
  });
});
