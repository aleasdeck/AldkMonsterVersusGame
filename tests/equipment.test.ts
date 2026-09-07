import { describe, expect, it } from 'vitest';
import { heroDef } from '../src/data/heroes';
import { makeGear, makeStartingGear, weaponDice } from '../src/data/gear';
import { addArtifact, equipGear, isMaxed, replaceArtifact, socketRefs, upgradableSockets } from '../src/engine/equipment';
import { computeStats } from '../src/engine/stats';
import { createRng } from '../src/engine/rng';
import type { HeroPersistent } from '../src/engine/types';

function mkHero(id = 'warrior'): HeroPersistent {
  const gear = makeStartingGear(heroDef(id));
  return { defId: id, hp: 40, weapon: gear.weapon, armor: gear.armor };
}

describe('артефакты и слоты', () => {
  it('стартовые артефакты стоят в слотах', () => {
    const h = mkHero();
    const refs = socketRefs(h);
    expect(refs.length).toBe(2);
    expect(refs.map((r) => r.art?.id)).toEqual(['heavy_strike', 'troll_heart']);
  });

  it('дубликат апгрейдит, третий дубликат бесполезен', () => {
    const h = mkHero();
    expect(addArtifact(h, { id: 'troll_heart', tier: 1 })).toBe('upgraded');
    expect(h.armor.slots[0]?.tier).toBe(2);
    expect(addArtifact(h, { id: 'troll_heart', tier: 1 })).toBe('upgraded');
    expect(h.armor.slots[0]?.tier).toBe(3);
    expect(isMaxed(h, 'troll_heart')).toBe(true);
    expect(addArtifact(h, { id: 'troll_heart', tier: 1 })).toBe('maxed');
  });

  it('дубликат высокого тира поднимает сразу до него', () => {
    const h = mkHero();
    expect(addArtifact(h, { id: 'heavy_strike', tier: 3 })).toBe('upgraded');
    expect(h.weapon.slots[0]?.tier).toBe(3);
  });

  it('без свободных слотов — full', () => {
    const h = mkHero();
    expect(addArtifact(h, { id: 'thorns', tier: 1 })).toBe('full');
    expect(socketRefs(h).every((r) => r.art)).toBe(true);
  });

  it('новый предмет даёт слоты, артефакты переезжают', () => {
    const h = mkHero();
    const rng = createRng(5);
    const weapon = makeGear(rng, 'weapon', 3);
    expect(weapon.slots.length).toBe(2);
    const overflow = equipGear(h, weapon);
    expect(overflow).toEqual([]);
    expect(h.weapon.slots[0]?.id).toBe('heavy_strike');
    expect(h.weapon.slots[1]).toBeNull();
    expect(addArtifact(h, { id: 'thorns', tier: 1 })).toBe('placed');
    expect(h.weapon.slots[1]?.id).toBe('thorns');
  });

  it('даунгрейд предмета возвращает лишние артефакты', () => {
    const h = mkHero();
    const rng = createRng(7);
    equipGear(h, makeGear(rng, 'weapon', 4));
    addArtifact(h, { id: 'thorns', tier: 1 });
    addArtifact(h, { id: 'sage_eye', tier: 1 });
    expect(h.weapon.slots.filter(Boolean).length).toBe(3);
    const overflow = equipGear(h, makeGear(rng, 'weapon', 1));
    expect(overflow.map((a) => a.id)).toEqual(['thorns', 'sage_eye']);
    expect(h.weapon.slots.length).toBe(1);
  });

  it('замена возвращает вытесненный артефакт', () => {
    const h = mkHero();
    const removed = replaceArtifact(h, 'armor', 0, { id: 'thorns', tier: 2 });
    expect(removed?.id).toBe('troll_heart');
    expect(h.armor.slots[0]).toEqual({ id: 'thorns', tier: 2 });
  });

  it('кузница видит только артефакты ниже 3 тира', () => {
    const h = mkHero();
    addArtifact(h, { id: 'troll_heart', tier: 3 });
    expect(upgradableSockets(h).map((s) => s.art?.id)).toEqual(['heavy_strike']);
  });
});

describe('расчёт статов', () => {
  it('складывает героя, броню и пассивки', () => {
    const h = mkHero('warrior');
    const s = computeStats(heroDef('warrior'), h.weapon, h.armor);
    expect(s.maxHp).toBe(44 + 6);
    // 6 героя + 1 кольчуга + 1 Парирование меча
    expect(s.def).toBe(6 + 1 + 1);
    expect([s.dmgMin, s.dmgMax]).toEqual([4, 6]);
    expect(s.sta).toBe(3);
  });

  it('тир пассивки меняет силу', () => {
    const h = mkHero('warrior');
    addArtifact(h, { id: 'troll_heart', tier: 3 });
    const s = computeStats(heroDef('warrior'), h.weapon, h.armor);
    expect(s.maxHp).toBe(44 + 18);
  });

  it('броня из таблицы тиров даёт DEF и HP', () => {
    const h = mkHero('mage');
    const armor = makeGear(createRng(3), 'armor', 5);
    armor.affix = null;
    equipGear(h, armor);
    const s = computeStats(heroDef('mage'), h.weapon, h.armor);
    expect(s.def).toBe(3 + 7);
    expect(s.maxHp).toBe(26 + 18);
  });

  it('серая экипировка тоже что-то даёт: базовый бонус и аффикс', () => {
    const rng = createRng(11);
    for (let i = 0; i < 20; i++) {
      const w = makeGear(rng, 'weapon', 1);
      expect(w.dmgMax).toBeGreaterThan(w.dmgMin);
      expect(w.affix).not.toBeNull();
      const a = makeGear(rng, 'armor', 1);
      expect(a.def + a.hp).toBeGreaterThan(0);
      expect(a.affix).not.toBeNull();
    }
  });

  it('аффикс попадает в статы', () => {
    const h = mkHero('warrior');
    const w = makeGear(createRng(1), 'weapon', 2);
    w.affix = { stat: 'str', value: 2 };
    equipGear(h, w);
    const s = computeStats(heroDef('warrior'), h.weapon, h.armor);
    expect(s.str).toBe(2);
    expect(s.dmgMin).toBe(weaponDice(heroDef('warrior'), w).min);
  });
});
