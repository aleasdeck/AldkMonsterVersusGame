import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { heroDef } from '../src/data/heroes';
import { makeStartingGear } from '../src/data/gear';
import {
  canUseAction,
  computeIntent,
  createBattle,
  endTurn,
  enemyStep,
  getStatus,
  performAction,
  resolveEnemyTurn,
} from '../src/engine/combat';
import type { ArtifactInstance, BattleState, HeroPersistent } from '../src/engine/types';

function mkHero(heroId: string, extra: ArtifactInstance[] = []): HeroPersistent {
  const def = heroDef(heroId);
  const gear = makeStartingGear(def);
  // Фиксируем урон оружия на среднем значении, чтобы ожидания в тестах были точными.
  const mid = Math.round((gear.weapon.dmgMin + gear.weapon.dmgMax) / 2);
  gear.weapon.dmgMin = mid;
  gear.weapon.dmgMax = mid;
  // Дополнительные артефакты — в расширенные слоты оружия.
  for (const a of extra) gear.weapon.slots.push(a);
  return { defId: heroId, hp: 999, weapon: gear.weapon, armor: gear.armor };
}

function mkBattle(heroId: string, enemies: string[], opts: { extra?: ArtifactInstance[]; seed?: number } = {}) {
  const rng = createRng(opts.seed ?? 1);
  const hero = mkHero(heroId, opts.extra);
  const state = createBattle(heroDef(heroId), hero, enemies, rng);
  return { state, rng };
}

function first(state: BattleState) {
  return state.enemies[0];
}

describe('базовые действия', () => {
  it('удар наносит урон оружия и тратит стамину', () => {
    const { state, rng } = mkBattle('warrior', ['wolf']);
    expect(state.hero.sta).toBe(3);
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    expect(first(state).hp).toBe(12 - 5);
    expect(state.hero.sta).toBe(2);
  });

  it('защита даёт блок = DEF героя + DEF брони, блок съедает урон врага', () => {
    const { state, rng } = mkBattle('warrior', ['wolf']);
    performAction(state, { type: 'defend' }, rng);
    expect(state.hero.block).toBe(7);
    const hpBefore = state.hero.hp;
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(state.hero.hp).toBe(hpBefore);
    expect(state.turn).toBe(2);
    expect(state.hero.block).toBe(0);
  });

  it('без блока враг бьёт по HP, стамина восстанавливается', () => {
    const { state, rng } = mkBattle('warrior', ['wolf']);
    const hpBefore = state.hero.hp;
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(state.hero.hp).toBe(hpBefore - 5);
    expect(state.hero.sta).toBe(3);
    expect(state.phase).toBe('player');
  });

  it('нельзя действовать без стамины', () => {
    const { state, rng } = mkBattle('paladin', ['boar']);
    performAction(state, { type: 'defend' }, rng);
    performAction(state, { type: 'defend' }, rng);
    expect(canUseAction(state, { type: 'defend' })).toBe('Нет стамины');
    expect(() => performAction(state, { type: 'defend' }, rng)).toThrow();
  });

  it('убийство всех врагов — победа', () => {
    const { state, rng } = mkBattle('berserk', ['wolf']);
    const uid = first(state).uid;
    performAction(state, { type: 'attack', target: uid }, rng);
    performAction(state, { type: 'attack', target: uid }, rng);
    performAction(state, { type: 'attack', target: uid }, rng);
    expect(state.enemies.length).toBe(0);
    expect(state.phase).toBe('won');
    expect(state.stats.kills).toBe(1);
  });

  it('смерть героя — поражение', () => {
    const { state, rng } = mkBattle('mage', ['golem']);
    state.hero.hp = 3;
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(state.hero.hp).toBe(0);
    expect(state.phase).toBe('lost');
  });
});

describe('намерения', () => {
  it('показывают итоговый урон с учётом баффа силы', () => {
    const { state, rng } = mkBattle('warrior', ['wolf']);
    const wolf = first(state);
    expect(computeIntent(wolf)).toMatchObject({ kind: 'attack', label: '5' });
    // цикл: укус, укус, вой
    for (let i = 0; i < 3; i++) {
      endTurn(state);
      resolveEnemyTurn(state, rng);
    }
    expect(getStatus(wolf, 'strength')?.value).toBe(2);
    expect(computeIntent(wolf)).toMatchObject({ kind: 'attack', label: '7' });
  });

  it('вой усиливает всех волков, но не кабана', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'wolf', 'boar']);
    for (let i = 0; i < 3; i++) {
      endTurn(state);
      resolveEnemyTurn(state, rng);
    }
    expect(getStatus(state.enemies[0], 'strength')?.value).toBe(4);
    expect(getStatus(state.enemies[1], 'strength')?.value).toBe(4);
    expect(getStatus(state.enemies[2], 'strength')).toBeUndefined();
  });

  it('множественный удар подписан как N×M', () => {
    const { state } = mkBattle('warrior', ['cutthroat']);
    const e = first(state);
    e.intent = 'double';
    expect(computeIntent(e).label).toBe('3×2');
  });
});

describe('статусы', () => {
  it('кровотечение тикает 3 хода и игнорирует блок', () => {
    const { state, rng } = mkBattle('rogue', ['boar']);
    const boar = first(state);
    boar.intent = 'bristle';
    performAction(state, { type: 'artifact', artifactId: 'bleed_cut', target: boar.uid }, rng);
    expect(getStatus(boar, 'bleed')).toMatchObject({ value: 2, turns: 3 });
    const hp0 = boar.hp;
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(boar.hp).toBe(hp0 - 2);
    endTurn(state);
    resolveEnemyTurn(state, rng);
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(boar.hp).toBe(hp0 - 6);
    expect(getStatus(boar, 'bleed')).toBeUndefined();
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(boar.hp).toBe(hp0 - 6);
  });

  it('оглушение заставляет врага пропустить действие', () => {
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'stun_strike', tier: 1 }] });
    const boar = first(state);
    const hp0 = state.hero.hp;
    performAction(state, { type: 'artifact', artifactId: 'stun_strike', target: boar.uid }, rng);
    expect(getStatus(boar, 'stun')).toBeDefined();
    expect(state.hero.cooldowns.stun_strike).toBe(3);
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(state.hero.hp).toBe(hp0);
    expect(getStatus(boar, 'stun')).toBeUndefined();
    expect(boar.intent).toBe('ram');
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(state.hero.hp).toBe(hp0 - 7);
  });

  it('слабость режет урон героя на 25 %', () => {
    const { state, rng } = mkBattle('warrior', ['ghost']);
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(getStatus(state.hero, 'weak')).toBeDefined();
    const ghost = first(state);
    const hp0 = ghost.hp;
    performAction(state, { type: 'attack', target: ghost.uid }, rng);
    expect(ghost.hp).toBe(hp0 - Math.floor(5 * 0.75));
  });

  it('изнурение отнимает стамину на следующем ходу', () => {
    const { state, rng } = mkBattle('warrior', ['bear']);
    const bear = first(state);
    bear.intent = 'hug';
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(state.hero.sta).toBe(2);
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(state.hero.sta).toBe(3);
  });

  it('уклонение съедает один удар', () => {
    const { state, rng } = mkBattle('mage', ['cutthroat'], { extra: [{ id: 'dodge', tier: 1 }] });
    const e = first(state);
    e.intent = 'double';
    performAction(state, { type: 'artifact', artifactId: 'dodge' }, rng);
    const hp0 = state.hero.hp;
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(state.hero.hp).toBe(hp0 - 3);
    expect(getStatus(state.hero, 'dodge')).toBeUndefined();
  });

  it('шипы героя ранят атакующего', () => {
    const { state, rng } = mkBattle('warrior', ['wolf'], { extra: [{ id: 'thorns', tier: 2 }] });
    const wolf = first(state);
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(wolf.hp).toBe(12 - 2);
  });

  it('вампирский клык лечит при базовой атаке', () => {
    const { state, rng } = mkBattle('berserk', ['boar']);
    state.hero.hp = state.hero.maxHp - 10;
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    expect(state.hero.hp).toBe(state.hero.maxHp - 9);
  });
});

describe('мана и артефакты', () => {
  it('огненный шар тратит ману и бьёт по тиру + сила заклинаний', () => {
    const { state, rng } = mkBattle('mage', ['boar'], { extra: [{ id: 'sage_eye', tier: 1 }] });
    const boar = first(state);
    expect(state.hero.mp).toBe(13);
    performAction(state, { type: 'artifact', artifactId: 'fireball', target: boar.uid }, rng);
    expect(boar.hp).toBe(18 - 8);
    expect(state.hero.mp).toBe(10);
  });

  it('мана восстанавливается на реген со второго хода', () => {
    const { state, rng } = mkBattle('mage', ['boar']);
    performAction(state, { type: 'artifact', artifactId: 'fireball', target: first(state).uid }, rng);
    expect(state.hero.mp).toBe(10);
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(state.hero.mp).toBe(12);
  });

  it('кольцо выносливости даёт стамину только в первый ход', () => {
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'stamina_ring', tier: 2 }] });
    expect(state.hero.sta).toBe(5);
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(state.hero.sta).toBe(3);
  });

  it('кулдаун убывает по ходам', () => {
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'second_wind', tier: 1 }] });
    performAction(state, { type: 'artifact', artifactId: 'second_wind' }, rng);
    expect(state.hero.sta).toBe(5);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'second_wind' })).toMatch(/Перезарядка/);
    for (let i = 0; i < 4; i++) {
      endTurn(state);
      resolveEnemyTurn(state, rng);
    }
    expect(canUseAction(state, { type: 'artifact', artifactId: 'second_wind' })).toBeNull();
  });

  it('боевой клич стакается', () => {
    const { state, rng } = mkBattle('berserk', ['boar']);
    performAction(state, { type: 'artifact', artifactId: 'war_cry' }, rng);
    performAction(state, { type: 'artifact', artifactId: 'war_cry' }, rng);
    expect(getStatus(state.hero, 'strength')?.value).toBe(2);
    const boar = first(state);
    performAction(state, { type: 'attack', target: boar.uid }, rng);
    expect(boar.hp).toBe(18 - 7);
  });

  it('вихрь бьёт всех', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'wolf'], { extra: [{ id: 'whirlwind', tier: 1 }] });
    performAction(state, { type: 'artifact', artifactId: 'whirlwind' }, rng);
    expect(state.enemies.every((e) => e.hp === 7)).toBe(true);
  });
});

describe('боссы', () => {
  it('взлёт даёт неуязвимость и обязательное пикирование', () => {
    const { state, rng } = mkBattle('warrior', ['dragon']);
    const d = first(state);
    d.intent = 'takeoff';
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(getStatus(d, 'invuln')).toBeDefined();
    expect(d.intent).toBe('dive');
    const hp0 = d.hp;
    performAction(state, { type: 'attack', target: d.uid }, rng);
    expect(d.hp).toBe(hp0);
    const heroHp = state.hero.hp;
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(state.hero.hp).toBe(heroHp - 22);
    expect(getStatus(d, 'invuln')).toBeUndefined();
    expect(d.intent).not.toBe('dive');
  });

  it('призыв не превышает лимит поля', () => {
    const { state, rng } = mkBattle('warrior', ['alpha_wolf', 'wolf', 'wolf']);
    const boss = first(state);
    boss.intent = 'howl';
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(state.enemies.length).toBe(3);
  });

  it('вожак призывает волка, если есть место', () => {
    const { state, rng } = mkBattle('warrior', ['alpha_wolf']);
    const boss = first(state);
    boss.intent = 'howl';
    endTurn(state);
    resolveEnemyTurn(state, rng);
    expect(state.enemies.length).toBe(2);
    expect(state.enemies[1].defId).toBe('wolf');
  });

  it('рёв дракона используется не больше двух раз', () => {
    const { state, rng } = mkBattle('warrior', ['dragon']);
    const d = first(state);
    state.hero.hp = 100000;
    state.hero.maxHp = 100000;
    let roars = 0;
    for (let i = 0; i < 60; i++) {
      if (d.intent === 'roar') roars++;
      endTurn(state);
      resolveEnemyTurn(state, rng);
    }
    expect(roars).toBeLessThanOrEqual(2);
    expect(getStatus(d, 'strength')?.value ?? 0).toBeLessThanOrEqual(6);
  });

  it('лич высасывает ману', () => {
    const { state, rng } = mkBattle('mage', ['lich']);
    const l = first(state);
    l.intent = 'wither';
    endTurn(state);
    resolveEnemyTurn(state, rng);
    // 10 базовых + 3 от Кристалла маны, −3 иссушение, +2 реген в начале следующего хода
    expect(state.hero.mp).toBe(13 - 3 + 2);
  });
});

describe('пошаговый ход врагов', () => {
  it('enemyStep обрабатывает по одному врагу', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'wolf']);
    const hp0 = state.hero.hp;
    endTurn(state);
    expect(state.phase).toBe('enemy');
    enemyStep(state, rng);
    expect(state.hero.hp).toBe(hp0 - 5);
    expect(state.phase).toBe('enemy');
    enemyStep(state, rng);
    expect(state.hero.hp).toBe(hp0 - 10);
    enemyStep(state, rng);
    expect(state.phase).toBe('player');
    expect(state.turn).toBe(2);
  });
});
