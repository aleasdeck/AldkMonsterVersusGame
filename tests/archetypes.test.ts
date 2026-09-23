import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { heroDef } from '../src/data/heroes';
import { makeStartingGear } from '../src/data/gear';
import { ARTIFACTS, artifactDef } from '../src/data/artifacts';
import { ARCHETYPE_LIST, activeSets, archetypeCounts, setMods } from '../src/data/archetypes';
import { canUseAction, createBattle, endTurn, getStatus, performAction, resolveEnemyTurn } from '../src/engine/combat';
import { computeStats } from '../src/engine/stats';
import { rollArtifact } from '../src/engine/loot';
import { canPendingSmelt, newRun, pendingSmelt, smeltTargets } from '../src/engine/run';
import type { ArtifactInstance, BattleState, HeroPersistent } from '../src/engine/types';

/** Герой со средним уроном оружия и артефактами только из списка — без стартовой сигнатуры, чтобы наборы считались чисто. */
function mkHero(heroId: string, arts: ArtifactInstance[]): HeroPersistent {
  const def = heroDef(heroId);
  const gear = makeStartingGear(def);
  const mid = Math.round((gear.weapon.dmgMin + gear.weapon.dmgMax) / 2);
  gear.weapon.dmgMin = mid;
  gear.weapon.dmgMax = mid;
  gear.weapon.slots = arts.slice();
  gear.weapon.slotKinds = [];
  gear.armor.slots = [];
  gear.armor.slotKinds = [];
  return { defId: heroId, signature: def.signatures[0], hp: 999, weapon: gear.weapon, armor: gear.armor, potion: null };
}

function mkBattle(heroId: string, enemies: string[], arts: ArtifactInstance[]) {
  const rng = createRng(1);
  const hero = mkHero(heroId, arts);
  const state = createBattle(heroDef(heroId), hero, enemies, rng);
  state.hero.stats.crit = 0;
  return { state, rng, hero };
}

function pass(state: BattleState, rng: ReturnType<typeof createRng>) {
  endTurn(state);
  resolveEnemyTurn(state, rng);
}

const a = (id: string, tier: 1 | 2 | 3 = 1): ArtifactInstance => ({ id, tier });

describe('архетипы и наборы (v0.43)', () => {
  it('у каждой метки есть архетип, у ключевой вещи — метка', () => {
    const ids = new Set(ARCHETYPE_LIST.map((x) => x.id));
    for (const def of Object.values(ARTIFACTS)) {
      for (const t of def.tags ?? []) expect(ids.has(t), `${def.id}: ${t}`).toBe(true);
      if (def.keystone) expect(def.tags?.length, def.id).toBeGreaterThan(0);
    }
  });

  it('счёт набора: вещь с двумя метками идёт в оба, пороги 2 и 3', () => {
    const counts = archetypeCounts([a('bleed_cut'), a('leech_charm'), a('fireball')]);
    expect(counts).toEqual({ blood: 2, poison: 1, fire: 1 });
    const sets = activeSets(counts);
    expect(sets.map((s) => s.arch.id)).toEqual(['blood']);
    expect(setMods(archetypeCounts([a('bleed_cut'), a('blood_trail'), a('jagged_edge')]))).toEqual([{ bleedAdd: 1 }, { bleedTwice: 1 }]);
  });

  it('бонус набора попадает в статы героя', () => {
    const hero = mkHero('warrior', [a('bleed_cut'), a('blood_trail')]);
    const s = computeStats(heroDef('warrior'), hero.weapon, hero.armor);
    expect(s.bleedAdd).toBe(1);
    expect(s.bleedTwice).toBe(0);
  });

  it('Кровь 2/3: каждое Кровотечение от героя сильнее на 1', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], [a('bleed_cut'), a('blood_trail')]);
    const bear = state.enemies[0];
    performAction(state, { type: 'artifact', artifactId: 'bleed_cut', target: bear.uid }, rng);
    expect(getStatus(bear, 'bleed')).toEqual({ id: 'bleed', value: 4, turns: 3 });
  });

  it('Кровь 3/3: кровь тикает ещё раз перед ходом героя', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], [a('bleed_cut'), a('blood_trail'), a('jagged_edge')]);
    const bear = state.enemies[0];
    bear.statuses.push({ id: 'bleed', value: 3, turns: 3 });
    const hp = bear.hp;
    pass(state, rng);
    // Тик в ход медведя и ещё один перед ходом героя.
    expect(bear.hp).toBe(hp - 6);
    expect(state.log.some((l) => l.includes('истекает кровью: 3'))).toBe(true);
  });

  it('Зазубренное лезвие: удар вешает кровь, Кровавый след — доля по кровоточащей', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], [a('jagged_edge')]);
    const bear = state.enemies[0];
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(getStatus(bear, 'bleed')).toEqual({ id: 'bleed', value: 1, turns: 2 });
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(getStatus(bear, 'bleed')?.value).toBe(2);
  });

  it('Клятва крови: удар слабее на 30 %, кровь в полтора раза (вверх)', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], [a('blood_oath'), a('bleed_cut')]);
    const bear = state.enemies[0];
    const hp = bear.hp;
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    // Меч 5 × 0.7 = 3.5 → 3
    expect(bear.hp).toBe(hp - 3);
    performAction(state, { type: 'artifact', artifactId: 'bleed_cut', target: bear.uid }, rng);
    // Порез: Кровотечение (3 + набор «Кровь» 2/3: 1) × 1.5 = 6
    expect(getStatus(bear, 'bleed')?.value).toBe(6);
  });

  it('Кровавая баня: кровь с цели расходится на остальных долей силы', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'wolf', 'wolf'], [a('blood_bath')]);
    const [x, y, z] = state.enemies;
    x.statuses.push({ id: 'bleed', value: 5, turns: 3 });
    performAction(state, { type: 'artifact', artifactId: 'blood_bath', target: x.uid }, rng);
    // 50 % от 5 = 2.5 → 3 (округление к ближнему), срок тот же.
    expect(getStatus(y, 'bleed')).toEqual({ id: 'bleed', value: 3, turns: 3 });
    expect(getStatus(z, 'bleed')).toEqual({ id: 'bleed', value: 3, turns: 3 });
    expect(getStatus(x, 'bleed')?.value).toBe(5);
  });

  it('Огонь: Тлеющий клинок поджигает ударом, набор 2/3 усиливает Горение', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], [a('smoldering_blade'), a('fan_flames')]);
    const bear = state.enemies[0];
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(getStatus(bear, 'burn')).toEqual({ id: 'burn', value: 2, turns: 2 });
  });

  it('Испепеление: только по горящей, Горение × mult мимо блока, огонь остаётся', () => {
    const { state, rng } = mkBattle('mage', ['boar'], [a('incinerate')]);
    const boar = state.enemies[0];
    expect(canUseAction(state, { type: 'artifact', artifactId: 'incinerate', target: boar.uid })).toBe('Цель не горит');
    boar.statuses.push({ id: 'burn', value: 4, turns: 2 });
    boar.block = 10;
    performAction(state, { type: 'artifact', artifactId: 'incinerate', target: boar.uid }, rng);
    expect(boar.hp).toBe(18 - 8);
    expect(boar.block).toBe(10);
    expect(getStatus(boar, 'burn')?.value).toBe(4);
    expect(state.dealtBy.incinerate).toBe(8);
  });

  it('Жаропрочность: Горение на герое не держится, блок за каждого горящего врага', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'wolf'], [a('heat_ward', 2)]);
    for (const e of state.enemies) {
      e.statuses.push({ id: 'burn', value: 1, turns: 3 });
      e.intent = 'howl';
    }
    pass(state, rng);
    // Два горящих врага × 2 блока в начале хода.
    expect(state.hero.block).toBe(4);
    expect(state.log.some((l) => l.includes('жаропрочность, горят 2'))).toBe(true);
  });

  it('Жаропрочность: взрыв с Горением не поджигает героя', () => {
    const { state, rng } = mkBattle('warrior', ['kamikaze_imp'], [a('heat_ward')]);
    const imp = state.enemies[0];
    imp.intent = 'boom';
    pass(state, rng);
    expect(getStatus(state.hero, 'burn')).toBeUndefined();
  });

  it('Пироман: удар вдвое слабее, каждое заклинание поджигает всех', () => {
    const { state, rng } = mkBattle('mage', ['bear', 'bear'], [a('pyromancer'), a('magic_missile')]);
    const [x, y] = state.enemies;
    const hp = x.hp;
    performAction(state, { type: 'attack', target: x.uid }, rng);
    // Посох Мага: кубик 3–6 → середина 5 (4.5 вверх), × 0.5 = 2
    expect(hp - x.hp).toBe(Math.floor(5 * 0.5));
    performAction(state, { type: 'artifact', artifactId: 'magic_missile', target: y.uid }, rng);
    // Пироман и стрела — не набор: Горение 1 без прибавки.
    expect(getStatus(x, 'burn')?.value).toBe(1);
    expect(getStatus(y, 'burn')?.value).toBe(1);
  });

  it('Огонь 3/3: погибший горящий враг поджигает остальных', () => {
    const { state, rng } = mkBattle('warrior', ['rat', 'wolf'], [a('smoldering_blade'), a('fan_flames'), a('flame_burst')]);
    const [rat, wolf] = state.enemies;
    rat.hp = 1;
    rat.statuses.push({ id: 'burn', value: 3, turns: 2 });
    performAction(state, { type: 'attack', target: rat.uid }, rng);
    expect(state.enemies).toHaveLength(1);
    // 3 от пожара (кубик удара ушёл в крысу, заводка удара легла на неё же).
    expect(getStatus(wolf, 'burn')?.value).toBe(3);
    expect(state.log.some((l) => l.startsWith('Пожар: Крыса'))).toBe(true);
  });
});

describe('дроп и переплавка (v0.43)', () => {
  it('ключевая вещь выпадает только тиром 1', () => {
    const run = newRun('warrior', 5);
    const rng = createRng(9);
    for (let i = 0; i < 400; i++) {
      const art = rollArtifact(rng, run.hero, [2, 3], []);
      if (art && artifactDef(art.id).keystone) expect(art.tier).toBe(1);
    }
  });

  it('тяга к архетипу: с вещью Крови в сокете вещи Крови выпадают чаще', () => {
    const count = (withBlood: boolean) => {
      const run = newRun('warrior', 5);
      run.hero.weapon.slots = withBlood ? [a('bleed_burst')] : [null];
      run.hero.armor.slots = [null];
      const rng = createRng(3);
      let blood = 0;
      for (let i = 0; i < 1500; i++) {
        const art = rollArtifact(rng, run.hero, [1], []);
        if (art && artifactDef(art.id).tags?.includes('blood')) blood++;
      }
      return blood;
    };
    expect(count(true)).toBeGreaterThan(count(false) * 1.5);
  });

  it('переплавка: цель — тот же архетип не на максимуме, +1 тир, артефакт пропадает', () => {
    const run = newRun('warrior', 5);
    run.hero.weapon.slots = [a('bleed_burst', 1)];
    run.hero.weapon.slotKinds = ['weapon'];
    run.hero.armor.slots = [a('troll_heart', 1)];
    run.hero.armor.slotKinds = ['armor'];
    run.phase = 'reward';
    run.pending = { artifacts: [a('jagged_edge', 2)], cancellable: true, consumeReward: false };
    expect(smeltTargets(run, 'jagged_edge').map((s) => s.art!.id)).toEqual(['bleed_burst']);
    expect(canPendingSmelt(run, 'armor', 0)).toBe('Нет общего архетипа');
    expect(pendingSmelt(run, 'weapon', 0)).toBe(true);
    expect(run.hero.weapon.slots[0]).toEqual({ id: 'bleed_burst', tier: 2 });
    expect(run.pending).toBeNull();
  });

  it('переплавка общей вещи — в любой артефакт', () => {
    const run = newRun('warrior', 5);
    run.hero.weapon.slots = [a('bleed_burst', 3)];
    run.hero.armor.slots = [a('troll_heart', 1)];
    run.pending = { artifacts: [a('stamina_ring')], cancellable: false, consumeReward: false };
    // Вскрытие на максимуме — не цель.
    expect(smeltTargets(run, 'stamina_ring').map((s) => s.art!.id)).toEqual(['troll_heart']);
  });
});
