import { describe, expect, it } from 'vitest';
import { HERO_LIST, SIGNATURE_OWNER, heroDef } from '../src/data/heroes';
import { ARTIFACTS, artifactDef } from '../src/data/artifacts';
import { baseArmorStats, baseOf, makeGear, makeStartingGear, weaponDice } from '../src/data/gear';
import { addArtifact, canPlaceArtifact, equipGear, freeSocketFor, isMaxed, replaceArtifact, socketRefs, upgradableSockets } from '../src/engine/equipment';
import { computeStats } from '../src/engine/stats';
import { createRng } from '../src/engine/rng';
import type { HeroPersistent } from '../src/engine/types';

/** Герой с классической парой артефактов (приём в оружии, пассивка в броне) — на ней проверяем механику слотов. */
function mkHero(id = 'warrior'): HeroPersistent {
  const def = heroDef(id);
  const gear = makeStartingGear(def);
  gear.weapon.slots = [{ id: 'crippling_shot', tier: 1 }];
  gear.armor.slots = [{ id: 'troll_heart', tier: 1 }];
  return { defId: id, signature: def.signatures[0], hp: 40, weapon: gear.weapon, armor: gear.armor, potion: null };
}

describe('артефакты и слоты', () => {
  it('на старте выбранный персональный артефакт в предмете своего типа, второй сокет пуст; сокеты типизированы', () => {
    for (const def of HERO_LIST) {
      for (const sig of def.signatures) {
        const gear = makeStartingGear(def, sig);
        const inWeapon = artifactDef(sig).slot === 'weapon';
        expect(gear.weapon.slots, `${def.id} ${sig}`).toEqual([inWeapon ? { id: sig, tier: 1 } : null]);
        expect(gear.armor.slots, `${def.id} ${sig}`).toEqual([inWeapon ? null : { id: sig, tier: 1 }]);
        expect(gear.weapon.slotKinds).toEqual(['weapon']);
        expect(gear.armor.slotKinds).toEqual(['armor']);
        expect(SIGNATURE_OWNER[sig]).toBe(def.id);
      }
      // Без аргумента — первый из пары.
      expect([...makeStartingGear(def).weapon.slots, ...makeStartingGear(def).armor.slots].find(Boolean)?.id).toBe(def.signatures[0]);
    }
    // Первые сигнатуры: пять в оружии, Дымовая шашка Ассасина — в покрове. Вторые: у Паладина и Берсерка — бронные.
    expect(HERO_LIST.filter((d) => artifactDef(d.signatures[0]).slot === 'armor').map((d) => d.id)).toEqual(['assassin']);
    expect(HERO_LIST.filter((d) => artifactDef(d.signatures[1]).slot === 'armor').map((d) => d.id)).toEqual(['paladin', 'berserk']);
  });

  it('типы артефактов: 39 оружейных и 27 бронных, у каждого тип задан', () => {
    const ids = Object.keys(ARTIFACTS);
    expect(ids.filter((id) => ARTIFACTS[id].slot === 'weapon').length).toBe(39);
    expect(ids.filter((id) => ARTIFACTS[id].slot === 'armor').length).toBe(27);
  });

  it('сокет своего типа не принимает чужой артефакт, универсальный принимает любой', () => {
    const h = mkHero();
    h.weapon.slots = [null, null];
    h.weapon.slotKinds = ['weapon', 'any'];
    h.armor.slots = [null];
    h.armor.slotKinds = ['armor'];
    expect(canPlaceArtifact(h, 'weapon', 0, 'troll_heart')).toMatch(/Оружейный сокет/);
    expect(canPlaceArtifact(h, 'weapon', 1, 'troll_heart')).toBeNull();
    expect(canPlaceArtifact(h, 'armor', 0, 'fireball')).toMatch(/Бронный сокет/);
    expect(canPlaceArtifact(h, 'armor', 0, 'troll_heart')).toBeNull();
    expect(canPlaceArtifact(h, 'armor', 5, 'troll_heart')).toBe('Нет такого сокета');
    expect(() => replaceArtifact(h, 'weapon', 0, { id: 'troll_heart', tier: 1 })).toThrow(/Оружейный сокет/);
  });

  it('addArtifact занимает сокет своего типа раньше универсального и даёт full, когда подходящих нет', () => {
    const h = mkHero();
    h.weapon.slots = [null, null];
    h.weapon.slotKinds = ['any', 'weapon'];
    h.armor.slots = [null];
    h.armor.slotKinds = ['armor'];
    expect(freeSocketFor(h, 'fireball')?.index).toBe(1); // свой сокет, универсальный остаётся бронным
    expect(addArtifact(h, { id: 'fireball', tier: 1 })).toBe('placed');
    expect(h.weapon.slots[1]?.id).toBe('fireball');
    expect(addArtifact(h, { id: 'troll_heart', tier: 1 })).toBe('placed');
    expect(h.armor.slots[0]?.id).toBe('troll_heart');
    expect(addArtifact(h, { id: 'thorns', tier: 1 })).toBe('placed'); // бронный — в универсальный
    expect(h.weapon.slots[0]?.id).toBe('thorns');
    expect(addArtifact(h, { id: 'regen_amulet', tier: 1 })).toBe('full');
  });

  it('при смене предмета артефакты переезжают по типам: свои сокеты занимают первыми, лишние возвращаются', () => {
    const h = mkHero();
    h.weapon.slots = [{ id: 'fireball', tier: 1 }, { id: 'thorns', tier: 1 }, { id: 'luck_talisman', tier: 1 }];
    h.weapon.slotKinds = ['any', 'any', 'any'];
    const next = makeGear(createRng(2), 'weapon', 4);
    next.slotKinds = ['any', 'weapon', 'weapon'];
    // Два оружейных садятся в оружейные сокеты, универсальный достаётся Шипам — никто не пропал.
    expect(equipGear(h, next)).toEqual([]);
    expect(h.weapon.slots.map((a) => a?.id)).toEqual(['thorns', 'fireball', 'luck_talisman']);
    // Три оружейных сокета — Шипам места нет, хотя сокетов хватает по счёту.
    const strict = makeGear(createRng(2), 'weapon', 4);
    strict.slotKinds = ['weapon', 'weapon', 'weapon'];
    expect(equipGear(h, strict).map((a) => a.id)).toEqual(['thorns']);
  });

  it('генерация: у оружия нет бронных сокетов, у брони — оружейных; универсальных около 40 %', () => {
    const rng = createRng(9);
    let any = 0;
    let total = 0;
    for (let i = 0; i < 200; i++) {
      const w = makeGear(rng, 'weapon', 5);
      const a = makeGear(rng, 'armor', 5);
      expect(w.slotKinds.length).toBe(w.slots.length);
      expect(a.slotKinds.length).toBe(a.slots.length);
      expect(w.slotKinds.every((k) => k === 'weapon' || k === 'any')).toBe(true);
      expect(a.slotKinds.every((k) => k === 'armor' || k === 'any')).toBe(true);
      any += [...w.slotKinds, ...a.slotKinds].filter((k) => k === 'any').length;
      total += w.slotKinds.length + a.slotKinds.length;
    }
    expect(any / total).toBeGreaterThan(0.33);
    expect(any / total).toBeLessThan(0.47);
  });

  it('пара артефактов в слотах читается по порядку: оружие, броня', () => {
    const h = mkHero();
    const refs = socketRefs(h);
    expect(refs.length).toBe(2);
    expect(refs.map((r) => r.art?.id)).toEqual(['crippling_shot', 'troll_heart']);
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
    expect(addArtifact(h, { id: 'crippling_shot', tier: 3 })).toBe('upgraded');
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
    weapon.slotKinds = ['weapon', 'any'];
    const overflow = equipGear(h, weapon);
    expect(overflow).toEqual([]);
    expect(h.weapon.slots[0]?.id).toBe('crippling_shot');
    expect(h.weapon.slots[1]).toBeNull();
    expect(addArtifact(h, { id: 'thorns', tier: 1 })).toBe('placed');
    expect(h.weapon.slots[1]?.id).toBe('thorns');
  });

  it('даунгрейд предмета возвращает лишние артефакты', () => {
    const h = mkHero();
    const rng = createRng(7);
    const big = makeGear(rng, 'weapon', 4);
    big.slotKinds = ['weapon', 'any', 'weapon'];
    equipGear(h, big);
    addArtifact(h, { id: 'thorns', tier: 1 });
    addArtifact(h, { id: 'luck_talisman', tier: 1 });
    expect(h.weapon.slots.filter(Boolean).length).toBe(3);
    const overflow = equipGear(h, makeGear(rng, 'weapon', 1));
    expect(overflow.map((a) => a.id).sort()).toEqual(['luck_talisman', 'thorns']);
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
    expect(upgradableSockets(h).map((s) => s.art?.id)).toEqual(['crippling_shot']);
  });
});

describe('расчёт статов', () => {
  it('складывает героя, броню и пассивки', () => {
    const h = mkHero('warrior');
    const s = computeStats(heroDef('warrior'), h.weapon, h.armor);
    expect(s.maxHp).toBe(46 + 6);
    // 6 героя + 1 кольчуга + 1 Парирование меча
    expect(s.def).toBe(6 + 1 + 1);
    expect([s.dmgMin, s.dmgMax]).toEqual([4, 6]);
    expect(s.sta).toBe(3);
  });

  it('тир пассивки меняет силу', () => {
    const h = mkHero('warrior');
    addArtifact(h, { id: 'troll_heart', tier: 3 });
    const s = computeStats(heroDef('warrior'), h.weapon, h.armor);
    expect(s.maxHp).toBe(46 + 18);
  });

  it('броня даёт DEF и HP по тиру и типу: тяжёлая — защита, средняя — ровно, лёгкая — почти без защиты', () => {
    const h = mkHero('mage');
    h.armor.slots = [null]; // без пассивки, чтобы HP брони считался чисто
    const expected = { plate: [10, 9], harness: [7, 18], robe: [4, 24] };
    for (const [base, [def, hp]] of Object.entries(expected)) {
      const armor = makeGear(createRng(3), 'armor', 5);
      armor.base = base;
      const stats = baseArmorStats(baseOf('armor', base), 5);
      armor.def = stats.def;
      armor.hp = stats.hp;
      armor.affix = null;
      equipGear(h, armor);
      const s = computeStats(heroDef('mage'), h.weapon, h.armor);
      expect([s.def, s.maxHp], base).toEqual([3 + def, 29 + hp]);
    }
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
