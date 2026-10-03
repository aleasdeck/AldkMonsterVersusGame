import { describe, expect, it } from 'vitest';
import { ACTS } from '../src/data/locations';
import { rollArtifact, rollGear, rollRewards, rollShop } from '../src/engine/loot';
import { artifactCost, artifactDef } from '../src/data/artifacts';
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

describe('состав тройки награды (loot.ts, v0.40)', () => {
  it('в каждой тройке есть и предмет, и артефакт; предмет не закреплён за позицией', () => {
    const hero = newRun('warrior', 1).hero;
    const rng = createRng(3);
    let artifacts = 0;
    const gearAt = [0, 0, 0];
    for (let i = 0; i < 600; i++) {
      const items = rollRewards(rng, hero, ACTS[0], 'fight', 'attack');
      expect(items).toHaveLength(3);
      expect(items.some((it) => it.kind === 'gear')).toBe(true);
      expect(items.some((it) => it.kind === 'artifact')).toBe(true);
      items.forEach((it, idx) => {
        if (it.kind === 'gear') gearAt[idx] += 1;
        else artifacts += 1;
      });
    }
    // Третья карточка по-прежнему катится с ARTIFACT_CHANCE 0.55 — в среднем полтора артефакта на тройку.
    expect(artifacts / 600).toBeGreaterThan(1.4);
    expect(artifacts / 600).toBeLessThan(1.7);
    // Порядок перемешан: предмет не сидит всегда на первой карточке.
    for (const n of gearAt) expect(n).toBeGreaterThan(100);
  });

  it('два артефакта в одной тройке всегда разные', () => {
    const hero = newRun('mage', 5).hero;
    const rng = createRng(21);
    for (let i = 0; i < 300; i++) {
      const ids = rollRewards(rng, hero, ACTS[2], 'elite', 'attack').flatMap((it) => (it.kind === 'artifact' ? [it.artifact.id] : []));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('сходимость дропа артефактов (loot.ts, v0.40)', () => {
  /** Как часто из пула слота выпадает именно этот артефакт. */
  function rate(hero: ReturnType<typeof newRun>['hero'], id: string, slot: 'weapon' | 'armor'): number {
    const rng = createRng(7);
    let n = 0;
    for (let i = 0; i < 4000; i++) if (rollArtifact(rng, hero, [1], [], slot)?.id === id) n += 1;
    return n / 4000;
  }

  it('дубликат стоящего в сокете выпадает примерно втрое чаще: только так артефакт растёт в тире', () => {
    const plain = newRun('warrior', 1).hero;
    const owner = newRun('warrior', 1).hero;
    owner.armor.slots[0] = { id: 'turtle_shell', tier: 1 };
    const before = rate(plain, 'turtle_shell', 'armor');
    const after = rate(owner, 'turtle_shell', 'armor');
    expect(before).toBeGreaterThan(0.02);
    expect(after / before).toBeGreaterThan(2.2);
    expect(after / before).toBeLessThan(4);
  });

  it('выплата чаще приходит к заводке: с Кровопусканием в руках чаще выпадают Вскрытие и Кровавый след', () => {
    const plain = newRun('warrior', 1).hero;
    const bleeder = newRun('warrior', 1).hero;
    bleeder.weapon.slots[0] = { id: 'bleed_cut', tier: 1 };
    for (const id of ['bleed_burst', 'blood_trail']) {
      const before = rate(plain, id, 'weapon');
      const after = rate(bleeder, id, 'weapon');
      // С v0.43 тянет и метка «Кровь»: дорожают все вещи Крови разом, и доля каждой растёт меньше, чем втрое.
      expect(after / before).toBeGreaterThan(1.5);
      expect(after / before).toBeLessThan(4);
    }
    // Несвязанное оружейное не дорожает: тяга адресная, а не «всё чаще».
    const neutral = rate(bleeder, 'war_cry', 'weapon') / rate(plain, 'war_cry', 'weapon');
    expect(neutral).toBeLessThan(1.3);
  });

  it('выпадать не перестаёт ничто: за 4000 бросков пул отдаёт почти все свои артефакты', () => {
    const hero = newRun('warrior', 1).hero;
    hero.weapon.slots[0] = { id: 'bleed_cut', tier: 1 };
    const rng = createRng(13);
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      const a = rollArtifact(rng, hero, [1], [], 'weapon');
      if (a) seen.add(a.id);
    }
    expect(seen.size).toBeGreaterThan(30);
  });
});

describe('дроп заклинаний по мане (loot.ts, v0.40.1)', () => {
  /** Стоит ли приём маны хоть на одном тире — тот же ключ, что и у дропа: цена, а не школа. */
  const costsMana = (id: string) => ([1, 2, 3] as const).some((t) => (artifactCost(artifactDef(id), t).mp ?? 0) > 0);

  /** Доля приёмов с ценой MP среди выпавших артефактов пула. */
  function spellShare(hero: ReturnType<typeof newRun>['hero'], slot: 'weapon' | 'armor'): number {
    const rng = createRng(5);
    let spells = 0;
    let total = 0;
    for (let i = 0; i < 3000; i++) {
      const a = rollArtifact(rng, hero, [1], [], slot);
      if (!a) continue;
      total += 1;
      if (costsMana(a.id)) spells += 1;
    }
    return spells / total;
  }

  it('безманового героя заклинания обходят стороной, но пул для него не пустеет', () => {
    const berserk = newRun('berserk', 1).hero;
    expect(spellShare(berserk, 'weapon')).toBe(0);
    expect(spellShare(berserk, 'armor')).toBe(0);
    const rng = createRng(13);
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const a = rollArtifact(rng, berserk, [1], [], 'weapon');
      if (a) seen.add(a.id);
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  it('ступени монотонны: у Мага заклинаний больше, чем у Ассасина, у Ассасина — чем у Воина', () => {
    const mage = spellShare(newRun('mage', 1).hero, 'weapon');
    const assassin = spellShare(newRun('assassin', 1).hero, 'weapon');
    const warrior = spellShare(newRun('warrior', 1).hero, 'weapon');
    expect(mage).toBeGreaterThan(assassin * 1.5);
    expect(assassin).toBeGreaterThan(warrior * 1.3);
    expect(warrior).toBeGreaterThan(0);
  });

  it('мана со снаряжения открывает заклинания: ступень считается по computeStats, а не по базе героя', () => {
    const rich = newRun('berserk', 1).hero;
    rich.armor.affix = { stat: 'maxMp', value: 3 };
    expect(spellShare(rich, 'weapon')).toBeGreaterThan(0.1);
  });
});
