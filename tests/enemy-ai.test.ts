import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { heroDef } from '../src/data/heroes';
import { makeStartingGear } from '../src/data/gear';
import { ENEMY_LIST, enemyDef } from '../src/data/enemies';
import {
  ENRAGE_STEP,
  ENRAGE_TURN,
  computeIntent,
  coveringGuard,
  createBattle,
  endTurn,
  enemyStep,
  getStatus,
  orderByRole,
  performAction,
  resolveEnemyTurn,
} from '../src/engine/combat';
import type { BattleState, HeroPersistent } from '../src/engine/types';

// Фаза 5 реворка (v0.46): ИИ по приоритету, роли и ряд, замах, реакции-проверки сборок, ярость затянувшегося боя.

/** Маг в мантии: без кольчуги, числа врагов доходят до HP как есть. Урон посоха зафиксирован на среднем. */
function mkBattle(enemies: string[], heroId = 'mage') {
  const def = heroDef(heroId);
  const gear = makeStartingGear(def);
  const mid = Math.round((gear.weapon.dmgMin + gear.weapon.dmgMax) / 2);
  gear.weapon.dmgMin = mid;
  gear.weapon.dmgMax = mid;
  const hero: HeroPersistent = { defId: heroId, signature: def.signatures[0], innateTier: 1, trait: def.traits[0], hp: 999, weapon: gear.weapon, armor: gear.armor, potion: null };
  const rng = createRng(1);
  const state = createBattle(def, hero, enemies, rng);
  state.hero.stats.crit = 0;
  state.hero.stats.hitReduce = 0;
  return { state, rng };
}

const pass = (state: BattleState, rng: ReturnType<typeof createRng>) => {
  endTurn(state);
  resolveEnemyTurn(state, rng);
};

const ids = (state: BattleState) => state.enemies.map((e) => e.defId);

describe('роли и ряд (v0.46)', () => {
  it('у каждого рядового и элиты есть роль; у боссов и воров — нет', () => {
    for (const e of ENEMY_LIST) {
      const thief = e.id.startsWith('gnome_');
      if (e.rank === 'boss' || thief) expect(e.role, e.id).toBeUndefined();
      else expect(e.role, e.id).toBeDefined();
    }
  });

  it('ряд строится по ролям: страж и громила впереди, стрелок и поддержка сзади, внутри роли — порядок встречи', () => {
    expect(orderByRole(['goblin_shaman', 'goblin'])).toEqual(['goblin', 'goblin_shaman']);
    expect(orderByRole(['bandit_archer', 'wolf', 'cutthroat', 'wolf'])).toEqual(['cutthroat', 'wolf', 'wolf', 'bandit_archer']);
    const { state } = mkBattle(['goblin_shaman', 'goblin']);
    expect(ids(state)).toEqual(['goblin', 'goblin_shaman']);
    expect(state.roster).toEqual(['Гоблин', 'Гоблин-шаман']);
  });

  it('страж принимает на себя первый удар за ход по соседу за спиной, второй проходит', () => {
    const { state, rng } = mkBattle(['goblin', 'goblin_shaman'], 'archer');
    const [goblin, shaman] = state.enemies;
    expect(coveringGuard(state, shaman)).toBe(goblin);
    const g0 = goblin.hp;
    const s0 = shaman.hp;
    performAction(state, { type: 'attack', target: shaman.uid }, rng);
    expect(goblin.hp).toBeLessThan(g0);
    expect(shaman.hp).toBe(s0);
    expect(state.log.some((l) => l.includes('Гоблин заслоняет Гоблин-шаман'))).toBe(true);
    // Заслон — пояснение к удару (v0.51): строкой сразу под ним, а заголовок шага — сам удар.
    const strike = state.log.findIndex((l) => l.startsWith('Герой бьёт Гоблин:'));
    expect(state.log[strike + 1]).toBe('Гоблин заслоняет Гоблин-шаман');
    expect(state.logMarks[strike]).toBe('H');
    expect(state.logMarks[strike + 1]).toBe('h');
    expect(coveringGuard(state, shaman)).toBeNull();
    performAction(state, { type: 'attack', target: shaman.uid }, rng);
    expect(shaman.hp).toBeLessThan(s0);
    // Новый ход — страж снова готов.
    pass(state, rng);
    expect(coveringGuard(state, shaman)).toBe(goblin);
  });

  it('оглушённый страж не прикрывает', () => {
    const { state } = mkBattle(['goblin', 'goblin_shaman'], 'archer');
    const [goblin, shaman] = state.enemies;
    goblin.statuses.push({ id: 'stun', value: 1, turns: 1 });
    expect(coveringGuard(state, shaman)).toBeNull();
  });

  it('громила впереди ряда раз за бой получает Силу; второй раз — нет', () => {
    const { state, rng } = mkBattle(['boar', 'rat']);
    const boar = state.enemies[0];
    expect(getStatus(boar, 'strength')?.value).toBe(2);
    expect(boar.fronted).toBe(true);
    pass(state, rng);
    expect(getStatus(boar, 'strength')?.value).toBe(2);
    // Громила сзади Силы не получает, пока не встанет первым.
    const back = mkBattle(['goblin', 'boar']);
    expect(getStatus(back.state.enemies[1], 'strength')).toBeUndefined();
  });

  it('стрелок первым в ряду бьёт в упор вполсилы и отходит назад; один на поле — бьёт как обычно', () => {
    const { state, rng } = mkBattle(['rat', 'bandit_archer']);
    state.enemies.reverse();
    const archer = state.enemies[0];
    archer.intent = 'shoot';
    expect(computeIntent(archer, state).label).toBe('2');
    expect(computeIntent(archer, state).text).toContain('В упор');
    const hp0 = state.hero.hp;
    endTurn(state);
    enemyStep(state, rng);
    expect(state.hero.hp).toBe(hp0 - 2);
    expect(ids(state)).toEqual(['rat', 'bandit_archer']);
    const solo = mkBattle(['bandit_archer']);
    solo.state.enemies[0].intent = 'shoot';
    expect(computeIntent(solo.state.enemies[0], solo.state).label).toBe('4');
  });

  it('поддержка лечит только соседей по ряду', () => {
    const { state, rng } = mkBattle(['wolf', 'wolf', 'goblin_shaman']);
    const [far, near, shaman] = state.enemies;
    far.hp = 2;
    near.hp = 2;
    shaman.intent = 'mend';
    pass(state, rng);
    expect(near.hp).toBeGreaterThan(2);
    // Дальний волк не сосед шамана: его здоровье меняет только его собственный ход (он кусает, а не лечится).
    expect(far.hp).toBe(2);
  });
});

describe('ИИ по приоритету (v0.46)', () => {
  it('реакция на блок героя: пробой вместо круга, причина видна в намерении', () => {
    const { state, rng } = mkBattle(['cutthroat']);
    const e = state.enemies[0];
    expect(e.intent).toBe('strike');
    state.hero.block = 30;
    pass(state, rng);
    expect(e.intent).toBe('crack');
    expect(e.reason).toBe('у героя Блок ≥ 5');
    expect(computeIntent(e, state).text).toContain('Реакция: у героя Блок ≥ 5');
    expect(computeIntent(e, state).marks).toContain('pierce');
  });

  it('реакция не сдвигает круг: после неё враг продолжает с того же места', () => {
    const { state, rng } = mkBattle(['cutthroat']);
    const e = state.enemies[0];
    pass(state, rng); // strike → следующее double
    expect(e.intent).toBe('double');
    state.hero.block = 30;
    pass(state, rng); // double; блок ещё висит — реакция
    expect(e.intent).toBe('crack');
    state.hero.block = 0;
    pass(state, rng); // crack (перезарядка 2) → круг дальше: guard
    expect(e.intent).toBe('guard');
  });

  it('очищение ран: раз за бой снимает Кровотечение, Горение и Яд', () => {
    const { state, rng } = mkBattle(['goblin']);
    const g = state.enemies[0];
    g.hp = 999;
    g.maxHp = 999;
    g.statuses.push({ id: 'bleed', value: 3, turns: 5 });
    pass(state, rng);
    expect(g.intent).toBe('lick');
    g.statuses.push({ id: 'poison', value: 2, turns: 5 });
    pass(state, rng);
    expect(getStatus(g, 'bleed')).toBeUndefined();
    expect(getStatus(g, 'poison')).toBeUndefined();
    expect(state.log.some((l) => l.includes('Гоблин очищается'))).toBe(true);
    // Второй раз — нет: реакция одноразовая.
    g.statuses.push({ id: 'bleed', value: 5, turns: 5 });
    pass(state, rng);
    expect(g.intent).not.toBe('lick');
  });

  it('«прислушаться»: снимает тень героя до удара, и удар доходит', () => {
    const { state, rng } = mkBattle(['spider']);
    const sp = state.enemies[0];
    state.hero.statuses.push({ id: 'stealth', value: 1, turns: 2 });
    pass(state, rng);
    expect(sp.intent).toBe('listen');
    state.hero.statuses.push({ id: 'stealth', value: 1, turns: 2 });
    const hp0 = state.hero.hp;
    pass(state, rng);
    expect(state.hero.hp).toBe(hp0 - 4);
    expect(state.log.some((l) => l.includes('слышит героя'))).toBe(true);
  });

  it('мана-пиявка против заклинаний: при мане героя — «Выпить чары»', () => {
    const { state, rng } = mkBattle(['wraith']);
    const w = state.enemies[0];
    // Маг входит в бой с полной маной — Тень сразу тянется к ней.
    expect(w.intent).toBe('sip');
    const mp0 = state.hero.mp;
    pass(state, rng);
    expect(state.hero.mp).toBe(Math.min(state.hero.maxMp, mp0 - 3 + state.hero.stats.mpRegen));
    // Перезарядка 2 — не два хода подряд: следующий ход свой круг, дальше снова можно пить.
    expect(w.intent).toBe('blade');
    state.hero.mp = state.hero.maxMp;
    pass(state, rng);
    expect(w.intent).toBe('sip');
  });

  it('«остался один» — только у того, кто начинал бой не один', () => {
    const solo = mkBattle(['wolf']);
    expect(solo.state.enemies[0].intent).toBe('bite');
    const { state, rng } = mkBattle(['wolf', 'rat']);
    state.enemies[1].hp = 0;
    state.enemies = [state.enemies[0]];
    pass(state, rng);
    expect(state.enemies[0].intent).toBe('last');
  });
});

describe('замах (v0.46)', () => {
  it('пустой ход с предупреждением, следующим — тяжёлый удар; круг потом продолжается', () => {
    const { state, rng } = mkBattle(['boar']);
    const b = state.enemies[0];
    b.intent = 'dig';
    b.cycleIdx = 2;
    const info = computeIntent(b, state);
    expect(info.kind).toBe('special');
    expect(info.text).toContain('следующим ходом — Разгон: Атака 14');
    const hp0 = state.hero.hp;
    pass(state, rng);
    expect(state.hero.hp).toBe(hp0);
    expect(b.intent).toBe('charge');
    pass(state, rng);
    expect(state.hero.hp).toBe(hp0 - 14); // 12 + Сила громилы 2
    expect(b.intent).toBe('ram');
  });

  it('у каждого замаха есть куда ударить', () => {
    for (const def of ENEMY_LIST) {
      for (const a of def.actions) if (a.next) expect(def.actions.some((x) => x.id === a.next), `${def.id}.${a.id}`).toBe(true);
    }
  });

  it('правила ИИ ссылаются только на свои приёмы', () => {
    for (const def of ENEMY_LIST) {
      if (def.ai.type === 'boss') continue;
      const own = new Set(def.actions.map((a) => a.id));
      for (const id of def.ai.order) expect(own.has(id), `${def.id}: ${id}`).toBe(true);
      if (def.ai.type === 'priority') for (const r of def.ai.rules) expect(own.has(r.action), `${def.id}: ${r.action}`).toBe(true);
    }
  });
});

describe('ярость затянувшегося боя (v0.46)', () => {
  it('с хода ярости урон врагов растёт на шаг за ход; порог — по самому сильному рангу боя', () => {
    const { state, rng } = mkBattle(['wolf']);
    expect(state.enrageAt).toBe(ENRAGE_TURN.normal);
    expect(mkBattle(['wolf', 'bear']).state.enrageAt).toBe(ENRAGE_TURN.elite);
    const w = state.enemies[0];
    state.turn = ENRAGE_TURN.normal;
    w.intent = 'bite';
    expect(computeIntent(w, state).label).toBe(`${Math.round(5 * (1 + ENRAGE_STEP))}`);
    const hp0 = state.hero.hp;
    pass(state, rng);
    expect(state.hero.hp).toBe(hp0 - Math.round(5 * (1 + ENRAGE_STEP)));
    expect(enemyDef('wolf').rank).toBe('normal');
  });
});
