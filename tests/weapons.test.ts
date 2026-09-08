import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { heroDef } from '../src/data/heroes';
import { WEAPON_BASES, baseOf, makeGear, makeStartingGear, weaponDice, weaponType } from '../src/data/gear';
import { canUseAction, createBattle, endTurn, getStatus, performAction, previewAttack, resolveEnemyTurn } from '../src/engine/combat';
import { computeStats, previewGearSwap } from '../src/engine/stats';
import { REROLL_COST, START_GOLD, goldReward } from '../src/engine/loot';
import { battleAction, battleEndTurn, battleEnemyStep, canReroll, enterRoom, finishBattle, newRun, rerollReward } from '../src/engine/run';
import type { GearInstance, GearTier, HeroPersistent, RunState, WeaponType } from '../src/engine/types';

/** Оружие с фиксированным уроном, без аффикса и слотов. */
function weapon(base: string, dmg: number, tier: GearTier = 1): GearInstance {
  return { kind: 'weapon', tier, base, name: base, dmgMin: dmg, dmgMax: dmg, def: 0, hp: 0, affix: null, slots: [] };
}

function mkBattle(heroId: string, enemies: string[], w?: GearInstance, seed = 1) {
  const def = heroDef(heroId);
  const gear = makeStartingGear(def);
  if (!w) {
    const mid = Math.round((gear.weapon.dmgMin + gear.weapon.dmgMax) / 2);
    gear.weapon.dmgMin = mid;
    gear.weapon.dmgMax = mid;
  }
  const hero: HeroPersistent = { defId: heroId, hp: 999, weapon: w ?? gear.weapon, armor: gear.armor, potion: null };
  const rng = createRng(seed);
  const state = createBattle(def, hero, enemies, rng);
  state.hero.stats.crit = 0;
  return { state, rng };
}

describe('типы оружия и владение', () => {
  it('у каждой базы оружия есть тип и перк, типов три', () => {
    const types = new Set<WeaponType>();
    for (const b of WEAPON_BASES) {
      expect(b.type).toBeDefined();
      expect(b.perk).toBeDefined();
      types.add(b.type!);
    }
    expect([...types].sort()).toEqual(['magic', 'melee', 'ranged']);
    expect(WEAPON_BASES.filter((b) => b.type === 'ranged').length).toBeGreaterThanOrEqual(3);
    expect(WEAPON_BASES.filter((b) => b.type === 'magic').length).toBeGreaterThanOrEqual(3);
  });

  it('знакомое оружие — 75 % кубика, чужое — 50 %, минимум 1', () => {
    const archer = heroDef('archer');
    expect(weaponDice(archer, weapon('bow', 8))).toEqual({ min: 8, max: 8 });
    expect(weaponDice(archer, weapon('sword', 8))).toEqual({ min: 6, max: 6 });
    expect(weaponDice(archer, weapon('wand', 1))).toEqual({ min: 1, max: 1 });
  });

  it('магическое оружие: −1 к максимуму и бонус к заклинаниям по тиру', () => {
    const warrior = heroDef('warrior');
    const staff: GearInstance = { ...weapon('staff', 6, 3), dmgMax: 10 };
    // чужое: 6→3, 10→5, магический тип −1 к максимуму
    expect(weaponDice(warrior, staff)).toEqual({ min: 3, max: 4 });
    const gear = makeStartingGear(warrior);
    const s = computeStats(warrior, staff, gear.armor);
    expect(s.spellPower).toBe(2);
  });

  it('владение не трогает Силу и артефакты', () => {
    const archer = heroDef('archer');
    const gear = makeStartingGear(archer);
    const sword = { ...weapon('sword', 8), affix: { stat: 'str' as const, value: 2 } };
    const s = computeStats(archer, sword, gear.armor);
    expect([s.dmgMin, s.dmgMax]).toEqual([6, 6]);
    expect(s.str).toBe(2);
  });

  it('оружие выпадает с учётом владения: лучнику чаще дальнее', () => {
    const rng = createRng(3);
    const count: Record<WeaponType, number> = { melee: 0, ranged: 0, magic: 0 };
    for (let i = 0; i < 600; i++) count[weaponType(makeGear(rng, 'weapon', 2, heroDef('archer')))]++;
    expect(count.ranged).toBeGreaterThan(count.melee);
    expect(count.melee).toBeGreaterThan(count.magic);
    expect(count.magic).toBeGreaterThan(0);
  });

  it('без героя базы выпадают все', () => {
    const rng = createRng(4);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(makeGear(rng, 'weapon', 1).base);
    expect(seen.size).toBe(WEAPON_BASES.length);
    for (const id of seen) expect(baseOf('weapon', id)).toBeDefined();
  });
});

describe('перки баз в статах', () => {
  const armorOf = (id: string) => makeStartingGear(heroDef(id)).armor;

  it('меч — защита, топор — усталость, посох — мана, жезл — реген, сфера — шипы', () => {
    const w = heroDef('warrior');
    expect(computeStats(w, weapon('sword', 5), armorOf('warrior')).def).toBe(6 + 1 + 1);
    expect(computeStats(w, weapon('axe', 5), armorOf('warrior')).fatigue).toBeCloseTo(0.8);
    const m = heroDef('mage');
    expect(computeStats(m, weapon('staff', 5), armorOf('mage')).maxMp).toBe(12);
    expect(computeStats(m, weapon('wand', 5), armorOf('mage')).mpRegen).toBe(3);
    expect(computeStats(m, weapon('orb', 5), armorOf('mage')).thorns).toBe(1);
  });

  it('усталость не может стать лучше 1', () => {
    const b = heroDef('berserk');
    const s = computeStats(b, weapon('axe', 5, 5), armorOf('berserk'));
    expect(s.fatigue).toBeLessThanOrEqual(1);
    expect(s.fatigue).toBeCloseTo(0.95);
  });
});

describe('перки баз в бою', () => {
  it('булава бьёт сквозь блок врага', () => {
    const { state, rng } = mkBattle('warrior', ['wolf'], weapon('mace', 5));
    const wolf = state.enemies[0];
    wolf.block = 10;
    performAction(state, { type: 'attack', target: wolf.uid }, rng);
    expect(wolf.hp).toBe(12 - 5);
    expect(wolf.block).toBe(10);
  });

  it('копьё отдаёт часть урона следующему врагу', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'wolf'], weapon('spear', 10));
    const [a, b] = state.enemies;
    performAction(state, { type: 'attack', target: a.uid }, rng);
    expect(a.hp).toBe(2);
    expect(b.hp).toBe(12 - 3);
  });

  it('молот критует втрое', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], weapon('hammer', 5));
    state.hero.stats.crit = 1;
    const bear = state.enemies[0];
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(bear.hp).toBe(35 - 15);
  });

  it('дротики вешают кровотечение на 2 хода', () => {
    const { state, rng } = mkBattle('archer', ['bear'], weapon('darts', 5));
    const bear = state.enemies[0];
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(getStatus(bear, 'bleed')).toEqual({ id: 'bleed', value: 1, turns: 2 });
  });

  it('праща оглушает критом', () => {
    const { state, rng } = mkBattle('archer', ['bear'], weapon('sling', 5));
    state.hero.stats.crit = 1;
    const bear = state.enemies[0];
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(bear.hp).toBe(35 - 10);
    expect(getStatus(bear, 'stun')).toBeDefined();
  });

  it('арбалет даёт блок за каждый выстрел', () => {
    const { state, rng } = mkBattle('archer', ['bear'], weapon('crossbow', 5));
    const bear = state.enemies[0];
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(state.hero.block).toBe(2);
  });

  it('лук усиливает только первый удар в ходу', () => {
    const { state, rng } = mkBattle('archer', ['bear']);
    const bear = state.enemies[0];
    expect(previewAttack(state)).toEqual({ min: 7, max: 7 });
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(bear.hp).toBe(35 - 7);
    expect(previewAttack(state)).toEqual({ min: 3, max: 3 });
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(bear.hp).toBe(35 - 7 - 3);
  });

  it('дальнее оружие не боится шипов, ближнее — боится', () => {
    const ranged = mkBattle('archer', ['bear']);
    ranged.state.enemies[0].statuses.push({ id: 'thorns', value: 3, turns: -1 });
    const hp0 = ranged.state.hero.hp;
    performAction(ranged.state, { type: 'attack', target: ranged.state.enemies[0].uid }, ranged.rng);
    expect(ranged.state.hero.hp).toBe(hp0);

    const melee = mkBattle('warrior', ['bear']);
    melee.state.enemies[0].statuses.push({ id: 'thorns', value: 3, turns: -1 });
    const hp1 = melee.state.hero.hp;
    performAction(melee.state, { type: 'attack', target: melee.state.enemies[0].uid }, melee.rng);
    expect(melee.state.hero.hp).toBe(hp1 - 3);
  });

  it('скипетр лечит за каждое заклинание', () => {
    const { state, rng } = mkBattle('mage', ['bear'], { ...weapon('scepter', 3), slots: [{ id: 'fireball', tier: 1 }] });
    state.hero.hp = 10;
    performAction(state, { type: 'artifact', artifactId: 'fireball', target: state.enemies[0].uid }, rng);
    expect(state.hero.hp).toBe(11);
  });
});

describe('ярость берсерка', () => {
  it('стоит кровь, даёт стамину и Силу на ход, перезаряжается', () => {
    const { state, rng } = mkBattle('berserk', ['bear']);
    expect(state.hero.sta).toBe(3); // шкура без перка: лишней стамины в первый ход нет
    const hp0 = state.hero.hp;
    performAction(state, { type: 'artifact', artifactId: 'rage' }, rng);
    expect(state.hero.hp).toBe(hp0 - 3);
    expect(state.hero.sta).toBe(6);
    expect(getStatus(state.hero, 'strength')?.value).toBe(1);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'rage' })).toMatch(/Перезарядка/);
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(getStatus(state.hero, 'strength')).toBeUndefined();
  });

  it('самоурон идёт мимо блока и не доступен при малом HP', () => {
    const { state, rng } = mkBattle('berserk', ['bear']);
    performAction(state, { type: 'defend' }, rng);
    const block = state.hero.block;
    const hp0 = state.hero.hp;
    performAction(state, { type: 'artifact', artifactId: 'rage' }, rng);
    expect(state.hero.block).toBe(block);
    expect(state.hero.hp).toBe(hp0 - 3);

    const low = mkBattle('berserk', ['bear']);
    low.state.hero.hp = 3;
    expect(canUseAction(low.state, { type: 'artifact', artifactId: 'rage' })).toBe('Слишком мало HP');
    low.state.hero.hp = 4;
    expect(canUseAction(low.state, { type: 'artifact', artifactId: 'rage' })).toBeNull();
  });
});

describe('золото и переброс', () => {
  function winBattle(run: RunState): void {
    const b = run.battle!;
    b.hero.hp = 99999;
    b.hero.maxHp = 99999;
    b.hero.stats.dmgMin = 999;
    b.hero.stats.dmgMax = 999;
    let guard = 0;
    while (b.phase !== 'won' && guard++ < 200) {
      if (b.phase === 'player') {
        const e = b.enemies[0];
        if (e && b.hero.sta > 0) battleAction(run, { type: 'attack', target: e.uid });
        else battleEndTurn(run);
      } else battleEnemyStep(run);
    }
    expect(b.phase).toBe('won');
    finishBattle(run);
  }

  it('старт 10, за бой капает, переброс стоит золото и доступен один раз', () => {
    const run = newRun('warrior', 21);
    expect(run.gold).toBe(START_GOLD);
    enterRoom(run);
    winBattle(run);
    expect(run.phase).toBe('reward');
    expect(run.gold).toBe(START_GOLD + goldReward('fight'));
    expect(canReroll(run)).toBeNull();
    const before = run.rewards[0].options;
    expect(rerollReward(run)).toBe(true);
    expect(run.gold).toBe(START_GOLD + goldReward('fight') - REROLL_COST);
    expect(run.rewards[0].rerolled).toBe(true);
    expect(run.rewards[0].options).not.toBe(before);
    expect(run.rewards[0].options.length).toBe(3);
    expect(canReroll(run)).toMatch(/уже/);
    expect(rerollReward(run)).toBe(false);
  });

  it('без золота переброс недоступен', () => {
    const run = newRun('warrior', 22);
    enterRoom(run);
    winBattle(run);
    run.gold = REROLL_COST - 1;
    expect(canReroll(run)).toMatch(/золота/);
    expect(rerollReward(run)).toBe(false);
    expect(run.rewards[0].rerolled).toBe(false);
  });

  it('элита и босс платят больше обычного боя', () => {
    expect(goldReward('elite')).toBeGreaterThan(goldReward('fight'));
    expect(goldReward('boss')).toBeGreaterThan(goldReward('elite'));
    expect(goldReward('event')).toBe(0);
  });
});

describe('предпросмотр смены экипировки', () => {
  it('оружие: урон, сокеты, перк и переезд артефактов считаются на копии героя', () => {
    const run = newRun('warrior', 1);
    const def = heroDef('warrior');
    const hammer: GearInstance = { kind: 'weapon', tier: 4, base: 'mace', name: 'Рунная булава', dmgMin: 7, dmgMax: 12, def: 0, hp: 0, affix: null, slots: [null, null, null] };
    const p = previewGearSwap(def, run.hero, hammer);
    expect(p.after.dmgMax).toBeGreaterThan(p.before.dmgMax);
    expect(p.slotsBefore).toBe(1);
    expect(p.slotsAfter).toBe(3);
    expect(p.perkBefore).toContain('Парирование');
    expect(p.perkAfter).toBe(weaponsPerk('mace', 4));
    expect(p.moved.map((a) => a.id)).toEqual(['heavy_strike']);
    expect(p.overflow).toEqual([]);
    // Сам герой не изменился.
    expect(run.hero.weapon.base).toBe('sword');
    expect(run.hero.weapon.slots[0]?.id).toBe('heavy_strike');
  });

  it('броня: DEF и HP растут, лишние артефакты попадают в overflow, перк неносимой брони пустой', () => {
    const run = newRun('mage', 1);
    const def = heroDef('mage');
    run.hero.armor.slots = [{ id: 'troll_heart', tier: 1 }];
    run.hero.armor.slots.push({ id: 'luck_talisman', tier: 1 });
    const plate: GearInstance = { kind: 'armor', tier: 3, base: 'plate', name: 'Латы', dmgMin: 0, dmgMax: 0, def: 3, hp: 7, affix: null, slots: [null] };
    const p = previewGearSwap(def, run.hero, plate);
    expect(p.after.def - p.before.def).toBe(3 - run.hero.armor.def);
    expect(p.moved.length).toBe(1);
    expect(p.overflow.length).toBe(1);
    // Маг не умеет носить тяжёлую броню: перк лат не работает.
    expect(p.perkAfter).toBe('');
  });
});

function weaponsPerk(base: string, tier: GearTier): string {
  return `${baseOf('weapon', base).perk!.name}: ${baseOf('weapon', base).perk!.text(tier)}`;
}
