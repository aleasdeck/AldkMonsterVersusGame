import { describe, expect, it } from 'vitest';
import { ACTS } from '../src/data/locations';
import { rollGear, rollRewards, rollShop } from '../src/engine/loot';
import { createRng } from '../src/engine/rng';
import { newRun } from '../src/engine/run';

describe('редкий тир в пуле акта (loot.ts, v0.35)', () => {
  it('акт 2: обычная награда, торговец и сундук с шансом 5 % дают мифический предмет; элита и другие акты — как раньше', () => {
    const hero = newRun('warrior', 1).hero;
    const rng = createRng(11);
    let gear = 0;
    let mythic = 0;
    for (let i = 0; i < 300; i++) {
      for (const it of rollRewards(rng, hero, ACTS[1], 'fight', 'attack')) {
        if (it.kind !== 'gear') continue;
        gear += 1;
        expect([2, 3, 4]).toContain(it.gear.tier);
        if (it.gear.tier === 4) mythic += 1;
      }
    }
    expect(mythic / gear).toBeGreaterThan(0.02);
    expect(mythic / gear).toBeLessThan(0.09);
    // Сундук и торговец — тот же бросок.
    let chest4 = 0;
    for (let i = 0; i < 300; i++) if (rollGear(rng, hero, ACTS[1].gearTiers, undefined, ACTS[1].rareGear).tier === 4) chest4 += 1;
    expect(chest4).toBeGreaterThan(5);
    let shop4 = 0;
    for (let i = 0; i < 300; i++) if (rollShop(rng, hero, ACTS[1]).gear?.tier === 4) shop4 += 1;
    expect(shop4).toBeGreaterThan(5);
    // Элита второго акта — пул 3–4 без редкого броска, первый акт — только 1–2.
    for (let i = 0; i < 100; i++) {
      for (const it of rollRewards(rng, hero, ACTS[1], 'elite', 'defense')) if (it.kind === 'gear') expect([3, 4]).toContain(it.gear.tier);
      for (const it of rollRewards(rng, hero, ACTS[0], 'fight', 'defense')) if (it.kind === 'gear') expect([1, 2]).toContain(it.gear.tier);
    }
  });
});
