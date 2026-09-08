import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { heroDef } from '../src/data/heroes';
import { makeStartingGear } from '../src/data/gear';
import { ENEMY_LIST } from '../src/data/enemies';
import { LOCATIONS } from '../src/data/locations';
import {
  canUseAction,
  computeIntent,
  createBattle,
  endTurn,
  enemyStep,
  getStatus,
  performAction,
  previewAttack,
  resolveEnemyTurn,
} from '../src/engine/combat';
import type { ArtifactInstance, BattleState, GearTier, HeroPersistent } from '../src/engine/types';

function mkHero(heroId: string, extra: ArtifactInstance[] = [], potion: string | null = null): HeroPersistent {
  const def = heroDef(heroId);
  const gear = makeStartingGear(def);
  // Фиксируем урон оружия на среднем значении, чтобы ожидания в тестах были точными.
  const mid = Math.round((gear.weapon.dmgMin + gear.weapon.dmgMax) / 2);
  gear.weapon.dmgMin = mid;
  gear.weapon.dmgMax = mid;
  // Дополнительные артефакты — в расширенные слоты оружия.
  for (const a of extra) gear.weapon.slots.push(a);
  return { defId: heroId, hp: 999, weapon: gear.weapon, armor: gear.armor, potion };
}

function mkBattle(heroId: string, enemies: string[], opts: { extra?: ArtifactInstance[]; seed?: number; potion?: string } = {}) {
  const rng = createRng(opts.seed ?? 1);
  const hero = mkHero(heroId, opts.extra, opts.potion ?? null);
  const state = createBattle(heroDef(heroId), hero, enemies, rng);
  // криты выключаем, чтобы урон был детерминирован
  state.hero.stats.crit = 0;
  return { state, rng };
}

function first(state: BattleState) {
  return state.enemies[0];
}

function pass(state: BattleState, rng: ReturnType<typeof createRng>, times = 1) {
  for (let i = 0; i < times; i++) {
    endTurn(state);
    resolveEnemyTurn(state, rng);
  }
}

describe('базовые действия', () => {
  it('удар наносит урон оружия и тратит стамину', () => {
    const { state, rng } = mkBattle('warrior', ['wolf']);
    expect(state.hero.sta).toBe(3);
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    expect(first(state).hp).toBe(12 - 5);
    expect(state.hero.sta).toBe(2);
  });

  it('каждая следующая атака в ходу слабее', () => {
    const { state, rng } = mkBattle('warrior', ['bear']);
    const bear = first(state);
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    // 5, floor(5 × 0.75) = 3, floor(5 × 0.5625) = 2
    expect(bear.hp).toBe(35 - 5 - 3 - 2);
    // на новом ходу усталость сбрасывается
    pass(state, rng);
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    expect(bear.hp).toBe(35 - 5 - 3 - 2 - 5);
  });

  it('берсерк выдыхается медленнее остальных', () => {
    const w = mkBattle('warrior', ['bear']);
    const b = mkBattle('berserk', ['bear']);
    expect(w.state.hero.stats.fatigue).toBe(0.75);
    expect(b.state.hero.stats.fatigue).toBeCloseTo(0.9);
  });

  it('защита даёт 80 % от DEF героя + DEF брони, округление вверх; блок съедает урон врага', () => {
    const { state, rng } = mkBattle('warrior', ['wolf']);
    performAction(state, { type: 'defend' }, rng);
    // (6 героя + 1 кольчуга + 1 Парирование меча) × 0,8 = 6,4 → 7
    expect(state.hero.block).toBe(7);
    const hpBefore = state.hero.hp;
    pass(state, rng);
    expect(state.hero.hp).toBe(hpBefore);
    expect(state.turn).toBe(2);
    expect(state.hero.block).toBe(0);
  });

  it('защита — раз за ход', () => {
    const { state, rng } = mkBattle('warrior', ['wolf']);
    performAction(state, { type: 'defend' }, rng);
    expect(canUseAction(state, { type: 'defend' })).toMatch(/раз за ход/);
    pass(state, rng);
    expect(canUseAction(state, { type: 'defend' })).toBeNull();
  });

  it('без блока враг бьёт по HP, стамина восстанавливается', () => {
    const { state, rng } = mkBattle('warrior', ['wolf']);
    const hpBefore = state.hero.hp;
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    pass(state, rng);
    // Укус 5, Кольца кольчуги воина гасят 1
    expect(state.hero.hp).toBe(hpBefore - 4);
    expect(state.hero.sta).toBe(3);
    expect(state.phase).toBe('player');
  });

  it('нельзя действовать без стамины', () => {
    const { state, rng } = mkBattle('mage', ['boar']);
    const uid = first(state).uid;
    performAction(state, { type: 'attack', target: uid }, rng);
    performAction(state, { type: 'attack', target: uid }, rng);
    expect(canUseAction(state, { type: 'defend' })).toBe('Нет стамины');
    expect(() => performAction(state, { type: 'attack', target: uid }, rng)).toThrow();
  });

  it('убийство всех врагов — победа', () => {
    const { state, rng } = mkBattle('berserk', ['wolf']);
    const uid = first(state).uid;
    first(state).hp = 4;
    performAction(state, { type: 'attack', target: uid }, rng);
    expect(state.enemies.length).toBe(0);
    expect(state.phase).toBe('won');
    expect(state.stats.kills).toBe(1);
  });

  it('смерть героя — поражение', () => {
    const { state, rng } = mkBattle('mage', ['golem']);
    state.hero.hp = 3;
    pass(state, rng);
    expect(state.hero.hp).toBe(0);
    expect(state.phase).toBe('lost');
  });
});

describe('намерения', () => {
  it('показывают итоговый урон с учётом баффа силы', () => {
    const { state, rng } = mkBattle('warrior', ['wolf']);
    const wolf = first(state);
    expect(computeIntent(wolf)).toMatchObject({ kind: 'attack', label: '5' });
    pass(state, rng, 3); // укус, укус, вой
    expect(getStatus(wolf, 'strength')?.value).toBe(2);
    expect(computeIntent(wolf)).toMatchObject({ kind: 'attack', label: '7' });
  });

  it('вой усиливает всех волков, но не кабана', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'wolf', 'boar']);
    pass(state, rng, 3);
    expect(getStatus(state.enemies[0], 'strength')?.value).toBe(4);
    expect(getStatus(state.enemies[1], 'strength')?.value).toBe(4);
    expect(getStatus(state.enemies[2], 'strength')).toBeUndefined();
  });

  it('множественный удар подписан как N×M, замах — без чисел', () => {
    const { state } = mkBattle('warrior', ['cutthroat', 'minotaur']);
    const e = first(state);
    e.intent = 'double';
    expect(computeIntent(e).label).toBe('3×2');
    const m = state.enemies[1];
    m.intent = 'windup';
    expect(computeIntent(m)).toMatchObject({ kind: 'special', label: '', text: 'Замах' });
  });
});

describe('статусы', () => {
  it('кровотечение тикает 3 хода, стакается и игнорирует блок', () => {
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'bleed_cut', tier: 1 }] });
    const boar = first(state);
    boar.hp = 50;
    boar.maxHp = 50;
    boar.intent = 'bristle';
    performAction(state, { type: 'artifact', artifactId: 'bleed_cut', target: boar.uid }, rng);
    expect(getStatus(boar, 'bleed')).toMatchObject({ value: 3, turns: 3 });
    performAction(state, { type: 'artifact', artifactId: 'bleed_cut', target: boar.uid }, rng);
    expect(getStatus(boar, 'bleed')).toMatchObject({ value: 6, turns: 3 });
    const hp0 = boar.hp;
    pass(state, rng);
    expect(boar.hp).toBe(hp0 - 6);
    pass(state, rng, 2);
    expect(boar.hp).toBe(hp0 - 18);
    expect(getStatus(boar, 'bleed')).toBeUndefined();
  });

  it('оглушение заставляет врага пропустить действие', () => {
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'stun_strike', tier: 1 }] });
    const boar = first(state);
    const hp0 = state.hero.hp;
    performAction(state, { type: 'artifact', artifactId: 'stun_strike', target: boar.uid }, rng);
    expect(getStatus(boar, 'stun')).toBeDefined();
    expect(state.hero.cooldowns.stun_strike).toBe(3);
    pass(state, rng);
    expect(state.hero.hp).toBe(hp0);
    expect(getStatus(boar, 'stun')).toBeUndefined();
    expect(boar.intent).toBe('ram');
    pass(state, rng);
    expect(state.hero.hp).toBe(hp0 - 6); // таран 7, Кольца кольчуги гасят 1
  });

  it('слабость режет урон героя на 25 %', () => {
    const { state, rng } = mkBattle('warrior', ['ghost']);
    pass(state, rng);
    expect(getStatus(state.hero, 'weak')).toBeDefined();
    const ghost = first(state);
    const hp0 = ghost.hp;
    performAction(state, { type: 'attack', target: ghost.uid }, rng);
    expect(ghost.hp).toBe(hp0 - Math.floor(5 * 0.75));
  });

  it('изнурение отнимает стамину на следующем ходу', () => {
    const { state, rng } = mkBattle('warrior', ['bear']);
    first(state).intent = 'hug';
    pass(state, rng);
    expect(state.hero.sta).toBe(2);
    pass(state, rng);
    expect(state.hero.sta).toBe(3);
  });

  it('уклонение героя съедает один удар', () => {
    const { state, rng } = mkBattle('mage', ['cutthroat'], { extra: [{ id: 'dodge', tier: 1 }] });
    first(state).intent = 'double';
    performAction(state, { type: 'artifact', artifactId: 'dodge' }, rng);
    const hp0 = state.hero.hp;
    pass(state, rng);
    expect(state.hero.hp).toBe(hp0 - 3);
    expect(getStatus(state.hero, 'dodge')).toBeUndefined();
  });

  it('шипы героя ранят атакующего', () => {
    const { state, rng } = mkBattle('warrior', ['wolf'], { extra: [{ id: 'thorns', tier: 2 }] });
    pass(state, rng);
    expect(first(state).hp).toBe(12 - 2);
  });

  it('вампирский клык лечит при базовой атаке', () => {
    const { state, rng } = mkBattle('berserk', ['boar'], { extra: [{ id: 'vampire_fang', tier: 1 }] });
    state.hero.hp = state.hero.maxHp - 10;
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    expect(state.hero.hp).toBe(state.hero.maxHp - 9);
  });
});

describe('новые механики врагов', () => {
  it('пробивающая атака игнорирует блок', () => {
    const { state, rng } = mkBattle('warrior', ['goblin']);
    first(state).intent = 'sneak';
    performAction(state, { type: 'defend' }, rng);
    const hp0 = state.hero.hp;
    pass(state, rng);
    expect(state.hero.hp).toBe(hp0 - 4); // 5 сквозь блок, Кольца кольчуги гасят 1
  });

  it('уклонение врага съедает атаку, но не заклинание', () => {
    const { state, rng } = mkBattle('mage', ['bat']);
    const bat = first(state);
    bat.intent = 'flutter';
    pass(state, rng);
    expect(getStatus(bat, 'dodge')).toBeDefined();
    performAction(state, { type: 'attack', target: bat.uid }, rng);
    expect(bat.hp).toBe(9);
    expect(getStatus(bat, 'dodge')).toBeUndefined();
    bat.intent = 'flutter';
    pass(state, rng);
    performAction(state, { type: 'artifact', artifactId: 'fireball', target: bat.uid }, rng);
    // 7 по тиру + 1 к заклинаниям от магического посоха
    expect(bat.hp).toBe(9 - 8);
  });

  it('вампирская атака лечит врага', () => {
    const { state, rng } = mkBattle('warrior', ['vampire']);
    const v = first(state);
    v.hp = 10;
    v.intent = 'bite';
    pass(state, rng);
    expect(v.hp).toBe(18); // укус 9 − 1 Кольца кольчуги = 8 лечения
  });

  it('слизень делится при смерти', () => {
    const { state, rng } = mkBattle('warrior', ['grave_slime']);
    state.hero.stats.dmgMin = 99;
    state.hero.stats.dmgMax = 99;
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    expect(state.phase).toBe('player');
    expect(state.enemies.map((e) => e.defId)).toEqual(['slimelet', 'slimelet']);
  });

  it('лавовый слизень взрывается при смерти', () => {
    const { state, rng } = mkBattle('warrior', ['lava_slime']);
    state.hero.stats.dmgMin = 99;
    state.hero.stats.dmgMax = 99;
    const hp0 = state.hero.hp;
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    expect(state.phase).toBe('won');
    expect(state.hero.hp).toBe(hp0 - 11); // взрыв 12, Кольца кольчуги гасят 1
    expect(getStatus(state.hero, 'burn')?.value).toBe(2);
  });

  it('имп-бомбардир подрывается сам', () => {
    const { state, rng } = mkBattle('warrior', ['kamikaze_imp']);
    first(state).intent = 'boom';
    const hp0 = state.hero.hp;
    pass(state, rng);
    expect(state.hero.hp).toBe(hp0 - 17); // подрыв 18, Кольца кольчуги гасят 1
    expect(state.enemies.length).toBe(0);
    expect(state.phase).toBe('won');
  });

  it('тролль регенерирует только раненым', () => {
    const { state, rng } = mkBattle('warrior', ['troll']);
    const t = first(state);
    expect(t.intent).toBe('club');
    pass(state, rng);
    // здоров — регенерация пропущена, цикл идёт дальше
    expect(t.intent).toBe('club');
    t.hp = 20;
    pass(state, rng);
    expect(t.intent).toBe('stomp');
    pass(state, rng);
    expect(t.intent).toBe('club');
    pass(state, rng);
    expect(t.intent).toBe('regen');
  });

  it('все враги из таблиц встреч существуют', () => {
    const ids = new Set(ENEMY_LIST.map((e) => e.id));
    for (const loc of LOCATIONS) {
      for (const table of Object.values(loc.encounters)) {
        for (const group of table) for (const id of group) expect(ids.has(id), `${loc.id}: ${id}`).toBe(true);
      }
    }
  });
});

describe('мана и артефакты', () => {
  it('огненный шар тратит ману, бьёт по тиру + сила заклинаний, раз в ход', () => {
    const { state, rng } = mkBattle('mage', ['boar'], { extra: [{ id: 'sage_eye', tier: 1 }] });
    const boar = first(state);
    // 10 маги + 2 Резерв посоха
    expect(state.hero.mp).toBe(12);
    performAction(state, { type: 'artifact', artifactId: 'fireball', target: boar.uid }, rng);
    // 7 по тиру + 1 Око мудреца + 1 магический посох
    expect(boar.hp).toBe(18 - 9);
    expect(state.hero.mp).toBe(10);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'fireball', target: boar.uid })).toMatch(/Перезарядка/);
    pass(state, rng);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'fireball', target: boar.uid })).toBeNull();
  });

  it('мана восстанавливается на реген со второго хода', () => {
    const { state, rng } = mkBattle('mage', ['boar']);
    performAction(state, { type: 'artifact', artifactId: 'fireball', target: first(state).uid }, rng);
    expect(state.hero.mp).toBe(10);
    pass(state, rng);
    expect(state.hero.mp).toBe(12);
  });

  it('лечение паладина: стоит ману и стамину, кулдаун 3', () => {
    const { state, rng } = mkBattle('paladin', ['boar']);
    state.hero.hp = 10;
    performAction(state, { type: 'artifact', artifactId: 'heal' }, rng);
    expect(state.hero.hp).toBe(15);
    expect(state.hero.sta).toBe(2);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'heal' })).toMatch(/Перезарядка/);
    pass(state, rng, 3);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'heal' })).toBeNull();
  });

  it('кольцо выносливости даёт стамину только в первый ход', () => {
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'stamina_ring', tier: 2 }] });
    expect(state.hero.sta).toBe(5);
    pass(state, rng);
    expect(state.hero.sta).toBe(3);
  });

  it('кулдаун убывает по ходам', () => {
    const { state, rng } = mkBattle('warrior', ['boar'], { extra: [{ id: 'second_wind', tier: 1 }] });
    performAction(state, { type: 'artifact', artifactId: 'second_wind' }, rng);
    expect(state.hero.sta).toBe(5);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'second_wind' })).toMatch(/Перезарядка/);
    pass(state, rng, 4);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'second_wind' })).toBeNull();
  });

  it('боевой клич: временная сила на два хода и кулдаун', () => {
    const { state, rng } = mkBattle('berserk', ['boar']);
    performAction(state, { type: 'artifact', artifactId: 'war_cry' }, rng);
    expect(getStatus(state.hero, 'strength')?.value).toBe(2);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'war_cry' })).toMatch(/Перезарядка/);
    const boar = first(state);
    performAction(state, { type: 'attack', target: boar.uid }, rng);
    expect(boar.hp).toBe(18 - 6);
    pass(state, rng);
    expect(getStatus(state.hero, 'strength')?.value).toBe(2);
    pass(state, rng);
    expect(getStatus(state.hero, 'strength')).toBeUndefined();
  });

  it('вихрь бьёт всех', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'wolf'], { extra: [{ id: 'whirlwind', tier: 1 }] });
    performAction(state, { type: 'artifact', artifactId: 'whirlwind' }, rng);
    // вихрь бьёт вполсилы: floor(5 × 0.5) = 2
    expect(state.enemies.every((e) => e.hp === 10)).toBe(true);
  });

});

describe('боссы', () => {
  it('взлёт даёт неуязвимость и обязательное пикирование', () => {
    const { state, rng } = mkBattle('warrior', ['dragon']);
    const d = first(state);
    d.intent = 'takeoff';
    pass(state, rng);
    expect(getStatus(d, 'invuln')).toBeDefined();
    expect(d.intent).toBe('dive');
    const hp0 = d.hp;
    performAction(state, { type: 'attack', target: d.uid }, rng);
    expect(d.hp).toBe(hp0);
    const heroHp = state.hero.hp;
    pass(state, rng);
    expect(state.hero.hp).toBe(heroHp - 29); // пике 30, Кольца кольчуги гасят 1
    expect(getStatus(d, 'invuln')).toBeUndefined();
    expect(d.intent).not.toBe('dive');
  });

  it('призыв не превышает лимит поля', () => {
    const { state, rng } = mkBattle('warrior', ['alpha_wolf', 'wolf', 'wolf']);
    first(state).intent = 'howl';
    pass(state, rng);
    expect(state.enemies.length).toBe(3);
  });

  it('вожак призывает волка, если есть место', () => {
    const { state, rng } = mkBattle('warrior', ['alpha_wolf']);
    first(state).intent = 'howl';
    pass(state, rng);
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
      pass(state, rng);
    }
    expect(roars).toBeLessThanOrEqual(2);
    expect(getStatus(d, 'strength')?.value ?? 0).toBeLessThanOrEqual(6);
  });

  it('лич высасывает ману', () => {
    const { state, rng } = mkBattle('mage', ['lich']);
    first(state).intent = 'wither';
    pass(state, rng);
    // 10 базовых + 2 посох, −3 иссушение, +2 реген в начале следующего хода
    expect(state.hero.mp).toBe(12 - 3 + 2);
  });
});

describe('пошаговый ход врагов', () => {
  it('enemyStep обрабатывает по одному врагу', () => {
    const { state, rng } = mkBattle('warrior', ['wolf', 'wolf']);
    const hp0 = state.hero.hp;
    endTurn(state);
    expect(state.phase).toBe('enemy');
    enemyStep(state, rng);
    expect(state.hero.hp).toBe(hp0 - 4); // укус 5, Кольца кольчуги гасят 1
    expect(state.phase).toBe('enemy');
    enemyStep(state, rng);
    expect(state.hero.hp).toBe(hp0 - 8);
    enemyStep(state, rng);
    expect(state.phase).toBe('player');
    expect(state.turn).toBe(2);
  });
});

describe('лучник', () => {
  it('Прицельный выстрел критует даже при нулевом шансе крита', () => {
    const { state, rng } = mkBattle('archer', ['bear']);
    const e = first(state);
    const hp = e.hp;
    performAction(state, { type: 'artifact', artifactId: 'aimed_shot', target: e.uid }, rng);
    // урон лука зафиксирован на 5, бонус тира 1 — +2, Прицел лука — +2 к первому удару, крит ×2
    expect(hp - e.hp).toBe(18);
    expect(state.hero.sta).toBe(1);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'aimed_shot', target: e.uid })).toMatch(/Перезарядка/);
  });

  it('Подсечный выстрел бьёт и вешает Слабость', () => {
    const { state, rng } = mkBattle('archer', ['bear']);
    const e = first(state);
    const hp = e.hp;
    performAction(state, { type: 'artifact', artifactId: 'crippling_shot', target: e.uid }, rng);
    // 5 лука + 2 Прицел первого удара
    expect(hp - e.hp).toBe(7);
    expect(getStatus(e, 'weak')?.turns).toBe(1);
  });
});

describe('призыв волка', () => {
  it('волк появляется рядом, после хода героя кусает самого раненого врага, а враги бьют волка вместо героя', () => {
    const { state, rng } = mkBattle('mage', ['wolf', 'rat'], { extra: [{ id: 'wolf_whistle', tier: 1 }] });
    performAction(state, { type: 'artifact', artifactId: 'wolf_whistle' }, rng);
    expect(state.allies.map((a) => a.name)).toEqual(['Волк']);
    expect(state.allies[0].hp).toBe(12);
    const heroHp = state.hero.hp;
    pass(state, rng);
    // укус 5 по крысе (7 HP) — самому раненому
    expect(state.enemies.find((e) => e.defId === 'rat')!.hp).toBe(2);
    // волк 5 + крыса 3 пришлись на союзника
    expect(state.hero.hp).toBe(heroHp);
    expect(state.allies[0].hp).toBe(12 - 5 - 3);
  });

  it('павший волк исчезает, удары снова идут в героя', () => {
    const { state, rng } = mkBattle('mage', ['wolf'], { extra: [{ id: 'wolf_whistle', tier: 1 }] });
    performAction(state, { type: 'artifact', artifactId: 'wolf_whistle' }, rng);
    state.allies[0].hp = 1;
    const heroHp = state.hero.hp;
    pass(state, rng);
    expect(state.allies).toEqual([]);
    expect(state.hero.hp).toBe(heroHp);
    pass(state, rng);
    expect(state.hero.hp).toBeLessThan(heroHp);
  });

  it('рядом помещаются два волка, третьему нет места', () => {
    const { state, rng } = mkBattle('mage', ['bear'], { extra: [{ id: 'wolf_whistle', tier: 3 }] });
    for (let i = 0; i < 2; i++) {
      state.hero.cooldowns = {};
      state.hero.mp = 10;
      performAction(state, { type: 'artifact', artifactId: 'wolf_whistle' }, rng);
    }
    state.hero.cooldowns = {};
    state.hero.mp = 10;
    expect(state.allies.length).toBe(2);
    expect(state.allies[0].maxHp).toBe(20);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'wolf_whistle' })).toMatch(/места/);
  });
});

describe('перки брони', () => {
  /** Герой со стартовой экипировкой, но с другой базой брони нужного тира. */
  function mkArmorBattle(heroId: string, base: string, enemies: string[], tier: GearTier = 1) {
    const rng = createRng(1);
    const hero = mkHero(heroId);
    hero.armor.base = base;
    hero.armor.tier = tier;
    const state = createBattle(heroDef(heroId), hero, enemies, rng);
    state.hero.stats.crit = 0;
    return { state, rng };
  }

  it('кольчуга: каждый удар слабее на 1, с 4 тира — на 2', () => {
    const t1 = mkArmorBattle('warrior', 'mail', ['wolf']);
    const hp1 = t1.state.hero.hp;
    pass(t1.state, t1.rng);
    expect(t1.state.hero.hp).toBe(hp1 - 4);
    const t4 = mkArmorBattle('warrior', 'mail', ['wolf'], 4);
    const hp4 = t4.state.hero.hp;
    pass(t4.state, t4.rng);
    expect(t4.state.hero.hp).toBe(hp4 - 3);
  });

  it('латы: «Защититься» даёт блок сверх DEF', () => {
    const { state, rng } = mkArmorBattle('warrior', 'plate', ['wolf'], 3);
    performAction(state, { type: 'defend' }, rng);
    expect(state.hero.block).toBe(Math.ceil((state.hero.stats.def + 2) * 0.8));
  });

  it('панцирь: часть блока переживает начало хода', () => {
    const { state, rng } = mkArmorBattle('warrior', 'shell', ['wolf']);
    performAction(state, { type: 'defend' }, rng);
    // 7 блока − укус 5 = 2, до 2 остаются на следующий ход
    pass(state, rng);
    expect(state.hero.block).toBe(2);
  });

  it('роба: заклинание даёт блок', () => {
    const { state, rng } = mkArmorBattle('mage', 'robe', ['boar']);
    performAction(state, { type: 'artifact', artifactId: 'fireball', target: first(state).uid }, rng);
    expect(state.hero.block).toBe(1);
  });

  it('плащ: первая атака врага в бою промахивается', () => {
    const { state, rng } = mkArmorBattle('archer', 'cloak', ['wolf']);
    expect(getStatus(state.hero, 'dodge')?.value).toBe(1);
    const hp = state.hero.hp;
    pass(state, rng);
    expect(state.hero.hp).toBe(hp);
    expect(getStatus(state.hero, 'dodge')).toBeUndefined();
    pass(state, rng);
    expect(state.hero.hp).toBeLessThan(hp);
  });

  it('доспех: лишняя стамина только в первый ход', () => {
    const { state, rng } = mkArmorBattle('archer', 'harness', ['boar']);
    expect(state.hero.sta).toBe(state.hero.maxSta + 1);
    pass(state, rng);
    expect(state.hero.sta).toBe(state.hero.maxSta);
  });
});

describe('ассасин: скрытность', () => {
  it('входит в бой в тени: враг промахивается, удар из тени — крит с бонусом стилета и снимает скрытность', () => {
    const { state, rng } = mkBattle('assassin', ['bear']);
    expect(getStatus(state.hero, 'stealth')?.turns).toBe(2);
    const hp = state.hero.hp;
    pass(state, rng);
    expect(state.hero.hp).toBe(hp);
    expect(getStatus(state.hero, 'stealth')?.turns).toBe(1);
    const bear = first(state);
    performAction(state, { type: 'attack', target: bear.uid }, rng);
    // стилет 5, Удар в спину +3, крит ×2
    expect(bear.hp).toBe(35 - 16);
    expect(getStatus(state.hero, 'stealth')).toBeUndefined();
  });

  it('дымовая шашка съедает всю стамину на 1 тире и стоит 1 STA на 3 тире', () => {
    const t1 = mkBattle('warrior', ['bear'], { extra: [{ id: 'smoke_bomb', tier: 1 }] });
    performAction(t1.state, { type: 'artifact', artifactId: 'smoke_bomb' }, t1.rng);
    expect(t1.state.hero.sta).toBe(0);
    expect(getStatus(t1.state.hero, 'stealth')?.turns).toBe(2);
    const t3 = mkBattle('warrior', ['bear'], { extra: [{ id: 'smoke_bomb', tier: 3 }] });
    performAction(t3.state, { type: 'artifact', artifactId: 'smoke_bomb' }, t3.rng);
    expect(t3.state.hero.sta).toBe(2);
    expect(getStatus(t3.state.hero, 'stealth')?.turns).toBe(3);
  });

  it('яд тикает в начале хода врага и бросок не выдаёт героя', () => {
    const { state, rng } = mkBattle('assassin', ['bear']);
    const bear = first(state);
    performAction(state, { type: 'artifact', artifactId: 'poison_vial', target: bear.uid }, rng);
    expect(getStatus(bear, 'poison')).toMatchObject({ value: 2, turns: 4 });
    expect(getStatus(state.hero, 'stealth')).toBeDefined();
    const hp = state.hero.hp;
    pass(state, rng);
    expect(bear.hp).toBe(35 - 2);
    expect(state.hero.hp).toBe(hp);
  });

  it('шашка первого тира требует полной стамины', () => {
    const { state, rng } = mkBattle('warrior', ['bear'], { extra: [{ id: 'smoke_bomb', tier: 1 }] });
    performAction(state, { type: 'attack', target: first(state).uid }, rng);
    expect(canUseAction(state, { type: 'artifact', artifactId: 'smoke_bomb' })).toMatch(/вся стамина/);
  });
});

describe('зелья', () => {
  it('без зелья кнопка недоступна, с зельем — бесплатна: стамина не тратится, слот пустеет', () => {
    const empty = mkBattle('warrior', ['rat']);
    expect(canUseAction(empty.state, { type: 'potion' })).toMatch(/Нет зелья/);

    const { state, rng } = mkBattle('warrior', ['rat'], { potion: 'heal_potion' });
    state.hero.hp = 10;
    const sta = state.hero.sta;
    expect(canUseAction(state, { type: 'potion' })).toBeNull();
    performAction(state, { type: 'potion' }, rng);
    expect(state.hero.hp).toBe(25);
    expect(state.hero.sta).toBe(sta);
    expect(state.hero.attacks).toBe(0);
    expect(state.hero.potion).toBeNull();
    expect(canUseAction(state, { type: 'potion' })).toMatch(/Нет зелья/);
    expect(() => performAction(state, { type: 'potion' }, rng)).toThrow();
  });

  it('лечение не сверх максимума, мана не сверх максимума, бодрость даёт стамину', () => {
    const heal = mkBattle('warrior', ['rat'], { potion: 'heal_potion' });
    heal.state.hero.hp = heal.state.hero.maxHp - 3;
    performAction(heal.state, { type: 'potion' }, heal.rng);
    expect(heal.state.hero.hp).toBe(heal.state.hero.maxHp);

    const mana = mkBattle('mage', ['rat'], { potion: 'mana_potion' });
    mana.state.hero.mp = 2;
    performAction(mana.state, { type: 'potion' }, mana.rng);
    expect(mana.state.hero.mp).toBe(Math.min(mana.state.hero.maxMp, 8));

    const sta = mkBattle('warrior', ['rat'], { potion: 'stamina_potion' });
    const before = sta.state.hero.sta;
    performAction(sta.state, { type: 'potion' }, sta.rng);
    expect(sta.state.hero.sta).toBe(before + 2);
  });

  it('склянка бьёт всех врагов заклинанием и выводит из скрытности, противоядие снимает раны', () => {
    const { state, rng } = mkBattle('assassin', ['rat', 'rat'], { potion: 'fire_flask' });
    state.hero.stats.spellPower = 0;
    const hp = state.enemies.map((e) => e.hp);
    expect(getStatus(state.hero, 'stealth')).toBeTruthy();
    performAction(state, { type: 'potion' }, rng);
    for (const [i, e] of state.enemies.entries()) expect(e.hp).toBe(Math.max(0, hp[i] - 8));
    expect(getStatus(state.hero, 'stealth')).toBeUndefined();

    const cure = mkBattle('warrior', ['rat'], { potion: 'antidote' });
    cure.state.hero.statuses.push({ id: 'bleed', value: 3, turns: 2 }, { id: 'weak', value: 1, turns: 2 }, { id: 'strength', value: 2, turns: -1 });
    performAction(cure.state, { type: 'potion' }, cure.rng);
    expect(getStatus(cure.state.hero, 'bleed')).toBeUndefined();
    expect(getStatus(cure.state.hero, 'weak')).toBeUndefined();
    expect(getStatus(cure.state.hero, 'strength')?.value).toBe(2);
  });

  it('зелье силы держится до конца боя, каменная кожа даёт блок', () => {
    const str = mkBattle('warrior', ['rat'], { potion: 'strength_potion' });
    str.state.hero.stats.dmgMin = 5;
    str.state.hero.stats.dmgMax = 5;
    str.state.hero.stats.str = 0;
    performAction(str.state, { type: 'potion' }, str.rng);
    expect(getStatus(str.state.hero, 'strength')).toEqual({ id: 'strength', value: 3, turns: -1 });
    expect(previewAttack(str.state)).toEqual({ min: 8, max: 8 });

    const skin = mkBattle('warrior', ['rat'], { potion: 'stone_skin' });
    performAction(skin.state, { type: 'potion' }, skin.rng);
    expect(skin.state.hero.block).toBe(10);
  });
});
