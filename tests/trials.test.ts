import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { heroDef } from '../src/data/heroes';
import { makeStartingGear } from '../src/data/gear';
import { LOCATIONS } from '../src/data/locations';
import { TRIALS, TRIAL_LIST, trialValue, trialsOf } from '../src/data/trials';
import { computeIntent, createBattle, endTurn, getStatus, heroDefendGain, performAction, resolveEnemyTurn } from '../src/engine/combat';
import { advanceRoom, awaitsTrial, canChooseTrial, chooseTrial, enterRoom, newRun } from '../src/engine/run';
import { runReport } from '../src/engine/report';
import { playRun, trialCost } from './sim/bot';
import type { BattleState, HeroPersistent } from '../src/engine/types';

// Испытания локаций (v0.48, docs/plan-reworka.md §4): два из трёх перед локацией, выбор обязателен, действует до конца локации.

function mkBattle(enemies: string[], trial: string, heroId = 'warrior', act = 0) {
  const def = heroDef(heroId);
  const gear = makeStartingGear(def);
  const mid = Math.round((gear.weapon.dmgMin + gear.weapon.dmgMax) / 2);
  gear.weapon.dmgMin = mid;
  gear.weapon.dmgMax = mid;
  const hero: HeroPersistent = { defId: heroId, signature: def.signatures[0], innateTier: 1, trait: def.traits[0], hp: 999, weapon: gear.weapon, armor: gear.armor, potion: null };
  const rng = createRng(1);
  const state = createBattle(def, hero, enemies, rng, act, trial);
  state.hero.stats.crit = 0;
  return { state, rng };
}

const pass = (state: BattleState, rng: ReturnType<typeof createRng>) => {
  endTurn(state);
  resolveEnemyTurn(state, rng);
};

describe('испытания: данные и порог', () => {
  it('у каждой локации ровно три испытания', () => {
    for (const loc of LOCATIONS) expect(trialsOf(loc.id).length, loc.id).toBe(3);
    expect(TRIAL_LIST.length).toBe(18);
    expect(trialValue(2, 0)).toBe(2);
    expect(trialValue(2, 2)).toBe(4);
  });

  it('без испытаний (тесты движка) забег идёт как раньше; с испытаниями в клетку не войти до выбора', () => {
    const off = newRun('warrior', 5);
    expect(awaitsTrial(off)).toBe(false);
    const run = newRun('warrior', 5, 0, undefined, undefined, { trials: true });
    expect(awaitsTrial(run)).toBe(true);
    expect(run.trialOffer.length).toBe(2);
    for (const id of run.trialOffer) expect(TRIALS[id].location).toBe(run.locations[0]);
    enterRoom(run);
    expect(run.phase).toBe('map');
    expect(run.battle).toBeNull();
    const other = trialsOf(run.locations[0]).find((t) => !run.trialOffer.includes(t.id))!;
    expect(canChooseTrial(run, other.id)).toBe('Этого испытания нет в предложении');
    expect(chooseTrial(run, run.trialOffer[1])).toBe(true);
    expect(run.trial).not.toBeNull();
    expect(run.trialLog).toEqual([run.trial]);
    enterRoom(run);
    expect(run.phase).toBe('battle');
    expect(run.battle!.trial).toBe(run.trial);
  });

  it('новая локация — новое предложение, испытание сброшено; запись в статистике', () => {
    const run = newRun('warrior', 5, 0, undefined, undefined, { trials: true });
    chooseTrial(run, run.trialOffer[0]);
    run.roomIndex = 9;
    advanceRoom(run);
    expect(run.locationIndex).toBe(1);
    expect(awaitsTrial(run)).toBe(true);
    for (const id of run.trialOffer) expect(TRIALS[id].location).toBe(run.locations[1]);
    chooseTrial(run, run.trialOffer[0]);
    const r = runReport(run, { event: 'abandoned', player: 'p', playerRuns: 0, debug: true, now: 0 } as Parameters<typeof runReport>[1]);
    expect(r.trials.split(',')).toEqual(run.trialLog);
  });

  it('бот выбирает испытание по сборке и проходит забег с испытаниями', () => {
    const run = newRun('mage', 11, 0, undefined, undefined, { trials: true });
    run.hero.armor.slots = [{ id: 'heat_ward', tier: 1 }];
    // Жаропрочность гасит Зной и Огненную кровь.
    expect(trialCost(run, 'heat')).toBeLessThan(trialCost(run, 'hot_armor') + 2);
    expect(trialCost(run, 'fire_blood')).toBe(0);
    const outcome = playRun(newRun('warrior', 3, 0, undefined, undefined, { trials: true }));
    expect(['victory', 'defeat', 'stall']).toContain(outcome);
  });
});

describe('испытания: правила в бою', () => {
  it('Стая и Кладка — лишний враг в обычном бою', () => {
    const run = newRun('warrior', 5, 0, undefined, undefined, { trials: true });
    run.trial = 'pack';
    run.trialOffer = [];
    enterRoom(run);
    expect(run.battle!.enemies.some((e) => e.defId === 'wolf')).toBe(true);
  });

  it('Засада: враги ходят до первого хода героя', () => {
    const { state } = mkBattle(['wolf'], 'ambush');
    expect(state.turn).toBe(1);
    expect(state.log.some((l) => l.startsWith('Волк атакует'))).toBe(true);
  });

  it('Чаща: в первый ход намерения скрыты, со второго — видны', () => {
    const { state, rng } = mkBattle(['wolf'], 'thicket');
    expect(computeIntent(state.enemies[0], state).hidden).toBe(true);
    pass(state, rng);
    expect(computeIntent(state.enemies[0], state).hidden).toBe(false);
  });

  it('Трясина, Зной, Могильный холод, Топь и Качка — на герое в начале боя', () => {
    expect(getStatus(mkBattle(['wolf'], 'mire', 'warrior', 2).state.hero, 'poison')).toEqual({ id: 'poison', value: trialValue(1, 2), turns: 3 });
    expect(getStatus(mkBattle(['wolf'], 'heat').state.hero, 'burn')?.value).toBe(1);
    expect(getStatus(mkBattle(['wolf'], 'grave_chill').state.hero, 'weak')?.turns).toBe(2);
    const bog = mkBattle(['wolf'], 'bog').state;
    expect(bog.hero.sta).toBe(bog.hero.maxSta - 1);
    const roll = mkBattle(['wolf'], 'rolling', 'mage').state;
    expect(roll.hero.mp).toBe(roll.hero.maxMp - 1);
  });

  it('Зной: Горение на герое тикает на 1 сильнее', () => {
    const { state, rng } = mkBattle(['bat'], 'heat');
    state.enemies[0].statuses.push({ id: 'stun', value: 1, turns: -1 });
    const hp = state.hero.hp;
    pass(state, rng);
    expect(state.hero.hp).toBe(hp - 2);
  });

  it('Болотные огни и Рой — на врагах с начала боя', () => {
    expect(getStatus(mkBattle(['wolf'], 'wisps').state.enemies[0], 'dodge')?.value).toBe(1);
    expect(getStatus(mkBattle(['wolf'], 'hive_thorns', 'warrior', 1).state.enemies[0], 'thorns')?.value).toBe(trialValue(1, 1));
  });

  it('Неупокоенные: первый павший встаёт с половиной HP, второй — нет', () => {
    const { state, rng } = mkBattle(['rat', 'rat'], 'restless');
    const [a, b] = state.enemies;
    a.hp = 1;
    performAction(state, { type: 'attack', target: a.uid }, rng);
    expect(state.enemies).toContain(a);
    expect(a.hp).toBe(Math.ceil(a.maxHp / 2));
    b.hp = 1;
    performAction(state, { type: 'attack', target: a.uid === state.enemies[0].uid ? a.uid : b.uid }, rng);
    state.enemies.forEach((e) => (e.hp = 1));
    performAction(state, { type: 'attack', target: state.enemies[0].uid }, rng);
    expect(state.risen).toBe(true);
  });

  it('Проклятие склепа, Кислота и Раскалённый доспех', () => {
    const curse = mkBattle(['wolf'], 'crypt_curse', 'paladin');
    curse.state.hero.hp = 10;
    curse.state.hero.statuses = [];
    performAction(curse.state, { type: 'artifact', artifactId: 'light_hammer', target: curse.state.enemies[0].uid }, curse.rng);
    expect(curse.state.hero.hp).toBe(11);
    const plain = mkBattle(['wolf'], '');
    const acid = mkBattle(['wolf'], 'acid');
    const hot = mkBattle(['wolf'], 'hot_armor');
    expect(heroDefendGain(acid.state)).toBe(Math.floor(heroDefendGain(plain.state) * 0.75));
    expect(heroDefendGain(hot.state)).toBe(Math.floor(heroDefendGain(plain.state) * 0.7));
  });

  it('Огненная кровь и Абордаж: смерть врага жжёт героя и злит живых', () => {
    const fire = mkBattle(['rat', 'rat'], 'fire_blood');
    fire.state.enemies[0].hp = 1;
    performAction(fire.state, { type: 'attack', target: fire.state.enemies[0].uid }, fire.rng);
    expect(getStatus(fire.state.hero, 'burn')?.value).toBe(2);
    const board = mkBattle(['rat', 'rat'], 'boarding');
    board.state.enemies[0].hp = 1;
    performAction(board.state, { type: 'attack', target: board.state.enemies[0].uid }, board.rng);
    expect(getStatus(board.state.enemies[0], 'strength')?.value).toBe(1);
  });

  it('Канонада: на третьем ходу все теряют 10 % максимума, не погибая', () => {
    const { state, rng } = mkBattle(['golem'], 'cannonade');
    const golem = state.enemies[0];
    golem.statuses.push({ id: 'stun', value: 1, turns: -1 });
    pass(state, rng);
    golem.statuses.push({ id: 'stun', value: 1, turns: -1 });
    const eHp = golem.hp;
    const hHp = state.hero.hp;
    pass(state, rng);
    expect(state.turn).toBe(3);
    expect(golem.hp).toBe(eHp - Math.ceil(golem.maxHp * 0.1));
    expect(state.hero.hp).toBe(hHp - Math.ceil(state.hero.maxHp * 0.1));
  });
});
