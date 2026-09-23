import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { HERO_LIST, heroDef } from '../src/data/heroes';
import { ARTIFACTS } from '../src/data/artifacts';
import { TRAITS } from '../src/data/traits';
import { baseOf, makeStartingGear } from '../src/data/gear';
import {
  HERO_MASTERY,
  LOCKED,
  MASTERY_LEVELS,
  achievementKey,
  artifactUnlocked,
  legacyXp,
  lockedArtifacts,
  masteryLevel,
  nextLevelXp,
  runXp,
  unlockText,
} from '../src/data/mastery';
import { canDropFor, rollArtifact } from '../src/engine/loot';
import { createBattle, endTurn, getStatus, performAction, resolveEnemyTurn } from '../src/engine/combat';
import { enterRoom, fullSets, newRun } from '../src/engine/run';
import type { BattleState, HeroPersistent } from '../src/engine/types';

describe('мастерство героя (v0.45)', () => {
  it('уровни 1–5 по порогам опыта', () => {
    expect(MASTERY_LEVELS).toEqual([0, 40, 100, 180, 300]);
    expect(masteryLevel(0)).toBe(1);
    expect(masteryLevel(39)).toBe(1);
    expect(masteryLevel(40)).toBe(2);
    expect(masteryLevel(299)).toBe(4);
    expect(masteryLevel(10_000)).toBe(5);
    expect(nextLevelXp(1)).toBe(40);
    expect(nextLevelXp(5)).toBeNull();
  });

  it('опыт за забег: клетки до 30, 10 за босса, 20 за победу', () => {
    const run = newRun('warrior', 1);
    run.stats.roomsCleared = 12;
    run.logs.push({ title: 'x', kind: 'boss', result: 'won', turns: 5, dealt: {}, lines: [] });
    run.logs.push({ title: 'y', kind: 'fight', result: 'won', turns: 3, dealt: {}, lines: [] });
    expect(runXp(run)).toBe(12 + 10);
    run.phase = 'victory';
    run.stats.roomsCleared = 40;
    expect(runXp(run)).toBe(30 + 10 + 20);
    expect(legacyXp(3, 1)).toBe(3 * 15 + 40);
  });

  it('у каждого героя награды мастерства существуют: вторая черта его, стартовое оружие — его типа', () => {
    for (const def of HERO_LIST) {
      const m = HERO_MASTERY[def.id];
      expect(TRAITS[m.trait]?.hero, def.id).toBe(def.id);
      expect(def.traits).toContain(m.trait);
      expect(() => baseOf('weapon', m.start)).not.toThrow();
      const g = makeStartingGear(def, m.start).weapon;
      expect(g.base).toBe(m.start);
      expect(g.tier).toBe(1);
      expect(g.slots).toEqual([null]);
    }
  });

  it('закрытые артефакты: только существующие, открываются мастерством или достижением', () => {
    for (const id of Object.keys(LOCKED)) expect(ARTIFACTS[id], id).toBeDefined();
    const fresh = { heroXp: {}, achievements: [] };
    const locked = lockedArtifacts(fresh);
    expect(locked).toContain('blood_bath');
    expect(locked).toContain('pyromancer');
    expect(artifactUnlocked(fresh, 'fireball')).toBe(true);
    expect(artifactUnlocked({ heroXp: { mage: 100 }, achievements: [] }, 'pyromancer')).toBe(true);
    expect(artifactUnlocked({ heroXp: {}, achievements: [achievementKey('set', 'blood')] }, 'blood_bath')).toBe(true);
    expect(artifactUnlocked({ heroXp: {}, achievements: [achievementKey('set', 'blood')] }, 'blood_oath')).toBe(false);
    expect(unlockText('blood_oath')).toContain('босса');
    expect(unlockText('pyromancer')).toContain('Маг');
  });

  it('закрытое не выпадает; newRun кладёт список в героя и берёт стартовое оружие', () => {
    const run = newRun('warrior', 1, 0, 'shield_bash', 'stance', { locked: ['blood_bath'], start: 'hammer' });
    expect(run.hero.locked).toEqual(['blood_bath']);
    expect(run.hero.start).toBe('hammer');
    expect(run.hero.weapon.base).toBe('hammer');
    expect(canDropFor(run.hero, 'blood_bath')).toBe(false);
    expect(canDropFor(run.hero, 'bleed_burst')).toBe(true);
    const rng = createRng(4);
    for (let i = 0; i < 500; i++) expect(rollArtifact(rng, run.hero, [1], [])!.id).not.toBe('blood_bath');
  });

  it('набор 3/3 засчитывается при входе в бой, навык героя идёт в счёт', () => {
    const run = newRun('mage', 1, 0, 'fire_wave');
    run.hero.weapon.slots = [{ id: 'fireball', tier: 1 }];
    run.hero.armor.slots = [{ id: 'heat_ward', tier: 1 }];
    expect(fullSets(run)).toEqual(['fire']);
    enterRoom(run);
    expect(run.setsReached).toEqual(['fire']);
  });
});

describe('вторые черты (v0.45)', () => {
  function mkBattle(heroId: string, trait: string, enemies: string[]) {
    const def = heroDef(heroId);
    const gear = makeStartingGear(def);
    const mid = Math.round((gear.weapon.dmgMin + gear.weapon.dmgMax) / 2);
    gear.weapon.dmgMin = mid;
    gear.weapon.dmgMax = mid;
    const hero: HeroPersistent = { defId: heroId, signature: def.signatures[0], innateTier: 1, trait, hp: 999, weapon: gear.weapon, armor: gear.armor, potion: null };
    const rng = createRng(1);
    const state = createBattle(def, hero, enemies, rng);
    state.hero.stats.crit = 0;
    return { state, rng };
  }
  const pass = (state: BattleState, rng: ReturnType<typeof createRng>) => {
    endTurn(state);
    resolveEnemyTurn(state, rng);
  };

  it('Страж: 3 блока за убитого врага', () => {
    const { state, rng } = mkBattle('warrior', 'guard', ['rat', 'rat']);
    state.enemies[0].hp = 1;
    performAction(state, { type: 'attack', target: state.enemies[0].uid }, rng);
    expect(state.hero.block).toBe(3);
  });

  it('Перегрев: второе заклинание в ходу дешевле на 1 MP и ранит Мага на 1', () => {
    const { state, rng } = mkBattle('mage', 'overheat', ['bear']);
    const bear = state.enemies[0];
    const mp = state.hero.mp;
    const hp = state.hero.hp;
    performAction(state, { type: 'artifact', artifactId: 'magic_missile', target: bear.uid }, rng);
    expect(state.hero.mp).toBe(mp - 1);
    performAction(state, { type: 'artifact', artifactId: 'magic_missile', target: bear.uid }, rng);
    // Стрела стоит 1 MP — после первого заклинания бесплатна; второе обжигает.
    expect(state.hero.mp).toBe(mp - 1);
    expect(state.hero.hp).toBe(hp - 1);
  });

  it('Метка жертвы: первый удар по каждому врагу — крит, второй — нет', () => {
    const { state, rng } = mkBattle('assassin', 'prey', ['bear']);
    state.hero.statuses = state.hero.statuses.filter((s) => s.id !== 'stealth');
    const bear = state.enemies[0];
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(state.log.some((l) => l.startsWith('Герой бьёт') && l.includes('крит'))).toBe(true);
    const before = state.log.length;
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(state.log.slice(before).some((l) => l.startsWith('Герой бьёт') && l.includes('крит'))).toBe(false);
  });

  it('Искупление: лечение в первый ход вдвое', () => {
    const { state, rng } = mkBattle('paladin', 'redemption', ['bear']);
    state.hero.hp = 10;
    performAction(state, { type: 'artifact', artifactId: 'light_hammer', target: state.enemies[0].uid }, rng);
    // Молот лечит 2 на первом уровне — в первый ход 4.
    expect(state.hero.hp).toBe(14);
  });

  it('Жажда: за убитого 3 HP и +1 Сила до конца боя', () => {
    const { state, rng } = mkBattle('berserk', 'thirst', ['rat', 'rat']);
    state.hero.hp = 10;
    state.enemies[0].hp = 1;
    performAction(state, { type: 'attack', target: state.enemies[0].uid }, rng);
    expect(state.hero.hp).toBe(13);
    expect(getStatus(state.hero, 'strength')).toEqual({ id: 'strength', value: 1, turns: -1 });
    pass(state, rng);
    expect(getStatus(state.hero, 'strength')?.value).toBe(1);
  });

  it('Засада: первый удар боя по второму в ряду оглушает, первому — нет', () => {
    const far = mkBattle('archer', 'ambush', ['bear', 'bear']);
    performAction(far.state, { type: 'attack', target: far.state.enemies[1].uid }, far.rng);
    expect(getStatus(far.state.enemies[1], 'stun')).toBeDefined();
    const near = mkBattle('archer', 'ambush', ['bear', 'bear']);
    performAction(near.state, { type: 'attack', target: near.state.enemies[0].uid }, near.rng);
    performAction(near.state, { type: 'attack', target: near.state.enemies[1].uid }, near.rng);
    expect(getStatus(near.state.enemies[1], 'stun')).toBeUndefined();
  });
});
