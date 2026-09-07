import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { HERO_LIST, heroDef } from '../src/data/heroes';
import { ARMOR_BASES, armorPerkMods, armorType, canWearArmor, dropBases, hasPerk, makeGear, makeStartingGear } from '../src/data/gear';
import { COLLECTIBLES } from '../src/data/collection';
import { createBattle, getStatus, performAction } from '../src/engine/combat';
import { computeStats } from '../src/engine/stats';
import type { ArmorType, GearInstance, GearTier, HeroPersistent } from '../src/engine/types';

/** Броня нужной базы и тира без аффикса и слотов. */
function armor(base: string, tier: GearTier = 1): GearInstance {
  return { kind: 'armor', tier, base, name: base, dmgMin: 0, dmgMax: 0, def: 2, hp: 5, affix: null, slots: [] };
}

function mkBattle(heroId: string, a: GearInstance, enemies: string[]) {
  const def = heroDef(heroId);
  const gear = makeStartingGear(def);
  const hero: HeroPersistent = { defId: heroId, hp: 999, weapon: gear.weapon, armor: a };
  const rng = createRng(1);
  const state = createBattle(def, hero, enemies, rng);
  state.hero.stats.crit = 0;
  return { state, rng };
}

describe('типы брони и умение носить', () => {
  it('у каждой выпадающей базы брони есть тип и перк, типов три, по две базы на тип', () => {
    const count: Record<ArmorType, number> = { heavy: 0, medium: 0, light: 0 };
    for (const b of dropBases('armor')) {
      expect(b.armorType).toBeDefined();
      expect(b.perk).toBeDefined();
      count[b.armorType!]++;
    }
    expect(count).toEqual({ heavy: 2, medium: 2, light: 2 });
    expect(armorType(armor('plate'))).toBe('heavy');
    expect(armorType(armor('shell'))).toBe('medium');
    expect(armorType(armor('cloak'))).toBe('light');
  });

  it('шкура Берсерка: без перка, только стартовая, не выпадает и не в коллекции', () => {
    const hide = ARMOR_BASES.find((b) => b.id === 'hide')!;
    expect(hide.startOnly).toBe(true);
    expect(hide.perk).toBeUndefined();
    expect(hasPerk(armor('hide'))).toBe(false);
    expect(hasPerk(armor('plate'))).toBe(true);
    expect(dropBases('armor').some((b) => b.id === 'hide')).toBe(false);
    expect(COLLECTIBLES.some((c) => c.id === 'armor:hide')).toBe(false);
    expect(makeStartingGear(heroDef('berserk')).armor.base).toBe('hide');
  });

  it('герой умеет носить свою стартовую броню; Берсерк не носит ничего, зато его шкура без перка', () => {
    for (const def of HERO_LIST) {
      const gear = makeStartingGear(def);
      const any = Object.values(def.armorSkill).some((v) => v);
      if (any) expect(canWearArmor(def, gear.armor), def.id).toBe(true);
      else expect(hasPerk(gear.armor), def.id).toBe(false);
      expect(Object.values(def.armorSkill).some((v) => !v), def.id).toBe(true);
    }
    const berserk = heroDef('berserk');
    expect(berserk.armorSkill).toEqual({ heavy: false, medium: false, light: false });
    expect(armorPerkMods(armor('cloak'), berserk)).toEqual({});
    expect(armorPerkMods(armor('harness'), berserk)).toEqual({});
  });

  it('перк работает только у того, кто умеет носить: DEF, HP и аффикс остаются', () => {
    const paladin = heroDef('paladin');
    const mage = heroDef('mage');
    const plate = { ...armor('plate', 3), affix: { stat: 'maxHp' as const, value: 8 } };
    expect(armorPerkMods(plate, paladin)).toEqual({ defendBonus: 2 });
    expect(armorPerkMods(plate, mage)).toEqual({});
    // Без героя перк считается работающим — для карточек вне забега.
    expect(armorPerkMods(plate)).toEqual({ defendBonus: 2 });

    const weapon = makeStartingGear(mage).weapon;
    const s = computeStats(mage, weapon, plate);
    expect(s.defendBonus).toBe(0);
    expect(s.def).toBe(mage.def + 2);
    expect(s.maxHp).toBe(mage.hp + 5 + 8);
  });

  it('плащ на Воине не даёт уклонения, на Плуте — даёт', () => {
    const warrior = mkBattle('warrior', armor('cloak'), ['wolf']);
    expect(getStatus(warrior.state.hero, 'dodge')).toBeUndefined();
    const rogue = mkBattle('rogue', armor('cloak'), ['wolf']);
    expect(getStatus(rogue.state.hero, 'dodge')?.value).toBe(1);
  });

  it('латы на Маге не усиливают «Защититься»', () => {
    const { state, rng } = mkBattle('mage', armor('plate', 3), ['wolf']);
    performAction(state, { type: 'defend' }, rng);
    expect(state.hero.block).toBe(state.hero.stats.def);
  });

  it('броня выпадает с учётом умения: Магу чаще лёгкая, но и тяжёлая встречается', () => {
    const rng = createRng(5);
    const count: Record<ArmorType, number> = { heavy: 0, medium: 0, light: 0 };
    for (let i = 0; i < 600; i++) count[armorType(makeGear(rng, 'armor', 2, heroDef('mage')))]++;
    expect(count.light).toBeGreaterThan(count.heavy);
    expect(count.light).toBeGreaterThan(count.medium);
    expect(count.heavy).toBeGreaterThan(0);
  });

  it('без героя выпадают все базы брони, кроме стартовой шкуры', () => {
    const rng = createRng(6);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(makeGear(rng, 'armor', 1).base);
    expect(seen.size).toBe(dropBases('armor').length);
    expect(seen.has('hide')).toBe(false);
  });
});
