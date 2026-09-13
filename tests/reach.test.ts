import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { heroDef } from '../src/data/heroes';
import { makeStartingGear, weaponReach } from '../src/data/gear';
import { REACH_MODEL, SUMMON_FRONT, actionReach, canReach, canUseAction, createBattle, endTurn, performAction, reachErr, reachableEnemies, resolveEnemyTurn } from '../src/engine/combat';
import { computeStats } from '../src/engine/stats';
import type { ArtifactInstance, GearInstance, GearTier, HeroPersistent } from '../src/engine/types';

/**
 * Дальность (v0.26): ближний бой достаёт только первого в ряду, дальнее и магическое оружие, копьё, заклинания
 * и брошенные склянки — любого врага. Тесты писаны под модель 'first'; модель 'rows' проверяется отдельным блоком.
 */

function weapon(base: string, dmg: number, tier: GearTier = 1, slots: ArtifactInstance[] = []): GearInstance {
  return { kind: 'weapon', tier, base, name: base, dmgMin: dmg, dmgMax: dmg, def: 0, hp: 0, affix: null, slots };
}

function mkBattle(heroId: string, enemies: string[], w?: GearInstance, arts: ArtifactInstance[] = []) {
  const def = heroDef(heroId);
  const gear = makeStartingGear(def);
  const wpn = w ?? gear.weapon;
  wpn.slots = [...wpn.slots, ...arts];
  const hero: HeroPersistent = { defId: heroId, hp: 999, weapon: wpn, armor: gear.armor, potion: null };
  const rng = createRng(1);
  const state = createBattle(def, hero, enemies, rng);
  state.hero.stats.crit = 0;
  state.hero.mp = 10;
  state.hero.maxMp = 10;
  return { state, rng };
}

describe('дальность оружия', () => {
  it('ближнее оружие достаёт только первого в ряду, дальнее и магическое — любого; копьё — исключение', () => {
    const warrior = heroDef('warrior');
    const armor = makeStartingGear(warrior).armor;
    expect(computeStats(warrior, weapon('sword', 5), armor).reachAny).toBe(0);
    expect(computeStats(warrior, weapon('bow', 5), armor).reachAny).toBe(1);
    expect(computeStats(warrior, weapon('staff', 5), armor).reachAny).toBe(1);
    expect(computeStats(warrior, weapon('spear', 5), armor).reachAny).toBe(1);
    // Дальность — свойство древка, а не владения: копьё в руках лучника тоже достаёт через ряд.
    expect(computeStats(heroDef('archer'), weapon('spear', 5), armor).reachAny).toBe(1);
    expect(weaponReach(weapon('spear', 5))).toBe('any');
    expect(weaponReach(weapon('mace', 5))).toBe('melee');
    expect(weaponReach(weapon('sling', 5))).toBe('any');
  });

  it('меч: удар по второму в ряду недоступен, после смерти первого второй становится первым', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'wolf'], weapon('sword', 20));
    const [a, b] = state.enemies;
    expect(canUseAction(state, { type: 'attack', target: b.uid })).toBe(reachErr());
    expect(() => performAction(state, { type: 'attack', target: b.uid }, rng)).toThrow();
    expect(canUseAction(state, { type: 'attack', target: a.uid })).toBeNull();
    performAction(state, { type: 'attack', target: a.uid }, rng);
    expect(state.enemies.map((e) => e.uid)).toEqual([b.uid]);
    expect(canUseAction(state, { type: 'attack', target: b.uid })).toBeNull();
  });

  it('лук, посох и копьё бьют любого в ряду', () => {
    for (const base of ['bow', 'staff', 'spear']) {
      const { state, rng } = mkBattle('warrior', ['wolf', 'wolf', 'wolf'], weapon(base, 5));
      const last = state.enemies[2];
      expect(canUseAction(state, { type: 'attack', target: last.uid })).toBeNull();
      performAction(state, { type: 'attack', target: last.uid }, rng);
      expect(last.hp).toBeLessThan(12);
    }
  });

  it('копьё бьёт второго, а сквозной удар достаётся следующему живому', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'wolf'], weapon('spear', 10));
    const [a, b] = state.enemies;
    performAction(state, { type: 'attack', target: b.uid }, rng);
    expect(b.hp).toBe(2);
    expect(a.hp).toBe(12 - 3);
  });
});

describe('дальность приёмов', () => {
  it('физический приём бьёт как оружие: с мечом только первого, с луком любого', () => {
    const sword = mkBattle('warrior', ['wolf', 'wolf'], weapon('sword', 5), [{ id: 'heavy_strike', tier: 1 }]);
    const far = sword.state.enemies[1];
    expect(actionReach(sword.state, { type: 'artifact', artifactId: 'heavy_strike', target: far.uid })).toBe('melee');
    expect(canUseAction(sword.state, { type: 'artifact', artifactId: 'heavy_strike', target: far.uid })).toBe(reachErr());

    const bow = mkBattle('warrior', ['wolf', 'wolf'], weapon('bow', 5), [{ id: 'heavy_strike', tier: 1 }]);
    const far2 = bow.state.enemies[1];
    expect(canUseAction(bow.state, { type: 'artifact', artifactId: 'heavy_strike', target: far2.uid })).toBeNull();
  });

  it('заклинание, флакон яда и Молот света достают любого даже с мечом', () => {
    const arts: ArtifactInstance[] = [
      { id: 'fireball', tier: 1 },
      { id: 'poison_vial', tier: 1 },
      { id: 'light_hammer', tier: 1 },
    ];
    const { state, rng } = mkBattle('warrior', ['wolf', 'wolf'], weapon('sword', 5), arts);
    const far = state.enemies[1];
    for (const id of ['fireball', 'poison_vial', 'light_hammer']) {
      expect(actionReach(state, { type: 'artifact', artifactId: id, target: far.uid })).toBe('any');
      expect(canUseAction(state, { type: 'artifact', artifactId: id, target: far.uid })).toBeNull();
    }
    performAction(state, { type: 'artifact', artifactId: 'fireball', target: far.uid }, rng);
    expect(far.hp).toBe(12 - 7);
  });

  it('щит и порез — всегда в упор, даже с луком в руках', () => {
    const arts: ArtifactInstance[] = [
      { id: 'shield_bash', tier: 1 },
      { id: 'shield_ram', tier: 1 },
      { id: 'bleed_cut', tier: 1 },
    ];
    const { state } = mkBattle('archer', ['wolf', 'wolf'], weapon('bow', 5), arts);
    state.hero.block = 5;
    const far = state.enemies[1];
    for (const id of ['shield_bash', 'shield_ram', 'bleed_cut']) {
      expect(actionReach(state, { type: 'artifact', artifactId: id, target: far.uid })).toBe('melee');
      expect(canUseAction(state, { type: 'artifact', artifactId: id, target: far.uid })).toBe(reachErr());
    }
    expect(canUseAction(state, { type: 'artifact', artifactId: 'bleed_cut', target: state.enemies[0].uid })).toBeNull();
  });

  it('приём по всем врагам дальности не знает: Вихрь с мечом задевает и заднего', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'wolf', 'wolf'], weapon('sword', 10), [{ id: 'whirlwind', tier: 1 }]);
    performAction(state, { type: 'artifact', artifactId: 'whirlwind', target: state.enemies[0].uid }, rng);
    for (const e of state.enemies) expect(e.hp).toBe(12 - 5);
  });

  it('reachableEnemies и canReach согласованы с моделью', () => {
    const { state } = mkBattle('warrior', ['wolf', 'wolf'], weapon('sword', 5));
    const [a, b] = state.enemies;
    expect(reachableEnemies(state, 'any').map((e) => e.uid)).toEqual([a.uid, b.uid]);
    if (REACH_MODEL === 'first') expect(reachableEnemies(state, 'melee').map((e) => e.uid)).toEqual([a.uid]);
    expect(canReach(state, { type: 'attack', target: a.uid }, a.uid)).toBe(true);
    expect(canReach(state, { type: 'attack', target: b.uid }, b.uid)).toBe(REACH_MODEL !== 'first');
  });
});

describe('ряд врагов', () => {
  it('призванный враг встаёт вперёд и заслоняет призывателя (SUMMON_FRONT), меч достаёт только его', () => {
    const { state, rng } = mkBattle('warrior', ['alpha_wolf'], weapon('sword', 1));
    const boss = state.enemies[0];
    boss.intent = 'howl';
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(state.enemies.length).toBe(2);
    const idx = state.enemies.findIndex((e) => e.defId === 'wolf');
    expect(idx).toBe(REACH_MODEL === 'first' && SUMMON_FRONT ? 0 : 1);
    if (REACH_MODEL === 'first' && SUMMON_FRONT) expect(canUseAction(state, { type: 'attack', target: boss.uid })).toBe(reachErr());
  });

  it('союзник-волк дальности не знает: кусает самого раненого, даже второго в ряду', () => {
    const { state, rng } = mkBattle('mage', ['wolf', 'rat'], weapon('staff', 1), [{ id: 'wolf_whistle', tier: 1 }]);
    performAction(state, { type: 'artifact', artifactId: 'wolf_whistle' }, rng);
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(state.enemies.find((e) => e.defId === 'wolf')!.hp).toBe(12);
    expect(state.enemies.find((e) => e.defId === 'rat')!.hp).toBe(2);
  });
});
