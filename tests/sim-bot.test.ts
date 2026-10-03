import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { heroDef } from '../src/data/heroes';
import { makeStartingGear } from '../src/data/gear';
import { createBattle } from '../src/engine/combat';
import type { HeroPersistent } from '../src/engine/types';
import { planTurn } from './sim/bot';

describe('бот симулятора', () => {
  it('пробные ходы бота не трогают раны настоящего боя', () => {
    // Регрессия: копия боя делила с настоящим массив порций Кровотечения (`Status.parts`), и перебор ходов дописывал
    // порции и сбивал их сроки в настоящем бою — в долгом бою массив рос до переполнения стека.
    const def = heroDef('berserk');
    const gear = makeStartingGear(def);
    const hero: HeroPersistent = { defId: def.id, signature: def.signatures[0], hp: 999, weapon: gear.weapon, armor: gear.armor, potion: null };
    const rng = createRng(1);
    const state = createBattle(def, hero, ['troll'], rng);
    const troll = state.enemies[0];
    troll.statuses.push({ id: 'bleed', value: 5, turns: 3, parts: [{ v: 3, t: 2 }, { v: 2, t: 3 }] });
    state.hero.stats = { ...state.hero.stats, onHitBleed: 2 };
    const before = JSON.stringify(state.enemies.map((e) => e.statuses));
    planTurn(state, createRng(7));
    expect(JSON.stringify(state.enemies.map((e) => e.statuses))).toBe(before);
  });
});
